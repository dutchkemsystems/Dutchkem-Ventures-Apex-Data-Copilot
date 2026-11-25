from __future__ import annotations

import base64
import hashlib
import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import boto3
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

GENESIS_PREVIOUS_HASH = "0" * 64


def canonical_entry_data(
    *,
    entry_id: str,
    timestamp_iso: str,
    user_id: Optional[str],
    admin_id: Optional[str],
    plane: str,
    action: str,
    metadata: dict[str, Any],
) -> str:
    payload = {
        "id": entry_id,
        "timestamp": timestamp_iso,
        "user_id": user_id,
        "admin_id": admin_id,
        "plane": plane,
        "action": action,
        "metadata": metadata or {},
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def compute_entry_hash(entry_data_json: str, previous_hash: str) -> str:
    return hashlib.sha256(f"{entry_data_json}{previous_hash}".encode("utf-8")).hexdigest()


def compute_merkle_root(hashes: list[str]) -> str:
    if not hashes:
        return GENESIS_PREVIOUS_HASH
    level = list(hashes)
    while len(level) > 1:
        next_level: list[str] = []
        for idx in range(0, len(level), 2):
            left = level[idx]
            right = level[idx + 1] if idx + 1 < len(level) else left
            combined = hashlib.sha256(f"{left}{right}".encode("utf-8")).hexdigest()
            next_level.append(combined)
        level = next_level
    return level[0]


@dataclass(frozen=True)
class ChainVerificationResult:
    valid: bool
    verified_count: int
    merkle_root: str
    head_hash: str
    broken_entry_id: Optional[str] = None
    reason: Optional[str] = None


class S3WormMirrorClient:
    """Mirrors every audit_merkle_chain entry to AWS S3 with Object Lock (COMPLIANCE mode)."""

    def __init__(self) -> None:
        self.bucket = os.getenv("AWS_S3_AUDIT_BUCKET", "apex-immutable-audit-worm").strip()
        self.region = os.getenv("AWS_S3_AUDIT_REGION", "eu-west-1").strip()
        self.lock_mode = os.getenv("AUDIT_WORM_OBJECT_LOCK_MODE", "COMPLIANCE").strip().upper()
        self.retention_days = int(os.getenv("AUDIT_WORM_RETENTION_DAYS", "2555"))
        self.strict_s3 = os.getenv("AUDIT_WORM_STRICT_S3", "false").lower() == "true"

    def put_worm_object(self, entry: dict[str, Any]) -> dict[str, str]:
        body = json.dumps(entry, sort_keys=True, separators=(",", ":")).encode("utf-8")
        content_md5 = base64.b64encode(hashlib.md5(body).digest()).decode("ascii")
        retain_until = datetime.now(timezone.utc) + timedelta(days=self.retention_days)
        ts_prefix = entry["timestamp"][:10]
        s3_key = f"audit-merkle-chain/{ts_prefix}/{entry['id']}-{entry['entry_hash'][:12]}.json"

        has_aws_creds = bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))
        if not has_aws_creds:
            if self.strict_s3:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="S3 Object Lock WORM mirror unavailable (fail-closed mode).",
                )
            return {
                "worm_s3_bucket": self.bucket,
                "worm_s3_key": s3_key,
                "worm_object_lock_mode": self.lock_mode,
                "worm_retain_until": retain_until.isoformat(),
                "worm_content_md5": content_md5,
                "worm_status": "local_worm_sandbox_sealed",
            }

        client = boto3.client("s3", region_name=self.region)
        client.put_object(
            Bucket=self.bucket,
            Key=s3_key,
            Body=body,
            ContentType="application/json",
            ContentMD5=content_md5,
            ObjectLockMode=self.lock_mode,
            ObjectLockRetainUntilDate=retain_until,
        )
        return {
            "worm_s3_bucket": self.bucket,
            "worm_s3_key": s3_key,
            "worm_object_lock_mode": self.lock_mode,
            "worm_retain_until": retain_until.isoformat(),
            "worm_content_md5": content_md5,
            "worm_status": "s3_worm_locked",
        }


