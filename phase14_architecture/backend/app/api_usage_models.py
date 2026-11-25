"""
Phase 14: B2B API Gateway & Metered Usage Schema (SQLAlchemy 2.0 + PostgreSQL RLS)
Zero-Trust multi-tenant API key hashing, per-call usage metering, and Kora Pay end-of-month invoicing.
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
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class ApiKeyStatus(str, enum.Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    PAST_DUE = "past_due"


class MeteredInvoiceStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"


class ApiKey(Base):
    __tablename__ = "b2b_api_keys"
    __table_args__ = (
        Index("ix_b2b_api_keys_org_status", "org_id", "status"),
        CheckConstraint("unbilled_calls >= 0", name="ck_api_key_unbilled_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(24), nullable=False)  # e.g., sk_live_9f4a1c...
    key_hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    scopes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=lambda: ["audio", "vision", "text"])
    total_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unbilled_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit_price_usd: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("0.1000"))
    status: Mapped[ApiKeyStatus] = mapped_column(
        SAEnum(ApiKeyStatus, name="b2b_api_key_status_enum"),
        nullable=False,
        default=ApiKeyStatus.ACTIVE,
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ApiUsageLog(Base):
    __tablename__ = "b2b_api_usage_logs"
    __table_args__ = (Index("ix_b2b_usage_org_created", "org_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    api_key_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("b2b_api_keys.id", ondelete="CASCADE"), nullable=False, index=True
    )
    endpoint: Mapped[str] = mapped_column(String(80), nullable=False)  # /api/v1/qa/audio | vision | text
    http_status: Mapped[int] = mapped_column(Integer, nullable=False)
    passed_gate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("0.1000"))
    billed_invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ApiMeteredInvoice(Base):
    __tablename__ = "b2b_metered_invoices"
    __table_args__ = (Index("ix_b2b_invoices_org_status", "org_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kora_reference: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    billing_period: Mapped[str] = mapped_column(String(24), nullable=False)  # YYYY-MM
    total_calls: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    charge_currency: Mapped[str] = mapped_column(String(8), nullable=False, default="NGN")
    charge_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[MeteredInvoiceStatus] = mapped_column(
        SAEnum(MeteredInvoiceStatus, name="b2b_metered_invoice_status_enum"),
        nullable=False,
        default=MeteredInvoiceStatus.PENDING,
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


"""
PostgreSQL RLS Migration SQL (Neon PostgreSQL):

ALTER TABLE b2b_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_metered_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY b2b_keys_org_isolation ON b2b_api_keys
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
CREATE POLICY b2b_usage_org_isolation ON b2b_api_usage_logs
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
CREATE POLICY b2b_invoices_org_isolation ON b2b_metered_invoices
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
"""
