"""
Phase 18D — T+2 Settlement Tracking & transfer.completed Webhook Handler
Confirms freelancer bank/wallet settlement via HMAC-verified Kora Pay transfer.completed
webhook, records settled_at, transitions status -> 'settled', and serves T+2 / FX metadata.
Note: The platform's 15% commission is already retained in the merchant balance.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..kora_escrow_models import EscrowCurrency, EscrowLedger, KoraEscrowStatus, TaxReceipt
from ..services.kora_client import KoraPayClient

router = APIRouter(tags=["Kora Pay T+2 Settlement & Tax Receipts"])

DEFAULT_USD_TO_NGN_RATE = Decimal("1530.00")


async def get_db() -> AsyncSession:  # pragma: no cover - injected by FastAPI app
    raise NotImplementedError("Provide async SQLAlchemy session dependency.")


@router.post("/api/webhooks/kora/transfer-completed")
async def kora_transfer_completed_webhook(
    request: Request,
    x_korapay_signature: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """
    Phase 18D transfer.completed handler.
    Verifies HMAC-SHA256 signature with KORA_WEBHOOK_SECRET and sets
    escrow_ledger.settled_at = now() and status = 'settled'.
    """
    raw_body = await request.body()
    kora = KoraPayClient()
    if not kora.verify_webhook(raw_body, x_korapay_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Kora Pay HMAC-SHA256 webhook signature.",
        )

    payload = await request.json()
    if payload.get("event") != "transfer.completed":
        return {"received": True, "ignored_event": payload.get("event")}

    data = payload.get("data") or {}
    reference = data.get("reference") or data.get("split_reference")
    if not reference:
        raise HTTPException(status_code=400, detail="Missing Kora transfer/split reference.")

    result = await db.execute(
        select(EscrowLedger).where(
            or_(
                EscrowLedger.kora_split_reference == reference,
                EscrowLedger.kora_transaction_reference == reference,
            )
        )
    )
    ledger = result.scalar_one_or_none()
    if not ledger:
        raise HTTPException(
            status_code=404, detail=f"Escrow ledger not found for reference {reference}."
        )

    now = datetime.now(timezone.utc)
    ledger.settled_at = now
    ledger.status = KoraEscrowStatus.SETTLED

    # Ensure TaxReceipt exists for the freelancer payout
    receipt = (
        await db.execute(select(TaxReceipt).where(TaxReceipt.escrow_id == ledger.id))
    ).scalar_one_or_none()
    if not receipt:
        vat_rate = Decimal("0.075") if ledger.currency == EscrowCurrency.NGN else Decimal("0.00")
        receipt = TaxReceipt(
            escrow_id=ledger.id,
            gross_amount=ledger.gross_amount,
            platform_fee=ledger.platform_fee,
            vat_on_fee=(ledger.platform_fee * vat_rate).quantize(Decimal("0.01")),
            net_payout=ledger.freelancer_payout,
            kora_transaction_id=ledger.kora_transaction_reference or reference,
            generated_at=now,
        )
        db.add(receipt)
        await db.flush()
        ledger.tax_receipt_url = f"/api/kora-escrow/tax-receipts/{receipt.id}/pdf"

    await db.commit()

    return {
        "received": True,
        "event": "transfer.completed",
        "escrow_id": str(ledger.id),
        "status": ledger.status.value,
        "settled_at": now.isoformat(),
        "platform_15pct_retained": float(ledger.platform_fee),
        "tax_receipt_url": ledger.tax_receipt_url,
    }


@router.get("/api/escrow/{escrow_id}/settlement-status")
async def get_settlement_status(
    escrow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    ledger = (
        await db.execute(select(EscrowLedger).where(EscrowLedger.id == escrow_id))
    ).scalar_one_or_none()
    if not ledger:
        raise HTTPException(status_code=404, detail="Escrow ledger record not found.")

    converted_ngn = (
        float((ledger.freelancer_payout * DEFAULT_USD_TO_NGN_RATE).quantize(Decimal("0.01")))
        if ledger.currency == EscrowCurrency.USD
        else float(ledger.freelancer_payout)
    )

    return {
        "escrow_id": str(ledger.id),
        "status": ledger.status.value,
        "message": (
            "Your payout is being processed. Expected settlement: 2 business days (T+2)."
            if ledger.status == KoraEscrowStatus.RELEASED
            else f"Settlement status: {ledger.status.value}"
        ),
        "currency": ledger.currency.value,
        "net_payout": float(ledger.freelancer_payout),
        "usd_to_ngn_rate": float(DEFAULT_USD_TO_NGN_RATE)
        if ledger.currency == EscrowCurrency.USD
        else None,
        "converted_ngn_payout": converted_ngn,
        "expected_settlement_at": (
            ledger.expected_settlement_at.isoformat() if ledger.expected_settlement_at else None
        ),
        "settled_at": ledger.settled_at.isoformat() if ledger.settled_at else None,
        "tax_receipt_url": ledger.tax_receipt_url,
    }
