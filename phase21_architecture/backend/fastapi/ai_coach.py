from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

COACH_PRO_MONTHLY_USD = 19.00


class CoachAudioSummaryInput(BaseModel):
    file_name: str
    sample_rate_hz: int
    channels: int
    peak_dbfs: float
    noise_floor_dbfs: float
    snr_db: float


class CoachAnalyzeRequest(BaseModel):
    modality: Literal["audio", "vision", "text"]
    audio_files: list[CoachAudioSummaryInput] = Field(default_factory=list)


router = APIRouter(prefix="/api/coach", tags=["Phase 21G AI Coach (Coach Pro)"])


async def require_coach_pro(user_id: str, org_id: str, db: AsyncSession) -> str:
    row = (
        await db.execute(
            text(
                """
                SELECT id, status, current_period_end
                FROM coach_pro_subscriptions
                WHERE user_id = :uid::uuid
                  AND org_id = :oid::uuid
                  AND status = 'active'
                  AND current_period_end > NOW()
                ORDER BY current_period_end DESC
                LIMIT 1
                """
            ),
            {"uid": user_id, "oid": org_id},
        )
    ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Coach Pro ($19/month) subscription required to run AI Coach pre-flight QA checks.",
        )
    return str(row["id"])


@router.post("/analyze")
async def run_ai_coach_preflight(
    body: CoachAnalyzeRequest,
    user_id: str,
    org_id: str,
    db: AsyncSession,
) -> dict[str, Any]:
    # Fail closed unless an active $19/month Coach Pro subscription exists
    sub_id = await require_coach_pro(user_id, org_id, db)

    issues: list[dict[str, Any]] = []
    suggestions: list[str] = []
    passed_items = 0
    total_items = max(1, len(body.audio_files))

    for idx, clip in enumerate(body.audio_files, start=1):
        clip_ok = True
        if clip.noise_floor_dbfs >= -70.0:
            clip_ok = False
            delta = round(clip.noise_floor_dbfs - (-70.0), 1)
            issues.append(
                {
                    "item": f"Audio {idx} ({clip.file_name})",
                    "metric": "noise_floor_dbfs",
                    "measured": f"{clip.noise_floor_dbfs:.1f} dBFS",
                    "target": "< -70.0 dBFS",
                    "summary": f"Audio {idx} fails noise floor by {delta:.1f} dB ({clip.noise_floor_dbfs:.1f} dBFS vs < -70.0 dBFS)",
                }
            )
        if clip.snr_db <= 35.0:
            clip_ok = False
            delta = round(35.0 - clip.snr_db, 1)
            issues.append(
                {
                    "item": f"Audio {idx} ({clip.file_name})",
                    "metric": "snr_db",
                    "measured": f"{clip.snr_db:.1f} dB",
                    "target": "> 35.0 dB",
                    "summary": f"Audio {idx} fails SNR by {delta:.1f} dB ({clip.snr_db:.1f} dB vs > 35.0 dB)",
                }
            )
        if clip.sample_rate_hz != 24000 or clip.channels != 1:
            clip_ok = False
            issues.append(
                {
                    "item": f"Audio {idx} ({clip.file_name})",
                    "metric": "container",
                    "measured": f"{clip.sample_rate_hz}Hz / {clip.channels}ch",
                    "target": "24000Hz / 1ch Mono",
                    "summary": f"Audio {idx} must be exported as 24kHz Mono PCM WAV",
                }
            )
        if clip_ok:
            passed_items += 1

    predicted_pass_rate = round((passed_items / total_items) * 100.0, 1)
    if issues:
        suggestions.append(
            "Engage -18 dB acoustic booth high-pass filter, record 12 cm from mic, and re-export flagged clips as 24kHz Mono WAV."
        )
    else:
        suggestions.append("All submitted deliverables satisfy deterministic Apex QA gates for immediate job submission.")

    run_id = str(uuid.uuid4())
    return {
        "run_id": run_id,
        "subscription_id": sub_id,
        "tier": "coach_pro",
        "monthly_price_usd": COACH_PRO_MONTHLY_USD,
        "predicted_pass_rate_pct": predicted_pass_rate,
        "verdict": "ready_for_job" if predicted_pass_rate == 100.0 and not issues else "needs_remediation",
        "issues_to_fix": issues,
        "suggestions": suggestions,
        "analyzed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
