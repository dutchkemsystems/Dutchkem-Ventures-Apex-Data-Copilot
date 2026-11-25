"""
Phase 17 — Dynamic Surge Pricing & Anonymized Data Insights Models
(SQLAlchemy 2.0 + Neon PostgreSQL)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class QaSurgePricingRule(Base):
    __tablename__ = "qa_surge_pricing_rules"
    __table_args__ = (
        CheckConstraint("audio_qa_multiplier >= 0.50 AND audio_qa_multiplier <= 5.00", name="ck_audio_mult_range"),
        CheckConstraint("vision_qa_multiplier >= 0.50 AND vision_qa_multiplier <= 5.00", name="ck_vision_mult_range"),
        CheckConstraint("text_qa_multiplier >= 0.50 AND text_qa_multiplier <= 5.00", name="ck_text_mult_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    base_unit_price_usd: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=Decimal("0.1000"))
    audio_qa_multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("1.00"))
    vision_qa_multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("1.00"))
    text_qa_multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("1.00"))
    auto_language_surge_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by_admin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class LanguageDemandMultiplier(Base):
    __tablename__ = "language_demand_multipliers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    locale: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    language_label: Mapped[str] = mapped_column(String(80), nullable=False)
    active_jobs_count: Mapped[int] = mapped_column(Integer, default=0)
    demand_level: Mapped[str] = mapped_column(String(24), default="normal")  # normal | high_demand | surge
    multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("1.00"))
    auto_surge: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
