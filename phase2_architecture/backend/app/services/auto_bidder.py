from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.tenant_rls import TenantContext, get_tenant_db, require_roles
from app.models import UserRole
from app.services.proposal_generator import ProposalGeneratorService
from app.workers.job_scraper import JobBoard, JobBoardScraperWorker

router = APIRouter(prefix="/api/v1/sales-agent", tags=["Auto-Bidder Sales Agent"])


class ScrapeRequest(BaseModel):
    boards: list[JobBoard] = Field(
        default_factory=lambda: [
            JobBoard.UPWORK,
            JobBoard.MERCOR,
            JobBoard.AFTERQUERY,
            JobBoard.TELUS_DIGITAL,
        ]
    )
    keywords: list[str] = Field(
        default_factory=lambda: ["TTS", "Audio QA", "Data Annotation", "Spanish Native"]
    )


class AutoSubmitRequest(BaseModel):
    proposal_text: str = Field(min_length=50)
    proposed_rate: float = Field(gt=0)
    turnaround_days: int = Field(ge=1, le=90)
    screening_answer: str = Field(min_length=10)


@router.post("/scrape")
async def trigger_job_scrape(
    body: ScrapeRequest,
    ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    worker = JobBoardScraperWorker()
    inserted = await worker.run_scrape_cycle(
        session=db,
        org_id=ctx.org_id,
        boards=body.boards,
        keywords=body.keywords,
    )
    return {"org_id": str(ctx.org_id), "new_leads_ingested": inserted}


@router.post("/leads/{lead_id}/generate-proposal")
async def generate_lead_proposal(
    lead_id: UUID,
    ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    row = (
        await db.execute(
            text(
                """
                SELECT jl.id, jl.title, jl.raw_description, jl.extracted_requirements, o.name AS org_name
                FROM job_leads jl
                JOIN organizations o ON o.id = jl.org_id
                WHERE jl.id = :lead_id
                """
            ),
            {"lead_id": str(lead_id)},
        )
    ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job lead not found within active tenant RLS boundary.",
        )

    reqs = row["extracted_requirements"] or ["SNR > 35dB, 24kHz Mono"]
    generator = ProposalGeneratorService()
    generated = await generator.generate_for_lead(
        agency_name=row["org_name"],
        job_title=row["title"],
        job_description=row["raw_description"],
        detected_requirement=", ".join(reqs[:3]),
    )

    await db.execute(
        text(
            """
            INSERT INTO bid_submissions (
                org_id, lead_id, proposal_text, proposed_rate, turnaround_days, form_payload
            ) VALUES (
                :org_id, :lead_id, :proposal_text, :proposed_rate, :turnaround_days,
                CAST(:form_payload AS jsonb)
            )
            ON CONFLICT (lead_id) DO UPDATE SET
                proposal_text = EXCLUDED.proposal_text,
                proposed_rate = EXCLUDED.proposed_rate,
                turnaround_days = EXCLUDED.turnaround_days,
                form_payload = EXCLUDED.form_payload
            """
        ),
        {
            "org_id": str(ctx.org_id),
            "lead_id": str(lead_id),
            "proposal_text": generated.proposal_text,
            "proposed_rate": generated.suggested_rate_usd,
            "turnaround_days": generated.estimated_turnaround_days,
            "form_payload": {"screening_answer": generated.screening_answer},
        },
    )
    await db.execute(
        text("UPDATE job_leads SET status = 'proposal_drafted' WHERE id = :lead_id"),
        {"lead_id": str(lead_id)},
    )
    return generated


@router.post("/leads/{lead_id}/submit")
async def auto_submit_application(
    lead_id: UUID,
    body: AutoSubmitRequest,
    ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        text(
            """
            UPDATE bid_submissions
            SET proposal_text = :proposal_text,
                proposed_rate = :proposed_rate,
                turnaround_days = :turnaround_days,
                form_payload = CAST(:form_payload AS jsonb),
                submitted_by = :user_id,
                submitted_at = :submitted_at
            WHERE lead_id = :lead_id
            RETURNING id
            """
        ),
        {
            "lead_id": str(lead_id),
            "proposal_text": body.proposal_text,
            "proposed_rate": body.proposed_rate,
            "turnaround_days": body.turnaround_days,
            "form_payload": {
                "screening_answer": body.screening_answer,
                "auto_submitted": True,
            },
            "user_id": str(ctx.user_id),
            "submitted_at": now,
        },
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Draft proposal not found.")

    await db.execute(
        text("UPDATE job_leads SET status = 'submitted' WHERE id = :lead_id"),
        {"lead_id": str(lead_id)},
    )
    return {"lead_id": str(lead_id), "status": "submitted", "submitted_at": now.isoformat()}
