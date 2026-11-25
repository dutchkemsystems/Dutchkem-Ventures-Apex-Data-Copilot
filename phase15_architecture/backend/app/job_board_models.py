"""
Phase 15: Two-Sided AI Data Job Board & Automated 85/15 Escrow Split Schema (SQLAlchemy 2.0 + PostgreSQL RLS)
Tracks $500 Kora Pay client job listing fees, freelancer bids, funded Kora Pay escrows, and 85/15 payouts.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class JobPostingStatus(str, enum.Enum):
    AWAITING_LISTING_FEE = "awaiting_listing_fee"
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class JobBidStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class JobEscrowStatus(str, enum.Enum):
    UNFUNDED = "unfunded"
    FUNDED = "funded"
    RELEASED = "released"
    QA_REJECTED = "qa_rejected"


class MarketplaceJob(Base):
    __tablename__ = "marketplace_jobs"
    __table_args__ = (
        Index("ix_marketplace_jobs_status", "status"),
        CheckConstraint("listing_fee_usd = 500.00", name="ck_job_listing_fee_500"),
        CheckConstraint("budget_usd > 0", name="ck_job_budget_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    client_org_name: Mapped[str] = mapped_column(String(140), nullable=False)
    client_email: Mapped[str] = mapped_column(String(180), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    qa_type: Mapped[str] = mapped_column(String(24), nullable=False, default="audio")
    budget_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    listing_fee_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("500.00"))
    listing_fee_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    listing_currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    kora_listing_ref: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    status: Mapped[JobPostingStatus] = mapped_column(
        SAEnum(JobPostingStatus, name="job_posting_status_enum"),
        nullable=False,
        default=JobPostingStatus.AWAITING_LISTING_FEE,
    )
    escrow_status: Mapped[JobEscrowStatus] = mapped_column(
        SAEnum(JobEscrowStatus, name="job_escrow_status_enum"),
        nullable=False,
        default=JobEscrowStatus.UNFUNDED,
    )
    kora_escrow_ref: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    accepted_bid_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    freelancer_payout_85pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    platform_fee_15pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    kora_disbursement_ref: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class JobBid(Base):
    __tablename__ = "marketplace_job_bids"
    __table_args__ = (
        Index("ix_job_bids_job_status", "job_id", "status"),
        CheckConstraint("bid_amount_usd > 0", name="ck_bid_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_jobs.id", ondelete="CASCADE"), nullable=False
    )
    applicant_org_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    freelancer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    freelancer_email: Mapped[str] = mapped_column(String(180), nullable=False)
    bid_amount_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    turnaround_days: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    pitch: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[JobBidStatus] = mapped_column(
        SAEnum(JobBidStatus, name="job_bid_status_enum"),
        nullable=False,
        default=JobBidStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
