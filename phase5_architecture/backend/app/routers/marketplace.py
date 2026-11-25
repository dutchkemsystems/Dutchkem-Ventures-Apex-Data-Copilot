from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from phase1_architecture.backend.app.middleware.tenant_rls import (
    TenantContext,
    get_tenant_db,
    require_admin,
)
from phase5_architecture.backend.app.services.payout_orchestrator import (
    MarketplacePayoutOrchestrator,
)

router = APIRouter(prefix="/marketplace", tags=["phase5-expert-marketplace"])
orchestrator = MarketplacePayoutOrchestrator()


class OnboardExpertRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    native_locale: str = Field(default="es-ES", max_length=32)
    dialect: str = Field(default="Castilian", max_length=120)
    specialty: str = Field(default="Native Voice & Prosody", max_length=160)
    hourly_rate: Decimal = Field(gt=0, default=Decimal("30.00"))
    payout_rail: Literal["kora_pay", "kora_pay_global"] = "kora_pay_global"
    payout_account_ref: str = Field(min_length=4, max_length=120)


class CreateMarketplaceBatchRequest(BaseModel):
    client_name: str = Field(min_length=2, max_length=255)
    title: str = Field(min_length=3, max_length=255)
    target_locale: str = Field(default="es-ES", max_length=32)
    script_text: str = Field(min_length=10)
    budget_amount: Decimal = Field(gt=0, default=Decimal("240.00"))
    assigned_expert_id: uuid.UUID


@router.get("/experts")
async def list_experts(
    locale: Optional[str] = None,
    db: AsyncSession = Depends(get_tenant_db),
):
    stmt = (
        text(
            """
            SELECT id, org_id, full_name, email, native_locale, dialect, specialty,
                   hourly_rate, payout_rail, payout_account_ref, vetting_status,
                   sample_snr_db, completed_batches, created_at
            FROM expert_profiles
            WHERE (:locale IS NULL OR native_locale = :locale)
            ORDER BY created_at DESC
            """
        )
    )
    rows = (await db.execute(stmt, {"locale": locale})).mappings().all()
    return {"experts": [dict(r) for r in rows]}


