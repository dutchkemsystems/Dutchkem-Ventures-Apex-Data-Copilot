"""
Phase 18C — Automated Escrow Release (QA-Triggered 85/15 Kora Pay Split)
Triggered by the Python QA verification worker when task deliverables complete QA checks.
- qa_passed = True  -> Calls Kora Split Payment ('apex-marketplace-split'), sets status='released',
                       schedules T+2 settlement ETA, and creates a TaxReceipt record.
- qa_passed = False -> Does NOT trigger split; sets status='disputed' with QA failure report
                       for Admin review ('Release Partial' or 'Refund Client').
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..kora_escrow_models import (
    EscrowCurrency,
    EscrowLedger,
    KoraEscrowStatus,
    TaxReceipt,
    User,
)
from ..services.kora_client import KoraPayClient

router = APIRouter(tags=["Kora Pay Automated Escrow Release"])


def add_business_days(start: datetime, days: int) -> datetime:
    current = start
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Mon-Fri
            added += 1
    return current


class EscrowReleaseRequest(BaseModel):
    escrow_id: uuid.UUID
    qa_passed: bool
    qa_report_summary: Optional[str] = None
    failure_rate_pct: Optional[float] = None


async def get_db() -> AsyncSession:  # pragma: no cover - injected by FastAPI app
    raise NotImplementedError("Provide async SQLAlchemy session dependency.")


@router.post("/api/escrow/release", status_code=status.HTTP_200_OK)
async def release_escrow_after_qa(
    payload: EscrowReleaseRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    result = await db.execute(
        select(EscrowLedger).where(EscrowLedger.id == payload.escrow_id)
    )
    ledger = result.scalar_one_or_none()
    if not ledger:
        raise HTTPException(status_code=404, detail="Escrow ledger record not found.")

    if ledger.status != KoraEscrowStatus.FUNDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Escrow must be in 'funded' status before QA release (current: {ledger.status.value}).",
        )

    if not payload.qa_passed:
        ledger.status = KoraEscrowStatus.DISPUTED
        ledger.kora_split_reference = None
        await db.commit()
        return {
            "escrow_id": str(ledger.id),
            "qa_passed": False,
            "status": ledger.status.value,
            "kora_split_reference": None,
            "qa_report_summary": payload.qa_report_summary
            or "Automated QA threshold failed. Held in platform balance for Admin dispute review.",
            "admin_actions": ["Release Partial", "Refund Client"],
        }

    freelancer = (
        await db.execute(select(User).where(User.id == ledger.freelancer_id))
    ).scalar_one_or_none()
    if not freelancer or not freelancer.kora_recipient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Freelancer is missing an onboarded kora_recipient_id for 85/15 split payout.",
        )

    split_reference = f"kp_split_{ledger.currency.value.lower()}_8515_{uuid.uuid4().hex[:10]}"
    kora = KoraPayClient()
    await kora.split_payment(
        reference=split_reference,
        gross_amount=ledger.gross_amount,
        currency=ledger.currency.value,
        freelancer_recipient_id=freelancer.kora_recipient_id,
        freelancer_email=freelancer.email,
        freelancer_name=freelancer.full_name,
        freelancer_pct=85,
        split_rule_name=ledger.split_rule_name or "apex-marketplace-split",
    )

    now = datetime.now(timezone.utc)
    expected_t2 = add_business_days(now, 2)
    vat_rate = Decimal("0.075") if ledger.currency == EscrowCurrency.NGN else Decimal("0.00")
    vat_on_fee = (ledger.platform_fee * vat_rate).quantize(Decimal("0.01"))

    receipt = TaxReceipt(
        escrow_id=ledger.id,
        gross_amount=ledger.gross_amount,
        platform_fee=ledger.platform_fee,
        vat_on_fee=vat_on_fee,
        net_payout=ledger.freelancer_payout,
        kora_transaction_id=ledger.kora_transaction_reference or split_reference,
        generated_at=now,
    )
    db.add(receipt)
    await db.flush()

    ledger.kora_split_reference = split_reference
    ledger.status = KoraEscrowStatus.RELEASED
    ledger.expected_settlement_at = expected_t2
    ledger.tax_receipt_url = f"/api/kora-escrow/tax-receipts/{receipt.id}/pdf"
    await db.commit()

    return {
        "escrow_id": str(ledger.id),
        "qa_passed": True,
        "status": ledger.status.value,
        "kora_split_reference": split_reference,
        "split_rule": ledger.split_rule_name,
        "freelancer_payout": float(ledger.freelancer_payout),
        "platform_fee": float(ledger.platform_fee),
        "expected_settlement_at": expected_t2.isoformat(),
        "tax_receipt_id": str(receipt.id),
        "tax_receipt_url": ledger.tax_receipt_url,
    }
