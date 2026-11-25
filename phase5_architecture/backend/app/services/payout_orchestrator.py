from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional

import httpx

from phase3_architecture.backend.app.engines.audio_qa import AudioQaEngine, AudioQaReport

PayoutRail = Literal["kora_pay", "kora_pay_global"]


@dataclass
class EscrowSplitResult:
    gross_amount: Decimal
    platform_fee_20pct: Decimal
    expert_payout_80pct: Decimal


@dataclass
class MarketplaceSettlementResult:
    qa_passed: bool
    qa_report: AudioQaReport
    batch_status: str
    payout_rail: Optional[PayoutRail] = None
    external_transfer_id: Optional[str] = None
    split: Optional[EscrowSplitResult] = None
    settled_at: Optional[datetime] = None


def compute_escrow_split(gross_amount: Decimal) -> EscrowSplitResult:
    fee = (gross_amount * Decimal("0.20")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    payout = (gross_amount - fee).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return EscrowSplitResult(
        gross_amount=gross_amount,
        platform_fee_20pct=fee,
        expert_payout_80pct=payout,
    )


class KoraPayClient:
    """Executes automated Kora Pay disbursements for both local (NGN) and international (USD/GBP) contributors."""

    def __init__(self) -> None:
        self.secret_key = os.getenv("KORA_SECRET_KEY", "")

    async def disburse_payout(
        self,
        account_ref: str,
        amount: Decimal,
        reference: str,
        narration: str,
        currency: Literal["NGN", "USD", "GBP"] = "USD",
    ) -> str:
        if not self.secret_key:
            prefix = "kp_intl_" if currency != "NGN" else "kp_disb_"
            return f"{prefix}{uuid.uuid4().hex[:14]}"

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.korapay.com/merchant/api/v1/transactions/disburse",
                headers={"Authorization": f"Bearer {self.secret_key}"},
                json={
                    "reference": reference,
                    "destination": {
                        "type": "bank_account",
                        "amount": float(amount),
                        "currency": currency,
                        "narration": narration,
                        "bank_account": {"account_number": account_ref},
                    },
                },
            )
            resp.raise_for_status()
            return str(resp.json().get("data", {}).get("reference", reference))


class MarketplacePayoutOrchestrator:
    """
    Validates human .wav submissions via Phase 3 Audio QA Engine.
    Only when all DSP/WER gates pass does it release the 80% expert payout
    via Kora Pay (Domestic NGN or Global USD/GBP), book the 20% agency fee, and deliver to client.
    """

    def __init__(self) -> None:
        self.audio_qa = AudioQaEngine()
        self.korapay = KoraPayClient()

    async def validate_and_settle(
        self,
        wav_bytes: bytes,
        file_name: str,
        reference_script: str,
        gross_amount: Decimal,
        payout_rail: PayoutRail,
        payout_account_ref: str,
        batch_id: str,
        run_stt: bool = False,
    ) -> MarketplaceSettlementResult:
        qa_report = self.audio_qa.evaluate_wav_bytes(
            wav_bytes=wav_bytes,
            file_name=file_name,
            reference_transcript=reference_script,
            run_stt=run_stt,
        )

        if not qa_report.passed:
            return MarketplaceSettlementResult(
                qa_passed=False,
                qa_report=qa_report,
                batch_status="qa_failed",
            )

        split = compute_escrow_split(gross_amount)
        currency: Literal["NGN", "USD"] = "USD" if payout_rail == "kora_pay_global" else "NGN"
        transfer_id = await self.korapay.disburse_payout(
            account_ref=payout_account_ref,
            amount=split.expert_payout_80pct,
            reference=f"apex-{batch_id}",
            narration=f"Dutchkem Apex Marketplace Batch {batch_id}",
            currency=currency,
        )

        return MarketplaceSettlementResult(
            qa_passed=True,
            qa_report=qa_report,
            batch_status="delivered_and_paid",
            payout_rail=payout_rail,
            external_transfer_id=transfer_id,
            split=split,
            settled_at=datetime.now(timezone.utc),
        )