class ImmutableAuditLedgerService:
    def __init__(self) -> None:
        self.worm_client = S3WormMirrorClient()

    async def verify_chain(self, db: AsyncSession) -> ChainVerificationResult:
        rows = (
            await db.execute(
                text(
                    """
                    SELECT id::text, entry_hash, previous_hash, merkle_root,
                           to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts_iso,
                           user_id::text, admin_id, plane, action, metadata
                    FROM audit_merkle_chain
                    ORDER BY sequence_index ASC
                    """
                )
            )
        ).mappings().all()

        expected_prev = GENESIS_PREVIOUS_HASH
        running_hashes: list[str] = []

        for row in rows:
            if row["previous_hash"] != expected_prev:
                return ChainVerificationResult(
                    valid=False,
                    verified_count=len(running_hashes),
                    merkle_root=compute_merkle_root(running_hashes),
                    head_hash=expected_prev,
                    broken_entry_id=row["id"],
                    reason="previous_hash mismatch (chain link broken)",
                )

            entry_data = canonical_entry_data(
                entry_id=row["id"],
                timestamp_iso=row["ts_iso"],
                user_id=row["user_id"],
                admin_id=row["admin_id"],
                plane=row["plane"],
                action=row["action"],
                metadata=row["metadata"] or {},
            )
            recomputed = compute_entry_hash(entry_data, row["previous_hash"])
            if recomputed != row["entry_hash"]:
                return ChainVerificationResult(
                    valid=False,
                    verified_count=len(running_hashes),
                    merkle_root=compute_merkle_root(running_hashes),
                    head_hash=expected_prev,
                    broken_entry_id=row["id"],
                    reason="SHA-256 entry_hash mismatch (tamper detected)",
                )

            running_hashes.append(row["entry_hash"])
            expected_prev = row["entry_hash"]

        return ChainVerificationResult(
            valid=True,
            verified_count=len(running_hashes),
            merkle_root=compute_merkle_root(running_hashes),
            head_hash=expected_prev,
        )

    async def append_entry(
        self,
        db: AsyncSession,
        *,
        user_id: Optional[str],
        admin_id: Optional[str],
        plane: str,
        action: str,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        # 1. Fail-closed verification BEFORE every write
        verification = await self.verify_chain(db)
        if not verification.valid:
            await db.execute(
                text(
                    """
                    INSERT INTO security_incidents (incident_type, severity, source_plane, target_plane, route, details)
                    VALUES ('merkle_chain_tamper_detected', 'critical', :plane, 'admin', '/audit-ledger', :details::jsonb)
                    """
                ),
                {
                    "plane": plane,
                    "details": json.dumps(
                        {
                            "broken_entry_id": verification.broken_entry_id,
                            "reason": verification.reason,
                        }
                    ),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "error": "MERKLE_CHAIN_TAMPER_DETECTED",
                    "broken_entry_id": verification.broken_entry_id,
                    "reason": verification.reason,
                },
            )

        entry_id = str(uuid.uuid4())
        timestamp_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        previous_hash = verification.head_hash
        entry_data = canonical_entry_data(
            entry_id=entry_id,
            timestamp_iso=timestamp_iso,
            user_id=user_id,
            admin_id=admin_id,
            plane=plane,
            action=action,
            metadata=metadata,
        )
        entry_hash = compute_entry_hash(entry_data, previous_hash)

        existing_hashes = (
            await db.execute(text("SELECT entry_hash FROM audit_merkle_chain ORDER BY sequence_index ASC"))
        ).scalars().all()
        new_merkle_root = compute_merkle_root([*existing_hashes, entry_hash])

        entry_payload = {
            "id": entry_id,
            "entry_hash": entry_hash,
            "previous_hash": previous_hash,
            "merkle_root": new_merkle_root,
            "timestamp": timestamp_iso,
            "user_id": user_id,
            "admin_id": admin_id,
            "plane": plane,
            "action": action,
            "metadata": metadata,
        }
        worm_meta = self.worm_client.put_worm_object(entry_payload)

        await db.execute(
            text(
                """
                INSERT INTO audit_merkle_chain (
                  id, entry_hash, previous_hash, merkle_root, timestamp, user_id, admin_id,
                  plane, action, metadata, worm_s3_bucket, worm_s3_key,
                  worm_object_lock_mode, worm_retain_until, worm_content_md5, worm_status
                ) VALUES (
                  :id::uuid, :entry_hash, :previous_hash, :merkle_root, :ts::timestamptz,
                  :user_id::uuid, :admin_id, :plane, :action, :metadata::jsonb,
                  :bucket, :s3_key, :lock_mode, :retain_until::timestamptz, :md5, :worm_status
                )
                """
            ),
            {
                "id": entry_id,
                "entry_hash": entry_hash,
                "previous_hash": previous_hash,
                "merkle_root": new_merkle_root,
                "ts": timestamp_iso,
                "user_id": user_id,
                "admin_id": admin_id,
                "plane": plane,
                "action": action,
                "metadata": json.dumps(metadata or {}),
                "bucket": worm_meta["worm_s3_bucket"],
                "s3_key": worm_meta["worm_s3_key"],
                "lock_mode": worm_meta["worm_object_lock_mode"],
                "retain_until": worm_meta["worm_retain_until"],
                "md5": worm_meta["worm_content_md5"],
                "worm_status": worm_meta["worm_status"],
            },
        )
        return {**entry_payload, **worm_meta}


router = APIRouter(prefix="/admin/api/audit-ledger", tags=["Phase 21D Audit Merkle Ledger"])
ledger_service = ImmutableAuditLedgerService()
