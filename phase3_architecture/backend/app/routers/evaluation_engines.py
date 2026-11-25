from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.audio_qa import AudioQaEngine
from app.engines.text_qa import TextLocalizationQaEngine
from app.engines.vision_qa import BoundingBox, VisionQaEngine
from app.middleware.tenant_rls import TenantContext, get_tenant_db, require_roles
from app.models import UserRole

router = APIRouter(prefix="/api/v1/qa", tags=["Evaluation Engines"])


class BoxInput(BaseModel):
    id: str
    label: str
    x1: float
    y1: float
    x2: float
    y2: float


class VisionQaRequest(BaseModel):
    task_id: UUID | None = None
    candidate_boxes: list[BoxInput]
    reference_boxes: list[BoxInput]


class TextQaRequest(BaseModel):
    task_id: UUID | None = None
    source_text: str = Field(min_length=1)
    candidate_output: str = Field(min_length=1)
    target_locale: str = "es-ES"
    rubric_criteria: list[str] = Field(
        default_factory=lambda: [
            "Semantic Accuracy",
            "Fluency & Idiomatic Tone",
            "Terminology Consistency",
            "Format & Constraint Adherence",
        ]
    )


@router.post("/audio")
async def evaluate_audio_asset(
    file: UploadFile = File(...),
    reference_transcript: str | None = Form(default=None),
    task_id: UUID | None = Form(default=None),
    _ctx: TenantContext = Depends(require_roles(UserRole.ADMIN, UserRole.ANNOTATOR)),
    db: AsyncSession = Depends(get_tenant_db),
):
    wav_bytes = await file.read()
    engine = AudioQaEngine()
    report = engine.evaluate_wav_bytes(wav_bytes, reference_transcript)

    if task_id is not None:
        score = 0.99 if report.passed else 0.45
        await db.execute(
            text("UPDATE tasks SET verifier_score = :score WHERE id = :task_id"),
            {"score": score, "task_id": str(task_id)},
        )

    return report


@router.post("/vision")
async def evaluate_vision_boxes(
    body: VisionQaRequest,
    _ctx: TenantContext = Depends(require_roles(UserRole.ADMIN, UserRole.ANNOTATOR)),
    db: AsyncSession = Depends(get_tenant_db),
):
    engine = VisionQaEngine()
    report = engine.evaluate_annotations(
        candidate_boxes=[BoundingBox(**b.model_dump()) for b in body.candidate_boxes],
        reference_boxes=[BoundingBox(**b.model_dump()) for b in body.reference_boxes],
    )
    if body.task_id is not None:
        await db.execute(
            text("UPDATE tasks SET verifier_score = :score WHERE id = :task_id"),
            {"score": report.mean_iou, "task_id": str(body.task_id)},
        )
    return report


@router.post("/text")
async def evaluate_text_localization(
    body: TextQaRequest,
    _ctx: TenantContext = Depends(require_roles(UserRole.ADMIN, UserRole.ANNOTATOR)),
    db: AsyncSession = Depends(get_tenant_db),
):
    if not body.rubric_criteria:
        raise HTTPException(status_code=400, detail="At least one rubric criterion required.")
    engine = TextLocalizationQaEngine()
    report = engine.grade_output(
        source_text=body.source_text,
        candidate_output=body.candidate_output,
        target_locale=body.target_locale,
        rubric_criteria=body.rubric_criteria,
    )
    if body.task_id is not None:
        normalized = round(report.overall_score / 5.0, 3)
        await db.execute(
            text("UPDATE tasks SET verifier_score = :score WHERE id = :task_id"),
            {"score": normalized, "task_id": str(body.task_id)},
        )
    return report
