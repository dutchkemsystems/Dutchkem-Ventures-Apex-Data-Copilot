"""
Phase 15: FastAPI Two-Sided Job Board Router
- AI Labs pay a $500 listing fee via Kora Pay to publish a job.
- Freelancers browse open jobs, apply, and submit milestone bids.
- Accepting a bid funds escrow via Kora Pay; passing automated QA releases an 85/15 payout split.
"""

from __future__ import annotations

import os
import time
import uuid
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.job_board_models import (
    JobBid,
    JobBidStatus,
    JobEscrowStatus,
    JobPostingStatus,
    MarketplaceJob,
    utc_now,
)

router = APIRouter(prefix="/api/marketplace-jobs", tags=["Two-Sided Job Board"])
LISTING_FEE_USD = Decimal("500.00")


class PostJobRequest(BaseModel):
    client_org_name: str = Field(min_length=2, max_length=140)
    client_email: str = Field(min_length=5, max_length=180)
    title: str = Field(min_length=5, max_length=180)
    description: str = Field(min_length=15, max_length=4000)
    qa_type: str = Field(default="audio")
    budget_usd: Decimal = Field(gt=0)
    currency: str = Field(default="NGN")


class SubmitBidRequest(BaseModel):
    freelancer_name: str = Field(min_length=2, max_length=120)
    freelancer_email: str = Field(min_length=5, max_length=180)
    bid_amount_usd: Decimal = Field(gt=0)
    turnaround_days: int = Field(ge=1, le=90)
    pitch: str = Field(min_length=10, max_length=2000)


@router.post("/post/initialize")
async def initialize_client_job_post(
    payload: PostJobRequest,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    ref = f"kora_jobfee_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    job = MarketplaceJob(
        client_org_name=payload.client_org_name,
        client_email=payload.client_email,
        title=payload.title,
        description=payload.description,
        qa_type=payload.qa_type,
        budget_usd=payload.budget_usd,
        listing_fee_usd=LISTING_FEE_USD,
        listing_currency=payload.currency,
        kora_listing_ref=ref,
        status=JobPostingStatus.AWAITING_LISTING_FEE,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    return {
        "job_id": str(job.id),
        "reference": ref,
        "listing_fee_usd": float(LISTING_FEE_USD),
        "currency": payload.currency,
        "provider": "korapay",
    }


@router.post("/{job_id}/bid")
async def submit_freelancer_bid(
    job_id: uuid.UUID,
    payload: SubmitBidRequest,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    job = await db.get(MarketplaceJob, job_id)
    if not job or job.status != JobPostingStatus.OPEN:
        raise HTTPException(status_code=400, detail="Job is not open for freelancer bidding.")

    bid = JobBid(
        job_id=job.id,
        freelancer_name=payload.freelancer_name,
        freelancer_email=payload.freelancer_email,
        bid_amount_usd=payload.bid_amount_usd,
        turnaround_days=payload.turnaround_days,
        pitch=payload.pitch,
    )
    db.add(bid)
    await db.commit()
    return {"bid_id": str(bid.id), "status": bid.status.value}


@router.post("/{job_id}/bids/{bid_id}/accept")
async def accept_bid_and_fund_escrow(
    job_id: uuid.UUID,
    bid_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    job = await db.get(MarketplaceJob, job_id)
    bid = await db.get(JobBid, bid_id)
    if not job or not bid or bid.job_id != job.id:
        raise HTTPException(status_code=404, detail="Job or bid not found.")

    other_bids = (await db.execute(select(JobBid).where(JobBid.job_id == job.id))).scalars().all()
    for b in other_bids:
        b.status = JobBidStatus.ACCEPTED if b.id == bid.id else JobBidStatus.REJECTED

    escrow_ref = f"kora_escrow_{job.id.hex[:8]}_{int(time.time())}"
    job.accepted_bid_id = bid.id
    job.kora_escrow_ref = escrow_ref
    job.escrow_status = JobEscrowStatus.FUNDED
    job.status = JobPostingStatus.IN_PROGRESS
    await db.commit()

    return {
        "job_id": str(job.id),
        "accepted_bid_id": str(bid.id),
        "escrow_status": job.escrow_status.value,
        "kora_escrow_ref": escrow_ref,
        "escrow_amount_usd": float(bid.bid_amount_usd),
    }


@router.post("/{job_id}/submit")
async def submit_work_and_release_85_15(
    job_id: uuid.UUID,
    qa_passed: bool,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    job = await db.get(MarketplaceJob, job_id)
    if not job or job.escrow_status != JobEscrowStatus.FUNDED or not job.accepted_bid_id:
        raise HTTPException(status_code=400, detail="Funded job escrow required before submission.")

    if not qa_passed:
        job.escrow_status = JobEscrowStatus.QA_REJECTED
        await db.commit()
        raise HTTPException(status_code=422, detail="Automated QA check failed. Escrow payout remains locked.")

    bid = await db.get(JobBid, job.accepted_bid_id)
    gross = bid.bid_amount_usd if bid else job.budget_usd
    freelancer_85 = (gross * Decimal("0.85")).quantize(Decimal("0.01"))
    platform_15 = gross - freelancer_85

    disburse_ref = f"kp_split_85_15_{job.id.hex[:8]}_{int(time.time())}"
    kora_secret = os.getenv("KORA_SECRET_KEY", "")
    if kora_secret:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                "https://api.korapay.com/merchant/api/v1/transactions/disburse",
                headers={"Authorization": f"Bearer {kora_secret}"},
                json={"reference": disburse_ref, "amount": float(freelancer_85), "currency": "USD"},
            )

    job.freelancer_payout_85pct = freelancer_85
    job.platform_fee_15pct = platform_15
    job.kora_disbursement_ref = disburse_ref
    job.escrow_status = JobEscrowStatus.RELEASED
    job.status = JobPostingStatus.COMPLETED
    job.completed_at = utc_now()
    await db.commit()

    return {
        "status": "released",
        "freelancer_payout_85pct": float(freelancer_85),
        "platform_fee_15pct": float(platform_15),
        "kora_disbursement_ref": disburse_ref,
    }
