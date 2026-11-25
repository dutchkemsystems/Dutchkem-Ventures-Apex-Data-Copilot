from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CERTIFICATION_FEE_USD = 99
PASSING_SCORE_EXCLUSIVE = 90  # Strict > 90% required

EXAM_ANSWER_KEY: dict[str, int] = {
    "q1_audio_sr": 1,
    "q2_audio_noise_floor": 2,
    "q3_audio_snr": 0,
    "q4_vision_iou": 1,
    "q5_audio_peak": 2,
    "q6_text_localization": 1,
    "q7_ndpa_pii": 0,
    "q8_prompt_injection": 2,
    "q9_wer_threshold": 1,
    "q10_escrow_split": 0,
}


class SubmitExamRequest(BaseModel):
    attempt_id: str
    answers: dict[str, int]


def generate_badge_svg(*, full_name: str, tier: str, score: float, credential_id: str, issued_iso: str) -> str:
    accent = "#F59E0B" if tier == "expert" else "#10B981"
    tier_title = "EXPERT QA ARCHITECT" if tier == "expert" else "VERIFIED QA SPECIALIST"
    safe_name = full_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180" viewBox="0 0 420 180">'
        f'<rect width="420" height="180" rx="14" fill="#0B1120" stroke="{accent}" stroke-width="2"/>'
        f'<text x="24" y="38" fill="{accent}" font-family="monospace" font-size="12" font-weight="700">{tier_title}</text>'
        f'<text x="24" y="72" fill="#F8FAFC" font-family="sans-serif" font-size="22" font-weight="700">{safe_name}</text>'
        f'<text x="24" y="104" fill="#CBD5E1" font-family="monospace" font-size="13">Score: {score:.1f}% · Dutchkem Apex Copilot</text>'
        f'<text x="24" y="138" fill="#94A3B8" font-family="monospace" font-size="11">ID: {credential_id} · Issued: {issued_iso[:10]}</text>'
        f"</svg>"
    )


def sign_credential_json(*, user_id: str, full_name: str, tier: str, score: float, credential_id: str) -> tuple[dict[str, Any], str]:
    issued_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    credential = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "id": f"urn:uuid:{credential_id}",
        "type": ["VerifiableCredential", "ApexQACertification"],
        "issuer": "Dutchkem Ventures Apex Data Copilot",
        "issuanceDate": issued_at,
        "credentialSubject": {
            "user_id": user_id,
            "full_name": full_name,
            "tier": tier,
            "score": score,
            "verified_job_board_priority": True,
        },
    }
    signing_secret = os.getenv("CREDENTIAL_SIGNING_SECRET", os.getenv("ADMIN_JWT_SECRET", "apex-dev-key"))
    canonical = json.dumps(credential, sort_keys=True, separators=(",", ":"))
    digest = hmac.new(signing_secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    credential["proof"] = {"type": "HmacSha256Signature2026", "signature": digest}
    return credential, digest


router = APIRouter(prefix="/api/certification", tags=["Phase 21E Freelancer Certification"])


@router.post("/exam/submit")
async def grade_and_issue_certification(
    body: SubmitExamRequest,
    user_id: str,
    org_id: str,
    full_name: str,
    db: AsyncSession,
):
    attempt = (
        await db.execute(
            text("SELECT id, payment_reference, payment_currency, payment_status FROM certification_attempts WHERE id = :id::uuid AND user_id = :uid::uuid"),
            {"id": body.attempt_id, "uid": user_id},
        )
    ).mappings().first()

    if not attempt or attempt["payment_status"] != "paid":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Paid $99 Kora Pay exam attempt is required before grading (fail-closed).",
        )

    correct = sum(1 for qid, ans in EXAM_ANSWER_KEY.items() if body.answers.get(qid) == ans)
    score = round((correct / len(EXAM_ANSWER_KEY)) * 100.0, 2)
    passed = score > PASSING_SCORE_EXCLUSIVE

    if not passed:
        return {"passed": False, "score": score, "required_score": "> 90%", "certified": False}

    tier = "expert" if score >= 96 else "verified"
    cred_id = str(uuid.uuid4())
    issued_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    badge_svg = generate_badge_svg(
        full_name=full_name, tier=tier, score=score, credential_id=cred_id, issued_iso=issued_iso
    )
    cred_json, sig_hex = sign_credential_json(
        user_id=user_id, full_name=full_name, tier=tier, score=score, credential_id=cred_id
    )

    await db.execute(
        text(
            """
            INSERT INTO certifications (id, user_id, org_id, tier, score, exam_session_id, payment_reference, payment_currency, payment_verified, badge_svg, credential_json, credential_sha256, issued_at)
            VALUES (:id::uuid, :uid::uuid, :oid::uuid, :tier, :score, :aid::uuid, :pref, :pcur, TRUE, :svg, :cjson::jsonb, :sig, :issued::timestamptz)
            ON CONFLICT (user_id) DO UPDATE SET
              tier = EXCLUDED.tier, score = EXCLUDED.score, badge_svg = EXCLUDED.badge_svg,
              credential_json = EXCLUDED.credential_json, credential_sha256 = EXCLUDED.credential_sha256, issued_at = EXCLUDED.issued_at
            """
        ),
        {
            "id": cred_id,
            "uid": user_id,
            "oid": org_id,
            "tier": tier,
            "score": score,
            "aid": body.attempt_id,
            "pref": attempt["payment_reference"],
            "pcur": attempt["payment_currency"],
            "svg": badge_svg,
            "cjson": json.dumps(cred_json),
            "sig": sig_hex,
            "issued": issued_iso,
        },
    )
    return {"passed": True, "score": score, "tier": tier, "badge_svg": badge_svg, "credential_json": cred_json}
