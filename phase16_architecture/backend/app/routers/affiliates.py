"""
Phase 16 — FastAPI Affiliate & Referral Engine Router
Handles /ref/{user_id} 30-day cookie tracking, affiliate analytics summary,
20% recurring commission crediting on Kora Pay Pro/Agency upgrades, and Kora Pay disbursements.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..affiliate_models import CommissionStatus, ReferralAttribution, ReferralClick, ReferralCommission
from ..dependencies import TenantContext, get_db_session, get_tenant_context

router = APIRouter(tags=["Phase 16: Affiliates & Referrals"])

KORA_SECRET_KEY = os.getenv("KORA_SECRET_KEY", "")
APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
REFERRAL_COOKIE_NAME = "apex_ref_id"
COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days

PLAN_PRICES_USD = {
    "pro": Decimal("49.00"),
    "agency": Decimal("199.00"),
}
COMMISSION_RATE = Decimal("0.20")


class CreditCommissionPayload(BaseModel):
    referred_org_id: uuid.UUID
    plan_tier: Literal["pro", "agency"]
    kora_subscription_ref: str
    billing_cycle_month: str | None = None


class WithdrawCommissionPayload(BaseModel):
    currency: Literal["NGN", "USD", "GBP"] = "USD"
    payout_account_ref: str | None = None


@router.get("/ref/{user_id}")
async def track_referral_link(
    user_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    client_host = request.client.host if request.client else "unknown"
    click = ReferralClick(
        referrer_user_id=user_id,
        visitor_fingerprint=client_host,
        landing_path="/",
        user_agent=request.headers.get("user-agent"),
    )
    db.add(click)
    await db.commit()

    redirect = RedirectResponse(url=f"{APP_URL}/?ref={user_id}", status_code=302)
    redirect.set_cookie(
        key=REFERRAL_COOKIE_NAME,
        value=str(user_id),
        max_age=COOKIE_MAX_AGE_SECONDS,
        path="/",
        httponly=False,
        samesite="lax",
    )
    return redirect


@router.get("/api/affiliates/summary")
async def get_affiliate_summary(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    clicks_count = await db.scalar(
        select(func.count(ReferralClick.id)).where(ReferralClick.referrer_user_id == ctx.user_id)
    )
    attributions_res = await db.execute(
        select(ReferralAttribution)
        .where(ReferralAttribution.referrer_user_id == ctx.user_id)
        .order_by(ReferralAttribution.attributed_at.desc())
    )
    attributions = attributions_res.scalars().all()

    commissions_res = await db.execute(
        select(ReferralCommission)
        .where(ReferralCommission.referrer_user_id == ctx.user_id)
        .order_by(ReferralCommission.created_at.desc())
    )
    commissions = commissions_res.scalars().all()

    total_earned = sum((c.commission_usd for c in commissions), Decimal("0.00"))
    available_usd = sum(
        (c.commission_usd for c in commissions if c.status == CommissionStatus.CREDITED),
        Decimal("0.00"),
    )

    return {
        "referral_link": f"{APP_URL}/ref/{ctx.user_id}",
        "commission_rate_pct": 20,
        "clicks": int(clicks_count or 0),
        "signups": len(attributions),
        "conversions": sum(1 for a in attributions if a.converted_at is not None),
        "total_earned_usd": float(total_earned),
        "available_usd": float(available_usd),
        "attributions": attributions,
        "commissions": commissions,
    }


@router.post("/api/affiliates/commission/credit")
async def credit_recurring_commission(
    payload: CreditCommissionPayload,
    db: AsyncSession = Depends(get_db_session),
):
    attr_res = await db.execute(
        select(ReferralAttribution).where(
            ReferralAttribution.referred_org_id == payload.referred_org_id
        )
    )
    attribution = attr_res.scalar_one_or_none()
    if not attribution:
        return {"credited": False, "reason": "Organization was not referred by an affiliate."}

    gross_usd = PLAN_PRICES_USD[payload.plan_tier]
    commission_usd = (gross_usd * COMMISSION_RATE).quantize(Decimal("0.01"))
    cycle = payload.billing_cycle_month or datetime.now(timezone.utc).strftime("%Y-%m")

    attribution.subscription_tier = payload.plan_tier
    if not attribution.converted_at:
        attribution.converted_at = datetime.now(timezone.utc)

    entry = ReferralCommission(
        referrer_user_id=attribution.referrer_user_id,
        referred_org_id=payload.referred_org_id,
        kora_subscription_ref=payload.kora_subscription_ref,
        plan_tier=payload.plan_tier,
        gross_subscription_usd=gross_usd,
        commission_rate=Decimal("0.2000"),
        commission_usd=commission_usd,
        billing_cycle_month=cycle,
        status=CommissionStatus.CREDITED,
    )
    db.add(entry)
    await db.commit()
    return {
        "credited": True,
        "referrer_user_id": str(attribution.referrer_user_id),
        "commission_usd": float(commission_usd),
        "plan_tier": payload.plan_tier,
    }


@router.post("/api/affiliates/withdraw")
async def withdraw_commissions_korapay(
    payload: WithdrawCommissionPayload,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    res = await db.execute(
        select(ReferralCommission).where(
            ReferralCommission.referrer_user_id == ctx.user_id,
            ReferralCommission.status == CommissionStatus.CREDITED,
        )
    )
    available = res.scalars().all()
    if not available:
        raise HTTPException(status_code=400, detail="No available commissions ready for payout.")

    total_usd = sum((c.commission_usd for c in available), Decimal("0.00"))
    fx_rates = {"USD": Decimal("1.0"), "NGN": Decimal("1530.0"), "GBP": Decimal("0.79")}
    payout_amount = (total_usd * fx_rates[payload.currency]).quantize(Decimal("0.01"))
    payout_ref = f"kp_aff_{str(ctx.user_id)[:8]}_{int(time.time())}"

    if KORA_SECRET_KEY:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "https://api.korapay.com/merchant/api/v1/transactions/disburse",
                headers={"Authorization": f"Bearer {KORA_SECRET_KEY}"},
                json={
                    "reference": payout_ref,
                    "destination": {
                        "type": "bank_account",
                        "amount": float(payout_amount),
                        "currency": payload.currency,
                        "narration": "Apex Copilot 20% Recurring Affiliate Commission Payout",
                    },
                },
            )

    now = datetime.now(timezone.utc)
    for row in available:
        row.status = CommissionStatus.PAID_OUT
        row.payout_reference = payout_ref
        row.payout_currency = payload.currency
        row.paid_out_at = now
    await db.commit()

    return {
        "settled": True,
        "payout_reference": payout_ref,
        "currency": payload.currency,
        "payout_amount": float(payout_amount),
        "amount_usd": float(total_usd),
        "commissions_settled": len(available),
    }
