"""
Phase 18F — Unified Kora Pay Webhooks & X-Event-ID Idempotency Router
Handles charge.success, transfer.completed, transfer.failed, and transfer.refunded
with strict raw-body HMAC-SHA256 verification (KORA_WEBHOOK_SECRET) and webhook_events
deduplication keyed by the X-Event-ID header. Zero Stripe dependencies.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..kora_escrow_models import (
    EscrowCurrency,
    EscrowLedger,
    KoraEscrowStatus,
    TaxReceipt,
    WebhookEvent,
)
from ..services.kora_client import KoraPayClient

router = APIRouter(tags=["Kora Pay Webhooks & Idempotency"])


async def get_db() -> AsyncSession:  # pragma: no cover - injected by FastAPI app
    raise NotImplementedError("Provide async SQLAlchemy session dependency.")


async def notify_admin_transfer_failure(
    *,
    escrow_id: str,
    reference: str,
    reason: str,
    event_id: str,
) -> dict[str, Any]:
    """Emit structured high-priority alert for organization admins on transfer.failed."""
    return {
        "alert_type": "kora_transfer_failed",
        "escrow_id": escrow_id,
        "reference": reference,
        "event_id": event_id,
        "reason": reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/api/webhooks/kora")
async def handle_kora_webhook(
    request: Request,
    x_korapay_signature: str = Header(default="", alias="X-Korapay-Signature"),
    x_event_id: str = Header(default="", alias="X-Event-ID"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Unified Kora Pay webhook receiver:
      1. Verify HMAC-SHA256 signature against raw body + KORA_WEBHOOK_SECRET.
      2. Deduplicate using X-Event-ID stored in webhook_events.
      3. Route charge.success, transfer.completed, transfer.failed, and transfer.refunded.
    """
    raw_body = await request.body()
    kora = KoraPayClient()
    if not kora.verify_webhook(raw_body, x_korapay_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Kora Pay HMAC-SHA256 webhook signature.",
        )

    payload = await request.json()
    event_name: str = (payload.get("event") or payload.get("type") or "").strip()
    data: dict[str, Any] = payload.get("data") or {}
    payload_sha256 = hashlib.sha256(raw_body).hexdigest()
    clean_event_id = x_event_id.strip()

    # Phase 18F: Deduplicate using X-Event-ID stored in webhook_events
    if clean_event_id:
        existing_event = (
            await db.execute(
                select(WebhookEvent).where(WebhookEvent.event_id == clean_event_id)
            )
        ).scalar_one_or_none()
        if existing_event is not None:
            return {
                "received": True,
                "deduplicated": True,
                "event_id": clean_event_id,
                "event_type": existing_event.event_type,
                "processed_at": existing_event.processed_at.isoformat(),
            }

    reference: Optional[str] = (
        data.get("reference")
        or data.get("transaction_reference")
        or data.get("split_reference")
        or data.get("payment_reference")
        or data.get("refund_reference")
    )

    if event_name not in {
        "charge.success",
        "transfer.completed",
        "transfer.failed",
        "transfer.refunded",
    }:
        return {"received": True, "ignored_event": event_name or "unknown"}

    if not reference:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing Kora Pay reference in {event_name} payload.",
        )

    ledger = (
        await db.execute(
            select(EscrowLedger).where(
                or_(
                    EscrowLedger.kora_transaction_reference == reference,
                    EscrowLedger.kora_split_reference == reference,
                )
            )
        )
    ).scalar_one_or_none()
    if not ledger:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Escrow ledger record not found for reference {reference}.",
        )

    now = datetime.now(timezone.utc)
    admin_alert: Optional[dict[str, Any]] = None

    if event_name == "charge.success":
        ledger.status = KoraEscrowStatus.FUNDED
        ledger.kora_transaction_reference = reference
        ledger.kora_split_reference = None  # Hold until QA passes
    elif event_name == "transfer.completed":
        ledger.status = KoraEscrowStatus.SETTLED
        ledger.settled_at = now
        existing_receipt = (
            await db.execute(select(TaxReceipt).where(TaxReceipt.escrow_id == ledger.id))
        ).scalar_one_or_none()
        if not existing_receipt:
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
    elif event_name == "transfer.failed":
        ledger.status = KoraEscrowStatus.FAILED
        failure_reason = str(
            data.get("reason")
            or data.get("message")
            or "Kora Pay payout transfer failed — admin intervention required."
        )
        admin_alert = await notify_admin_transfer_failure(
            escrow_id=str(ledger.id),
            reference=reference,
            reason=failure_reason,
            event_id=clean_event_id or payload_sha256[:16],
        )
    elif event_name == "transfer.refunded":
        ledger.status = KoraEscrowStatus.REFUNDED
        ledger.kora_split_reference = None

    resolved_event_id = clean_event_id or f"{event_name}:{payload_sha256[:20]}"
    db.add(
        WebhookEvent(
            event_id=resolved_event_id,
            event_type=event_name,
            signature_valid=True,
            payload_sha256=payload_sha256,
            raw_summary=f"{event_name} -> escrow {ledger.id} ({ledger.status.value})",
            processed_at=now,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return {
            "received": True,
            "deduplicated": True,
            "event_id": resolved_event_id,
            "event_type": event_name,
        }

    return {
        "received": True,
        "deduplicated": False,
        "event_id": resolved_event_id,
        "event": event_name,
        "escrow_id": str(ledger.id),
        "status": ledger.status.value,
        "settled_at": ledger.settled_at.isoformat() if ledger.settled_at else None,
        "admin_alert": admin_alert,
    }
