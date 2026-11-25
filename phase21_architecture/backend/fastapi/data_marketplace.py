from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

DATA_MARKETPLACE_COMMISSION_RATE = 0.10  # 10% platform commission via Kora Pay split

PII_PATTERNS = [
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"\b\d{11}\b"),  # Nigerian NIN / BVN length
    re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b"),
]

DatasetCategory = Literal[
    "audio_speech",
    "vision_bbox",
    "multilingual_text",
    "red_team_eval",
]


class CreateDatasetListingRequest(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    description: str = Field(min_length=15, max_length=2000)
    category: DatasetCategory
    sample_count: int = Field(gt=0)
    price: float = Field(gt=0)
    anonymized: bool
    qa_validated: bool
    qa_score: float = Field(ge=0.0, le=100.0)
    qa_report_summary: str = Field(min_length=5)
    source_ref: str = Field(min_length=3)
    preview_samples: list[str] = Field(default_factory=list)


class InitializeDatasetPurchaseRequest(BaseModel):
    dataset_id: str
    buyer_org_name: str = Field(min_length=2)
    buyer_email: str
    currency: Literal["USD", "NGN", "GBP"] = "USD"


def contains_unmasked_pii(values: list[str]) -> bool:
    for val in values:
        for pat in PII_PATTERNS:
            if pat.search(val):
                return True
    return False


def compute_kora_split(price_usd: float) -> tuple[float, float]:
    commission = round(price_usd * DATA_MARKETPLACE_COMMISSION_RATE, 2)
    seller_payout = round(price_usd - commission, 2)
    return commission, seller_payout


router = APIRouter(prefix="/api/data-marketplace", tags=["Phase 21F Data Marketplace"])


@router.post("/datasets", status_code=status.HTTP_201_CREATED)
async def list_dataset_for_sale(
    body: CreateDatasetListingRequest,
    seller_id: str,
    org_id: str,
    db: AsyncSession,
):
    # Fail closed if QA validation gate has not passed
    if not body.qa_validated or body.qa_score < 85.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Dataset cannot be listed before passing QA validation (qa_validated=true and qa_score >= 85).",
        )

    # Fail closed if NDPA PII anonymization is missing or raw PII leaks into text/samples
    if not body.anonymized or contains_unmasked_pii(
        [body.title, body.description, *body.preview_samples]
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Dataset must be anonymized (NDPA 2023) with zero unmasked emails, phone numbers, or NIN/BVN strings.",
        )

    dataset_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO datasets (
              id, seller_id, org_id, title, description, category,
              sample_count, price, anonymized, qa_validated, qa_score,
              qa_report_summary, source_ref, preview_samples, status
            )
            VALUES (
              :id::uuid, :seller_id::uuid, :org_id::uuid, :title, :description, :category,
              :sample_count, :price, TRUE, TRUE, :qa_score,
              :qa_report_summary, :source_ref, CAST(:preview_samples AS jsonb), 'listed'
            )
            """
        ),
        {
            "id": dataset_id,
            "seller_id": seller_id,
            "org_id": org_id,
            "title": body.title.strip(),
            "description": body.description.strip(),
            "category": body.category,
            "sample_count": body.sample_count,
            "price": round(body.price, 2),
            "qa_score": round(body.qa_score, 2),
            "qa_report_summary": body.qa_report_summary.strip(),
            "source_ref": body.source_ref.strip(),
            "preview_samples": json.dumps(body.preview_samples[:5]),
        },
    )
    await db.commit()
    return {"id": dataset_id, "status": "listed", "qa_validated": True, "anonymized": True}


@router.get("/purchases/{purchase_id}/download")
async def download_purchased_dataset(
    purchase_id: str,
    token: str,
    db: AsyncSession,
):
    row = (
        await db.execute(
            text(
                """
                SELECT p.payment_status, p.download_token_sha256, d.title, d.category, d.sample_count
                FROM dataset_purchases p
                JOIN datasets d ON d.id = p.dataset_id
                WHERE p.id = :pid::uuid
                """
            ),
            {"pid": purchase_id},
        )
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Dataset purchase record not found.")

    if row["payment_status"] != "paid" or not row["download_token_sha256"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Kora Pay settlement required before downloading dataset artifact (fail-closed).",
        )

    presented_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(presented_hash, row["download_token_sha256"]):
        raise HTTPException(status_code=403, detail="Invalid dataset download authorization token.")

    return {
        "purchase_id": purchase_id,
        "dataset_title": row["title"],
        "category": row["category"],
        "sample_count": row["sample_count"],
        "downloaded_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
