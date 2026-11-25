"""
Phase 16 — Affiliate & Referral Engine Database Models (SQLAlchemy 2.0 + Neon PostgreSQL RLS)
Tracks /ref/{user_id} clicks, 30-day cookie attributions, 20% recurring Pro/Agency commissions,
and Kora Pay commission disbursements (NGN / USD / GBP). Zero Stripe dependencies.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CommissionStatus(str, enum.Enum):
    CREDITED = "credited"
    PAID_OUT = "paid_out"
    VOIDED = "voided"


class ReferralClick(Base):
    __tablename__ = "referral_clicks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    visitor_fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)
    landing_path: Mapped[str] = mapped_column(String(255), default="/")
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    clicked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ReferralAttribution(Base):
    __tablename__ = "referral_attributions"
    __table_args__ = (
        Index("ix_referral_attributions_referred_org", "referred_org_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    referred_org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", onDelete="CASCADE"), nullable=False
    )
    referred_user_email: Mapped[str] = mapped_column(String(255), nullable=False)
    subscription_tier: Mapped[str] = mapped_column(String(32), default="trial")
    cookie_value: Mapped[str] = mapped_column(String(128), nullable=False)
    attributed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    converted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ReferralCommission(Base):
    __tablename__ = "referral_commissions"
    __table_args__ = (
        CheckConstraint("commission_rate = 0.2000", name="ck_affiliate_20pct_rate"),
        CheckConstraint("commission_usd >= 0", name="ck_commission_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    referred_org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", onDelete="CASCADE"), nullable=False
    )
    kora_subscription_ref: Mapped[str] = mapped_column(String(128), nullable=False)
    plan_tier: Mapped[str] = mapped_column(String(32), nullable=False)  # "pro" ($49) or "agency" ($199)
    gross_subscription_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    commission_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.2000"))
    commission_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    billing_cycle_month: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[CommissionStatus] = mapped_column(
        SAEnum(CommissionStatus, name="affiliate_commission_status_enum"),
        default=CommissionStatus.CREDITED,
    )
    payout_reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    payout_currency: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    paid_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
