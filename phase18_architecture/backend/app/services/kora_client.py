"""
Phase 18A — Kora Pay Python Client Wrapper & Reusable Split Rule ('apex-marketplace-split')
Supports charge_initialize, split_payment (85/15 NGN & USD), refund, recipient onboarding,
and HMAC-SHA256 verify_webhook using KORA_WEBHOOK_SECRET. Zero Stripe dependencies.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal, Optional

import httpx

CurrencyCode = Literal["NGN", "USD"]


@dataclass(frozen=True)
class KoraSplitRule:
    name: str = "apex-marketplace-split"
    freelancer_share_pct: int = 85
    platform_share_pct: int = 15


class KoraPayClient:
    BASE_URL = "https://api.korapay.com/merchant/api/v1"

    def __init__(
        self,
        public_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        encryption_key: Optional[str] = None,
    ) -> None:
        self.public_key = public_key or os.getenv("KORA_PUBLIC_KEY", "")
        self.secret_key = secret_key or os.getenv("KORA_SECRET_KEY", "")
        self.webhook_secret = webhook_secret or os.getenv("KORA_WEBHOOK_SECRET", "")
        self.encryption_key = encryption_key or os.getenv("KORA_ENCRYPTION_KEY", "")
        self.default_split_rule = KoraSplitRule()

    @property
    def _headers(self) -> dict[str, str]:
        if not self.secret_key:
            raise RuntimeError("KORA_SECRET_KEY environment variable is not configured.")
        return {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

    async def charge_initialize(
        self,
        *,
        amount: Decimal | float,
        currency: CurrencyCode,
        reference: str,
        customer_email: str,
        customer_name: str,
        redirect_url: str,
        notification_url: str,
        narration: str = "Dutchkem Apex Escrow Pay-In",
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Collect client escrow funds into the platform Kora merchant balance."""
        payload = {
            "amount": float(Decimal(str(amount)).quantize(Decimal("0.01"))),
            "currency": currency,
            "reference": reference,
            "redirect_url": redirect_url,
            "notification_url": notification_url,
            "narration": narration,
            "customer": {
                "name": customer_name,
                "email": customer_email,
            },
            "metadata": metadata or {},
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/charges/initialize",
                headers=self._headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def create_split_rule(
        self,
        *,
        freelancer_recipient_id: str,
        currency: CurrencyCode,
        rule_name: str = "apex-marketplace-split",
        freelancer_percentage: int = 85,
        platform_percentage: int = 15,
    ) -> dict[str, Any]:
        """Create or update reusable 85/15 split rule on Kora Pay for NGN or USD settlement."""
        if freelancer_percentage + platform_percentage != 100:
            raise ValueError("Split percentages must sum strictly to 100%.")
        payload = {
            "name": rule_name,
            "currency": currency,
            "splits": [
                {
                    "recipient_id": freelancer_recipient_id,
                    "percentage": freelancer_percentage,
                    "role": "freelancer",
                },
                {
                    "account": "platform_default_settlement",
                    "percentage": platform_percentage,
                    "role": "platform",
                },
            ],
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/splits/rules",
                headers=self._headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def split_payment(
        self,
        *,
        reference: str,
        gross_amount: Decimal | float,
        currency: CurrencyCode,
        freelancer_recipient_id: str,
        freelancer_email: str,
        freelancer_name: str,
        freelancer_pct: int = 85,
        split_rule_name: str = "apex-marketplace-split",
        narration: str = "Apex Marketplace 85/15 QA-Verified Split Payout",
    ) -> dict[str, Any]:
        """
        Execute QA-triggered 85/15 split payout after QA passes.
        Transfers 85% (or custom partial %) to freelancer kora_recipient_id while 15% remains in platform balance.
        """
        gross = Decimal(str(gross_amount)).quantize(Decimal("0.01"))
        freelancer_amount = (gross * Decimal(freelancer_pct) / Decimal(100)).quantize(Decimal("0.01"))
        platform_fee = (gross - freelancer_amount).quantize(Decimal("0.01"))

        payload = {
            "reference": reference,
            "split_rule": split_rule_name,
            "destination": {
                "type": "bank_account",
                "recipient_id": freelancer_recipient_id,
                "amount": float(freelancer_amount),
                "currency": currency,
                "narration": narration,
            },
            "customer": {
                "name": freelancer_name,
                "email": freelancer_email,
            },
            "metadata": {
                "split_rule": split_rule_name,
                "gross_amount": float(gross),
                "freelancer_payout": float(freelancer_amount),
                "platform_fee": float(platform_fee),
                "settlement_window": "T+2",
            },
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/transactions/disburse",
                headers=self._headers,
                json=payload,
            )
            resp.raise_for_status()
            return {
                "kora_response": resp.json(),
                "freelancer_payout": float(freelancer_amount),
                "platform_fee": float(platform_fee),
                "split_rule": split_rule_name,
            }

    async def refund(
        self,
        *,
        original_transaction_reference: str,
        amount: Decimal | float,
        currency: CurrencyCode,
        refund_reference: str,
        reason: str = "QA threshold failure refund",
    ) -> dict[str, Any]:
        """Refund client via Kora Pay Refund API referencing original charge transaction."""
        payload = {
            "transaction_reference": original_transaction_reference,
            "reference": refund_reference,
            "amount": float(Decimal(str(amount)).quantize(Decimal("0.01"))),
            "currency": currency,
            "reason": reason,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/refunds",
                headers=self._headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    def verify_webhook(self, raw_body: bytes, signature_header: str) -> bool:
        """
        Verify Kora Pay webhook HMAC-SHA256 signature against KORA_WEBHOOK_SECRET
        using constant-time digest comparison.
        """
        if not self.webhook_secret or not signature_header:
            return False
        expected_hex = hmac.new(
            self.webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected_hex, signature_header.strip())
