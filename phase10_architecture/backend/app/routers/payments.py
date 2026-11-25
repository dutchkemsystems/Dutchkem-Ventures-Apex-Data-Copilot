from __future__ import annotations

import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.tenant_rls import TenantContext, get_tenant_db, require_roles
from app.models import UserRole

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


class PaymentSyncPayload(BaseModel):
    org_id: str
    user_id: Optional[str] = None
    subscription_tier: Literal["trial", "pro", "agency"]
    subscription_ends_at: Optional[datetime] = None
    tasks_limit: Optional[int] = None
    subscription_locked: bool = False


def verify_korapay_hmac(data_obj: dict, signature: str, secret: str) -> bool:
    payload_bytes = json.dumps(data_obj, separators=(",", ":")).encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/sync")
async def sync_subscription_state(
    body: PaymentSyncPayload,
    ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    await db.execute(
        text(
            """
            UPDATE organizations
            SET subscription_tier = :tier,
                subscription_ends_at = :ends_at,
                monthly_task_limit = :tasks_limit,
                subscription_locked = :locked
            WHERE id = :org_id
            """
        ),
        {
            "tier": body.subscription_tier,
            "ends_at": body.subscription_ends_at,
            "tasks_limit": body.tasks_limit,
            "locked": body.subscription_locked,
            "org_id": str(ctx.org_id),
        },
    )
    await db.commit()
    return {
        "org_id": str(ctx.org_id),
        "subscription_tier": body.subscription_tier,
        "subscription_ends_at": body.subscription_ends_at,
        "tasks_limit": body.tasks_limit if body.tasks_limit is not None else "Infinity",
        "subscription_locked": body.subscription_locked,
    }


@router.post("/webhook")
async def handle_payment_webhook(
    request: Request,
    x_korapay_signature: Optional[str] = Header(default=None),
):
    raw_bytes = await request.body()
    payload = json.loads(raw_bytes.decode("utf-8") or "{}")
    kora_secret = os.getenv("KORA_SECRET_KEY", "")

    if x_korapay_signature and kora_secret:
        if not verify_korapay_hmac(payload.get("data", {}), x_korapay_signature, kora_secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Kora Pay signature.")

    event_name = payload.get("type") or payload.get("event")
    if event_name in {"checkout.session.completed", "invoice.payment_succeeded", "charge.success"}:
        ends_at = datetime.now(timezone.utc) + timedelta(days=30)
        return {"status": "upgraded", "subscription_ends_at": ends_at.isoformat()}

    if event_name in {"customer.subscription.deleted", "invoice.payment_failed", "charge.failed"}:
        return {"status": "downgraded_and_locked", "subscription_tier": "trial", "tasks_limit": 3}

    return {"received": True, "ignored": True}
