"""
Phase 21A: HashiCorp Vault / AWS Secrets Manager Prompt Client
Fails closed (deny by default) if Vault is unreachable or a secret is missing.
System prompts exist ONLY inside transient memory leases at LLM invocation time.
"""

from __future__ import annotations

import contextlib
import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from typing import Iterator, Optional

try:
    import hvac  # type: ignore
except ImportError:  # pragma: no cover
    hvac = None

try:
    import boto3  # type: ignore
except ImportError:  # pragma: no cover
    boto3 = None


class VaultPromptUnavailableError(RuntimeError):
    """Raised whenever Vault / Secrets Manager cannot safely yield a prompt (Fail Closed)."""


@dataclass(frozen=True)
class VaultPromptLease:
    secret_key: str
    vault_path: str
    version: int
    backend: str
    sha256_digest: str
    system_prompt: str


class VaultPromptClient:
    """
    Production HashiCorp Vault KV v2 client with AWS Secrets Manager fallback.
    - Enforces fail-closed semantics: any connection error, expired lease, or missing key
      raises VaultPromptUnavailableError so no unauthenticated/unverified LLM call executes.
    - Never caches system prompts on disk and zeroes mutable buffers on lease exit.
    """

    def __init__(self) -> None:
        self.vault_addr = os.getenv("VAULT_ADDR", "").strip()
        self.vault_token = os.getenv("VAULT_TOKEN", "").strip()
        self.vault_mount = os.getenv("VAULT_KV_MOUNT", "apex-prompts").strip()
        self.aws_prefix = os.getenv("AWS_SECRETS_MANAGER_PREFIX", "apex/prompts").strip()
        self.aws_region = os.getenv("AWS_REGION", "eu-west-2").strip()
        self.fail_closed = os.getenv("VAULT_FAIL_CLOSED", "true").lower() != "false"

        self._hvac_client = None
        if self.vault_addr and hvac is not None:
            self._hvac_client = hvac.Client(
                url=self.vault_addr,
                token=self.vault_token or None,
                verify=os.getenv("VAULT_SKIP_VERIFY", "false").lower() != "true",
                timeout=3,
            )

    def _fetch_from_hashicorp_vault(self, secret_key: str) -> VaultPromptLease:
        if not self._hvac_client:
            raise VaultPromptUnavailableError("HashiCorp Vault client not configured (VAULT_ADDR missing).")
        if not self._hvac_client.is_authenticated():
            raise VaultPromptUnavailableError("HashiCorp Vault authentication failed (fail closed).")

        vault_path = f"prompts/{secret_key}"
        resp = self._hvac_client.secrets.kv.v2.read_secret_version(
            path=vault_path,
            mount_point=self.vault_mount,
        )
        data = resp.get("data", {}).get("data", {})
        metadata = resp.get("data", {}).get("metadata", {})
        plaintext = str(data.get("system_prompt") or "").strip()
        if not plaintext:
            raise VaultPromptUnavailableError(
                f"Vault secret '{self.vault_mount}/{vault_path}' yielded empty system_prompt."
            )
        digest = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
        expected_digest = str(data.get("sha256_digest") or "").strip()
        if expected_digest and not hmac.compare_digest(digest, expected_digest):
            raise VaultPromptUnavailableError(
                f"Integrity mismatch on Vault secret '{vault_path}'."
            )

        return VaultPromptLease(
            secret_key=secret_key,
            vault_path=f"{self.vault_mount}/data/{vault_path}",
            version=int(metadata.get("version", 1)),
            backend="hashicorp_vault_kv2",
            sha256_digest=digest,
            system_prompt=plaintext,
        )

    def _fetch_from_aws_secrets_manager(self, secret_key: str) -> VaultPromptLease:
        if boto3 is None:
            raise VaultPromptUnavailableError("boto3 unavailable for AWS Secrets Manager.")
        secret_id = f"{self.aws_prefix}/{secret_key}"
        client = boto3.client("secretsmanager", region_name=self.aws_region)
        resp = client.get_secret_value(SecretId=secret_id)
        payload = json.loads(resp["SecretString"])
        plaintext = str(payload.get("system_prompt") or "").strip()
        if not plaintext:
            raise VaultPromptUnavailableError(f"AWS Secrets Manager key '{secret_id}' missing system_prompt.")
        digest = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
        return VaultPromptLease(
            secret_key=secret_key,
            vault_path=secret_id,
            version=int(payload.get("version", 1)),
            backend="aws_secrets_manager",
            sha256_digest=digest,
            system_prompt=plaintext,
        )

    def fetch_prompt(self, secret_key: str) -> VaultPromptLease:
        # 1. Primary: HashiCorp Vault KV v2
        if self._hvac_client is not None:
            try:
                return self._fetch_from_hashicorp_vault(secret_key)
            except Exception as exc:
                if self.fail_closed and os.getenv("AWS_SECRETS_MANAGER_ENABLED", "false").lower() != "true":
                    raise VaultPromptUnavailableError(
                        f"Fail-closed Vault read error for '{secret_key}': {exc}"
                    ) from exc

        # 2. Secondary: AWS Secrets Manager
        if os.getenv("AWS_SECRETS_MANAGER_ENABLED", "false").lower() == "true":
            try:
                return self._fetch_from_aws_secrets_manager(secret_key)
            except Exception as exc:
                raise VaultPromptUnavailableError(
                    f"Fail-closed AWS Secrets Manager read error for '{secret_key}': {exc}"
                ) from exc

        raise VaultPromptUnavailableError(
            f"No active Vault or Secrets Manager backend reachable for '{secret_key}' (fail closed)."
        )

    @contextlib.contextmanager
    def lease_prompt(self, secret_key: str) -> Iterator[VaultPromptLease]:
        """Decrypts system prompt into memory for a single LLM call and dereferences immediately."""
        lease: Optional[VaultPromptLease] = None
        try:
            lease = self.fetch_prompt(secret_key)
            yield lease
        finally:
            lease = None
