"""
Phase 18B — Client Funds Escrow via Kora Pay Pay-In (NGN & USD)
Calls Kora Initialize Charge API and processes charge.success HMAC-SHA256 webhooks.
CRITICAL: Funds remain in the platform Kora balance (status='funded') without triggering
the 85/15 split until QA approval in Phase 18C.
"""
from __future__ import annotations

import os
import uuid
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..kora_escrow_models import EscrowCurrency, EscrowLedger, KoraEscrowStatus, User
from ..services.kora_client import KoraPayClient

router = APIRouter(tags=["Kora Pay Escrow Funding"])


class FundEscrowRequest(BaseModel):
    task_id: uuid.UUID
    freelancer_id: uuid.UUID
    amount: Decimal = Field(..., gt=Decimal("0.00"))
    currency: Literal["NGN", "USD"] = "USD"


class FundEscrowResponse(BaseModel):
    escrow_id: uuid.UUID
    task_id: uuid.UUID
    reference: str
    amount: Decimal
    currency: Literal["NGN", "USD"]
    checkout_url: str
    status: Literal["pending_funding"]
    split_triggered: bool = False


async def get_db() -> AsyncSession:  # pragma: no cover - injected by FastAPI app
    raise NotImplementedError("Provide async SQLAlchemy session dependency.")


async def get_current_client_user() -> User:  # pragma: no cover - injected by auth middleware
    raise NotImplementedError("Provide authenticated client user dependency.")


@router.post(
    "/api/escrow/fund",
    response_model=FundEscrowResponse,
    status_code=status.HTTP_201_CREATED,
)
async def fund_escrow(
    payload: FundEscrowRequest,
    db: AsyncSession = Depends(get_db),
    current_client: User = Depends(get_current_client_user),
) -> FundEscrowResponse:
    gross = payload.amount.quantize(Decimal("0.01"))
    platform_fee = (gross * Decimal("0.15")).quantize(Decimal("0.01"))
    freelancer_payout = (gross - platform_fee).quantize(Decimal("0.01"))

    reference = f"kp_escrow_{uuid.uuid4().hex[:16]}"
    app_url = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")

    kora = KoraPayClient()
    kora_response = await kora.charge_initialize(
        amount=gross,
        currency=payload.currency,
        reference=reference,
        customer_email=current_client.email,
        customer_name=current_client.full_name,
        redirect_url=f"{app_url}/dashboard/escrow?reference={reference}",
        notification_url=f"{app_url}/api/webhooks/kora",
        narration=f"Dutchkem Apex Escrow Pay-In ({payload.currency}) — Task {payload.task_id}",
        metadata={
            "task_id": str(payload.task_id),
            "client_id": str(current_client.id),
            "freelancer_id": str(payload.freelancer_id),
            "split_rule": "apex-marketplace-split",
            "hold_until_qa_pass": True,
        },
    )

    checkout_url = (kora_response.get("data") or {}).get("checkout_url")
    if not checkout_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Kora Pay Initialize Charge API did not return a checkout_url.",
        )

    ledger = EscrowLedger(
        task_id=payload.task_id,
        client_id=current_client.id,
        freelancer_id=payload.freelancer_id,
        gross_amount=gross,
        currency=EscrowCurrency(payload.currency),
        platform_fee=platform_fee,
        freelancer_payout=freelancer_payout,
        kora_transaction_reference=reference,
        kora_split_reference=None,  # Do NOT trigger split until QA passes (Phase 18C)
        split_rule_name="apex-marketplace-split",
        status=KoraEscrowStatus.PENDING_FUNDING,
    )
    db.add(ledger)
    await db.commit()
    await db.refresh(ledger)

    return FundEscrowResponse(
        escrow_id=ledger.id,
        task_id=ledger.task_id,
        reference=reference,
        amount=gross,
        currency=payload.currency,
        checkout_url=checkout_url,
        status="pending_funding",
        split_triggered=False,
    )


@router.post("/api/webhooks/kora/charge-success")
async def kora_charge_success_webhook(
    request: Request,
    x_korapay_signature: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """
    Phase 18B charge.success webhook handler.
    Verifies HMAC-SHA256 signature with KORA_WEBHOOK_SECRET and transitions
    escrow_ledger.status -> 'funded' WITHOUT triggering the 85/15 split.
    """
    raw_body = await request.body()
    kora = KoraPayClient()
    if not kora.verify_webhook(raw_body, x_korapay_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Kora Pay HMAC-SHA256 webhook signature.",
        )

    payload = await request.json()
    if payload.get("event") != "charge.success":
        return {"received": True, "ignored_event": payload.get("event")}

    data = payload.get("data") or {}
    reference = data.get("reference") or data.get("payment_reference")
    if not reference:
        raise HTTPException(status_code=400, detail="Missing Kora transaction reference.")

    result = await db.execute(
        select(EscrowLedger).where(EscrowLedger.kora_transaction_reference == reference)
    )
    ledger = result.scalar_one_or_none()
    if not ledger:
        raise HTTPException(status_code=404, detail=f"Escrow ledger not found for reference {reference}.")

    ledger.status = KoraEscrowStatus.FUNDED
    ledger.kora_transaction_reference = reference
    # Funds remain held in the platform Kora balance until QA passes (Phase 18C)
    ledger.kora_split_reference = None
    await db.commit()

    return {
        "received": True,
        "event": "charge.success",
        "escrow_id": str(ledger.id),
        "kora_transaction_reference": reference,
        "status": ledger.status.value,
        "split_triggered": False,
    }
