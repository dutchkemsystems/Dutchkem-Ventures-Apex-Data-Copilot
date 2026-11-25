"""
Phase 18A — Kora Pay-Only 85/15 Multi-Currency Escrow, Tax Receipts & Webhook Idempotency Schema
(SQLAlchemy 2.0 + Neon PostgreSQL)
Zero Stripe dependencies. Supports NGN and USD, T+2 settlement tracking, and VAT-compliant receipts.
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
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class EscrowCurrency(str, enum.Enum):
    NGN = "NGN"
    USD = "USD"


class KoraEscrowStatus(str, enum.Enum):
    PENDING_FUNDING = "pending_funding"
    FUNDED = "funded"
    RELEASED = "released"
    SETTLED = "settled"
    DISPUTED = "disputed"
    REFUNDED = "refunded"
    FAILED = "failed"


class User(Base):
    """User extension storing freelancer Kora Pay recipient onboarding ID."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="annotator", nullable=False)
    kora_recipient_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    preferred_payout_currency: Mapped[EscrowCurrency] = mapped_column(
        SAEnum(EscrowCurrency, name="kora_currency_enum"),
        default=EscrowCurrency.USD,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class EscrowLedger(Base):
    """
    Kora Pay-only 85/15 multi-currency escrow ledger.
    Funds remain in the platform merchant balance until QA passes and triggers apex-marketplace-split.
    """
    __tablename__ = "escrow_ledger"
    __table_args__ = (
        CheckConstraint("gross_amount > 0", name="ck_kora_escrow_positive_gross"),
        CheckConstraint("platform_fee >= 0", name="ck_kora_escrow_nonneg_fee"),
        CheckConstraint("freelancer_payout >= 0", name="ck_kora_escrow_nonneg_payout"),
        CheckConstraint(
            "platform_fee + freelancer_payout = gross_amount",
            name="ck_kora_escrow_85_15_invariant",
        ),
        Index("ix_escrow_ledger_task_status", "task_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    freelancer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[EscrowCurrency] = mapped_column(
        SAEnum(EscrowCurrency, name="kora_currency_enum", create_type=False),
        nullable=False,
    )
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)       # 15%
    freelancer_payout: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)  # 85%
    kora_transaction_reference: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True)
    kora_split_reference: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True)
    split_rule_name: Mapped[str] = mapped_column(String(64), default="apex-marketplace-split", nullable=False)
    status: Mapped[KoraEscrowStatus] = mapped_column(
        SAEnum(KoraEscrowStatus, name="kora_escrow_status_enum"),
        default=KoraEscrowStatus.PENDING_FUNDING,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expected_settlement_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    tax_receipt_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)


class TaxReceipt(Base):
    """Tax-compliant receipt breakdown (Gross, 15% Platform Fee, VAT on Fee, 85% Net Payout)."""
    __tablename__ = "tax_receipts"
    __table_args__ = (
        CheckConstraint("gross_amount > 0", name="ck_tax_receipt_gross_pos"),
        CheckConstraint("vat_on_fee >= 0", name="ck_tax_receipt_vat_nonneg"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    escrow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("escrow_ledger.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    vat_on_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    net_payout: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    kora_transaction_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class WebhookEvent(Base):
    """Idempotency deduplication table keyed by Kora Pay X-Event-ID header."""
    __tablename__ = "webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    payload_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
