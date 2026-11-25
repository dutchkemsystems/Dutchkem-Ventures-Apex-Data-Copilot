from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

router = APIRouter(tags=["Phase 20A Support Tickets"])

PLATFORM_FAQ_CONTEXT = """
Dutchkem Ventures Apex Data Copilot Platform FAQ:
1. Kora Pay Escrow & Payouts: Marketplace contracts settle via Kora Pay (85% annotator payout / 15% platform fee). NGN local settlements and USD/GBP/EUR payouts clear into verified bank or mobile money recipients. Sensitive Kora split references are masked for users and unmasked only for Finance/Super Admins.
2. AI QA Evaluation Engines: Supports Vision Bounding-Box IoU QA, Audio TTS MOS & Whisper STT transcription verification, and Text Localization accuracy scoring.
3. Security & 2FA: Two-factor authentication (otplib TOTP + 10 single-use backup codes) is optional for workspace users at /dashboard/settings/security and mandatory for platform staff.
4. B2B API Gateway: Programmatic keys (sk_live_...) support batch multimodal evaluation with metered Kora billing.
5. Affiliates & Auto-Bidder: Referrers earn 10% recurring commission tracked via /ref/<user_id>. Admins can draft proposals via the Sales Agent.
"""


class CreateTicketRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=160)
    message: str = Field(..., min_length=5, max_length=4000)


class EscalateTicketRequest(BaseModel):
    reason: Optional[str] = Field(default="User clicked 'This didn't help'", max_length=500)


class AdminReplyRequest(BaseModel):
    reply: str = Field(..., min_length=2, max_length=4000)
    close_ticket: bool = False


class SupportTicketOut(BaseModel):
    id: str
    user_id: str
    subject: str
    message: str
    status: Literal["open", "ai_resolved", "escalated", "admin_replied", "closed"]
    ai_response: Optional[str] = None
    ai_confidence: Optional[float] = None
    escalated_to_admin: bool = False
    admin_reply: Optional[str] = None
    created_at: str
    updated_at: str


def _get_gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY is not configured for the AI Support Agent.",
        )
    return genai.Client(api_key=api_key)


async def generate_faq_support_reply(subject: str, message: str) -> tuple[str, float]:
    client = _get_gemini_client()
    response = client.models.generate_content(
        model="gemini-4-hydrogen",
        contents=f"Subject: {subject}\nQuestion: {message}",
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are the Dutchkem Ventures Apex Data Copilot automated Tier-1 support assistant. "
                "Answer concisely using the verified FAQ context below. If the question requires manual account "
                "intervention (e.g. escrow dispute, bank settlement reversal), explain the steps clearly and advise escalation.\n\n"
                + PLATFORM_FAQ_CONTEXT
            ),
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "ai_response": {"type": "STRING"},
                    "confidence": {"type": "NUMBER"},
                },
                "required": ["ai_response", "confidence"],
            },
        ),
    )
    import json

    parsed = json.loads(response.text or "{}")
    return str(parsed.get("ai_response", "")).strip(), float(parsed.get("confidence", 0.85))


def require_user_plane(request: Request) -> str:
    user_id = request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User plane session required.")
    return user_id


def require_admin_plane(request: Request) -> str:
    if request.headers.get("x-plane") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin plane (aud='apex:admin') required.")
    return request.headers.get("x-admin-id", "adm-super-001")


# In production, swap _ticket_repo with asyncpg / SQLAlchemy session backed by 020a_support_tickets.sql
_ticket_repo: dict[str, SupportTicketOut] = {}


@router.post("/api/user/support/tickets", response_model=SupportTicketOut, status_code=201)
async def create_support_ticket(
    body: CreateTicketRequest,
    user_id: str = Depends(require_user_plane),
) -> SupportTicketOut:
    now = datetime.now(timezone.utc).isoformat()
    ai_answer, confidence = await generate_faq_support_reply(body.subject, body.message)
    ticket = SupportTicketOut(
        id=str(uuid4()),
        user_id=user_id,
        subject=body.subject.strip(),
        message=body.message.strip(),
        status="ai_resolved",
        ai_response=ai_answer,
        ai_confidence=confidence,
        escalated_to_admin=False,
        created_at=now,
        updated_at=now,
    )
    _ticket_repo[ticket.id] = ticket
    return ticket


@router.post("/api/user/support/tickets/{ticket_id}/escalate", response_model=SupportTicketOut)
async def escalate_support_ticket(
    ticket_id: str,
    body: EscalateTicketRequest,
    user_id: str = Depends(require_user_plane),
) -> SupportTicketOut:
    ticket = _ticket_repo.get(ticket_id)
    if not ticket or ticket.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")
    ticket.escalated_to_admin = True
    ticket.status = "escalated"
    ticket.updated_at = datetime.now(timezone.utc).isoformat()
    return ticket


@router.get("/api/admin/support/tickets")
async def list_admin_support_tickets(admin_id: str = Depends(require_admin_plane)) -> dict:
    tickets = list(_ticket_repo.values())
    escalated = [t for t in tickets if t.escalated_to_admin]
    return {"admin_id": admin_id, "escalated": escalated, "tickets": tickets}


@router.post("/api/admin/support/tickets/{ticket_id}/reply", response_model=SupportTicketOut)
async def reply_support_ticket(
    ticket_id: str,
    body: AdminReplyRequest,
    admin_id: str = Depends(require_admin_plane),
) -> SupportTicketOut:
    ticket = _ticket_repo.get(ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")
    ticket.admin_reply = body.reply.strip()
    ticket.status = "closed" if body.close_ticket else "admin_replied"
    ticket.updated_at = datetime.now(timezone.utc).isoformat()
    return ticket
