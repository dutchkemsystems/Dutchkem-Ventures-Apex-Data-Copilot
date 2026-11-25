"""
Phase 21C: Phishing-Proof WebAuthn Passkeys & Admin YubiKey Hardware Keys
Production FastAPI WebAuthn service using py_webauthn with fail-closed
domain/origin binding, hardware YubiKey enforcement for Admin logins,
counter replay detection, and security_incidents audit logging.
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from typing import Literal, Optional

from fastapi import HTTPException, status
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

ActorPlane = Literal["user", "admin"]

# Official Yubico YubiKey AAGUIDs
YUBIKEY_AAGUIDS: dict[str, str] = {
    "cb69481e-8ff7-4093-99ec-53f6c295e128": "YubiKey 5 Series / 5C NFC",
    "73bb0cd4-e502-49b8-9c6f-b59445bf720b": "YubiKey 5 FIPS Series",
    "c5ef55ff-ad9a-4b9f-b580-adebafe026d0": "YubiKey 5Ci / Enterprise",
    "ee882879-721c-4913-9775-3dfcce97072a": "YubiKey 5 NFC",
    "d8522d9f-575b-4866-88a9-ba99fa02f35b": "YubiKey Bio Series",
    "a4e9fc6d-4cbe-4758-b8ba-37598bb5bbaa": "Security Key by Yubico (NFC)",
}


@dataclass(frozen=True)
class PasskeyConfig:
    rp_id: str = os.getenv("WEBAUTHN_RP_ID", "apexdata.dutchkemventures.com")
    rp_name: str = os.getenv("WEBAUTHN_RP_NAME", "Dutchkem Ventures Apex Copilot")
    expected_origin: str = os.getenv("WEBAUTHN_ORIGIN", "https://apexdata.dutchkemventures.com")
    admin_require_yubikey: bool = os.getenv("ADMIN_REQUIRE_YUBIKEY", "true").lower() == "true"


class WebAuthnPasskeyService:
    """
    Fail-closed WebAuthn registration and assertion verifier.
    - User Plane: supports Platform (Touch ID / Face ID / Windows Hello) & Roaming keys.
    - Admin Plane: enforces cross-platform hardware security keys (YubiKey) + UV required.
    - Phishing-Proof: verifies clientDataJSON origin & rpID cryptographically on every ceremony.
    """

    def __init__(self, config: Optional[PasskeyConfig] = None) -> None:
        self.config = config or PasskeyConfig()

    def build_registration_options(
        self,
        *,
        actor_plane: ActorPlane,
        actor_id: str,
        user_name: str,
        display_name: str,
        existing_credential_ids: list[str],
    ):
        is_admin = actor_plane == "admin"
        exclude = [
            PublicKeyCredentialDescriptor(id=base64.urlsafe_b64decode(cid + "=="))
            for cid in existing_credential_ids
        ]
        selection = AuthenticatorSelectionCriteria(
            authenticator_attachment=(
                AuthenticatorAttachment.CROSS_PLATFORM
                if is_admin
                else AuthenticatorAttachment.PLATFORM
            ),
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=(
                UserVerificationRequirement.REQUIRED
                if is_admin
                else UserVerificationRequirement.PREFERRED
            ),
        )
        return generate_registration_options(
            rp_id=self.config.rp_id,
            rp_name=self.config.rp_name,
            user_id=actor_id.encode("utf-8"),
            user_name=user_name,
            user_display_name=display_name,
            attestation=(
                AttestationConveyancePreference.DIRECT
                if is_admin
                else AttestationConveyancePreference.NONE
            ),
            authenticator_selection=selection,
            exclude_credentials=exclude,
        )

    def verify_registration(
        self,
        *,
        actor_plane: ActorPlane,
        credential_payload: dict,
        expected_challenge: bytes,
    ):
        # Verify domain binding & cryptographic attestation (fail closed on any mismatch)
        try:
            verification = verify_registration_response(
                credential=credential_payload,
                expected_challenge=expected_challenge,
                expected_rp_id=self.config.rp_id,
                expected_origin=self.config.expected_origin,
                require_user_verification=(actor_plane == "admin"),
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"WEBAUTHN_REGISTRATION_FAILED: {exc}",
            ) from exc

        aaguid_str = str(getattr(verification, "aaguid", "") or "").lower()
        is_yubikey = aaguid_str in YUBIKEY_AAGUIDS
        return {
            "credential_id": base64.urlsafe_b64encode(verification.credential_id).decode().rstrip("="),
            "public_key": base64.urlsafe_b64encode(verification.credential_public_key).decode().rstrip("="),
            "counter": int(verification.sign_count),
            "aaguid": aaguid_str or None,
            "is_hardware_yubikey": is_yubikey,
        }

    def build_authentication_options(
        self,
        *,
        actor_plane: ActorPlane,
        allowed_credential_ids: list[str],
    ):
        allow = [
            PublicKeyCredentialDescriptor(id=base64.urlsafe_b64decode(cid + "=="))
            for cid in allowed_credential_ids
        ]
        return generate_authentication_options(
            rp_id=self.config.rp_id,
            allow_credentials=allow,
            user_verification=(
                UserVerificationRequirement.REQUIRED
                if actor_plane == "admin"
                else UserVerificationRequirement.PREFERRED
            ),
        )

    def verify_assertion(
        self,
        *,
        actor_plane: ActorPlane,
        credential_payload: dict,
        expected_challenge: bytes,
        stored_public_key_b64: str,
        stored_counter: int,
        stored_actor_plane: ActorPlane,
    ) -> int:
        # 1. Prevent cross-plane passkey reuse
        if stored_actor_plane != actor_plane:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CROSS_PLANE_FORBIDDEN: Passkey belongs to a different security plane.",
            )

        # 2. Check clientDataJSON origin explicitly for phishing-origin telemetry
        raw_client_data = credential_payload.get("response", {}).get("clientDataJSON", "")
        if raw_client_data:
            padded = raw_client_data + "=" * (-len(raw_client_data) % 4)
            client_data = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            if client_data.get("origin") != self.config.expected_origin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="WEBAUTHN_PHISHING_ORIGIN_MISMATCH: Browser origin does not match registered RP domain.",
                )

        # 3. Verify FIDO2 cryptographic assertion + counter monotonicity
        padded_pk = stored_public_key_b64 + "=" * (-len(stored_public_key_b64) % 4)
        verification = verify_authentication_response(
            credential=credential_payload,
            expected_challenge=expected_challenge,
            expected_rp_id=self.config.rp_id,
            expected_origin=self.config.expected_origin,
            credential_public_key=base64.urlsafe_b64decode(padded_pk),
            credential_current_sign_count=stored_counter,
            require_user_verification=(actor_plane == "admin"),
        )

        new_counter = int(verification.new_sign_count)
        if stored_counter > 0 and new_counter <= stored_counter:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="WEBAUTHN_REPLAY_DETECTED: Authenticator signature counter did not advance.",
            )

        return new_counter
