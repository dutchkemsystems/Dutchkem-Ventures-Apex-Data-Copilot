"""
Phase 18E — Dispute & Refund Flow (Release Full, Refund Client via Kora Refund API, Partial Release)
When >10% of batch files fail QA, escrow remains held in platform balance ('funded' or 'disputed')
and surfaces in the Admin Dispute Review card for manual resolution.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
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

router = APIRouter(tags=["Kora Pay Dispute & Refund Flow"])


class DisputeResolutionRequest(BaseModel):
    action: Literal["release_full", "refund_client", "partial_release"]
    freelancer_pct: Optional[int] = Field(default=50, ge=1, le=99)
    reason: Optional[str] = None


async def get_db() -> AsyncSession:  # pragma: no cover
    raise NotImplementedError("Provide async SQLAlchemy session dependency.")


async def require_admin_user() -> User:  # pragma: no cover
    raise NotImplementedError("Provide Admin RBAC dependency.")


def add_business_days(start: datetime, days: int) -> datetime:
    current = start
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current


@router.post("/api/escrow/disputes/{escrow_id}/resolve", status_code=status.HTTP_200_OK)
async def resolve_disputed_escrow(
    escrow_id: uuid.UUID,
    payload: DisputeResolutionRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
) -> dict[str, object]:
    if admin_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins may resolve escrow disputes or trigger Kora refunds.",
        )

    ledger = (
        await db.execute(select(EscrowLedger).where(EscrowLedger.id == escrow_id))
    ).scalar_one_or_none()
    if not ledger:
        raise HTTPException(status_code=404, detail="Escrow ledger record not found.")

    if ledger.status not in (KoraEscrowStatus.DISPUTED, KoraEscrowStatus.FUNDED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot resolve escrow in '{ledger.status.value}' status.",
        )

    kora = KoraPayClient()

    if payload.action == "refund_client":
        if not ledger.kora_transaction_reference:
            raise HTTPException(
                status_code=400, detail="Missing original kora_transaction_reference for refund."
            )
        refund_ref = f"kp_refund_{ledger.currency.value.lower()}_{uuid.uuid4().hex[:10]}"
        await kora.refund(
            original_transaction_reference=ledger.kora_transaction_reference,
            amount=ledger.gross_amount,
            currency=ledger.currency.value,
            refund_reference=refund_ref,
            reason=payload.reason or "Admin QA dispute refund (>10% batch failure)",
        )
        ledger.status = KoraEscrowStatus.REFUNDED
        ledger.kora_split_reference = None
        await db.commit()
        return {
            "escrow_id": str(ledger.id),
            "action": "refund_client",
            "status": ledger.status.value,
            "kora_refund_reference": refund_ref,
            "refunded_amount": float(ledger.gross_amount),
            "currency": ledger.currency.value,
        }

    freelancer = (
        await db.execute(select(User).where(User.id == ledger.freelancer_id))
    ).scalar_one_or_none()
    if not freelancer or not freelancer.kora_recipient_id:
        raise HTTPException(
            status_code=400,
            detail="Freelancer must have an onboarded kora_recipient_id before split release.",
        )

    split_pct = 85 if payload.action == "release_full" else int(payload.freelancer_pct or 50)
    freelancer_amount = (
        ledger.gross_amount * Decimal(split_pct) / Decimal(100)
    ).quantize(Decimal("0.01"))
    platform_amount = (ledger.gross_amount - freelancer_amount).quantize(Decimal("0.01"))

    split_ref = f"kp_split_{ledger.currency.value.lower()}_{split_pct}_{uuid.uuid4().hex[:8]}"
    await kora.split_payment(
        reference=split_ref,
        gross_amount=ledger.gross_amount,
        currency=ledger.currency.value,
        freelancer_recipient_id=freelancer.kora_recipient_id,
        freelancer_email=freelancer.email,
        freelancer_name=freelancer.full_name,
        freelancer_pct=split_pct,
        split_rule_name=ledger.split_rule_name or "apex-marketplace-split",
        narration=f"Admin Dispute Resolution ({split_pct}/{100 - split_pct} split)",
    )

    now = datetime.now(timezone.utc)
    vat_rate = Decimal("0.075") if ledger.currency == EscrowCurrency.NGN else Decimal("0.00")
    receipt = TaxReceipt(
        escrow_id=ledger.id,
        gross_amount=ledger.gross_amount,
        platform_fee=platform_amount,
        vat_on_fee=(platform_amount * vat_rate).quantize(Decimal("0.01")),
        net_payout=freelancer_amount,
        kora_transaction_id=ledger.kora_transaction_reference or split_ref,
        generated_at=now,
    )
    db.add(receipt)
    await db.flush()

    ledger.freelancer_payout = freelancer_amount
    ledger.platform_fee = platform_amount
    ledger.kora_split_reference = split_ref
    ledger.status = KoraEscrowStatus.RELEASED
    ledger.expected_settlement_at = add_business_days(now, 2)
    ledger.tax_receipt_url = f"/api/kora-escrow/tax-receipts/{receipt.id}/pdf"
    await db.commit()

    return {
        "escrow_id": str(ledger.id),
        "action": payload.action,
        "freelancer_pct": split_pct,
        "platform_pct": 100 - split_pct,
        "status": ledger.status.value,
        "kora_split_reference": split_ref,
        "freelancer_payout": float(freelancer_amount),
        "platform_fee": float(platform_amount),
        "tax_receipt_url": ledger.tax_receipt_url,
    }