@router.post("/experts", status_code=status.HTTP_201_CREATED)
async def onboard_expert(
    body: OnboardExpertRequest,
    ctx: TenantContext = Depends(require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    expert_id = uuid.uuid4()
    stmt = text(
        """
        INSERT INTO expert_profiles (
            id, org_id, full_name, email, native_locale, dialect, specialty,
            hourly_rate, payout_rail, payout_account_ref, vetting_status
        ) VALUES (
            :id, :org_id, :full_name, :email, :native_locale, :dialect, :specialty,
            :hourly_rate, :payout_rail, :payout_account_ref, 'vetted'
        )
        RETURNING id, org_id, full_name, email, native_locale, dialect, specialty,
                  hourly_rate, payout_rail, payout_account_ref, vetting_status, created_at
        """
    )
    row = (
        await db.execute(
            stmt,
            {
                "id": expert_id,
                "org_id": ctx.org_id,
                "full_name": body.full_name,
                "email": body.email,
                "native_locale": body.native_locale,
                "dialect": body.dialect,
                "specialty": body.specialty,
                "hourly_rate": body.hourly_rate,
                "payout_rail": body.payout_rail,
                "payout_account_ref": body.payout_account_ref,
            },
        )
    ).mappings().one()
    await db.commit()
    return {"expert": dict(row)}


@router.post("/batches", status_code=status.HTTP_201_CREATED)
async def create_batch(
    body: CreateMarketplaceBatchRequest,
    ctx: TenantContext = Depends(require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    batch_id = uuid.uuid4()
    stmt = text(
        """
        INSERT INTO marketplace_batches (
            id, org_id, assigned_expert_id, client_name, title,
            target_locale, script_text, budget_amount, status
        ) VALUES (
            :id, :org_id, :expert_id, :client_name, :title,
            :target_locale, :script_text, :budget_amount, 'assigned'
        )
        RETURNING id, org_id, assigned_expert_id, client_name, title,
                  target_locale, script_text, budget_amount, status, created_at
        """
    )
    row = (
        await db.execute(
            stmt,
            {
                "id": batch_id,
                "org_id": ctx.org_id,
                "expert_id": body.assigned_expert_id,
                "client_name": body.client_name,
                "title": body.title,
                "target_locale": body.target_locale,
                "script_text": body.script_text,
                "budget_amount": body.budget_amount,
            },
        )
    ).mappings().one()
    await db.commit()
    return {"batch": dict(row)}


@router.post("/batches/{batch_id}/submit-audio")
async def submit_human_recording_and_settle(
    batch_id: uuid.UUID,
    file: UploadFile = File(...),
    run_stt: bool = Form(default=False),
    ctx: TenantContext = Depends(require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    batch_row = (
        await db.execute(
            text(
                """
                SELECT b.id, b.script_text, b.budget_amount, b.assigned_expert_id,
                       e.payout_rail, e.payout_account_ref
                FROM marketplace_batches b
                JOIN expert_profiles e ON e.id = b.assigned_expert_id
                WHERE b.id = :batch_id AND b.org_id = :org_id
                """
            ),
            {"batch_id": batch_id, "org_id": ctx.org_id},
        )
    ).mappings().first()

    if not batch_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace batch not found within active tenant RLS boundary.",
        )

    wav_bytes = await file.read()
    settlement = await orchestrator.validate_and_settle(
        wav_bytes=wav_bytes,
        file_name=file.filename or "recording.wav",
        reference_script=batch_row["script_text"],
        gross_amount=Decimal(str(batch_row["budget_amount"])),
        payout_rail=batch_row["payout_rail"],
        payout_account_ref=batch_row["payout_account_ref"],
        batch_id=str(batch_id),
        run_stt=run_stt,
    )

    if not settlement.qa_passed or settlement.split is None:
        await db.execute(
            text(
                "UPDATE marketplace_batches SET status = 'qa_failed' WHERE id = :batch_id"
            ),
            {"batch_id": batch_id},
        )
        await db.commit()
        return {
            "settled": False,
            "batch_status": "qa_failed",
            "qa_report": settlement.qa_report.__dict__,
        }

    payout_id = uuid.uuid4()
    await db.execute(
        text(
            """
            INSERT INTO payout_transactions (
                id, org_id, batch_id, expert_id, payout_rail, gross_amount,
                platform_fee_20pct, expert_payout_80pct, external_transfer_id, status
            ) VALUES (
                :id, :org_id, :batch_id, :expert_id, :payout_rail, :gross,
                :fee, :payout, :transfer_id, 'settled'
            )
            """
        ),
        {
            "id": payout_id,
            "org_id": ctx.org_id,
            "batch_id": batch_id,
            "expert_id": batch_row["assigned_expert_id"],
            "payout_rail": settlement.payout_rail,
            "gross": settlement.split.gross_amount,
            "fee": settlement.split.platform_fee_20pct,
            "payout": settlement.split.expert_payout_80pct,
            "transfer_id": settlement.external_transfer_id,
        },
    )
    await db.execute(
        text(
            """
            UPDATE marketplace_batches
            SET status = 'delivered_and_paid', delivered_at = NOW()
            WHERE id = :batch_id
            """
        ),
        {"batch_id": batch_id},
    )
    await db.execute(
        text(
            """
            UPDATE expert_profiles
            SET completed_batches = completed_batches + 1
            WHERE id = :expert_id
            """
        ),
        {"expert_id": batch_row["assigned_expert_id"]},
    )
    await db.commit()

    return {
        "settled": True,
        "batch_status": "delivered_and_paid",
        "payout_rail": settlement.payout_rail,
        "external_transfer_id": settlement.external_transfer_id,
        "platform_fee_20pct": float(settlement.split.platform_fee_20pct),
        "expert_payout_80pct": float(settlement.split.expert_payout_80pct),
        "qa_report": settlement.qa_report.__dict__,
    }
