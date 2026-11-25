export interface CodeArtifact {
  id: string;
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;
  title: string;
  path: string;
  language: string;
  description: string;
  code: string;
}

export const PHASE_1_ARTIFACTS: CodeArtifact[] = [
  {
    id: "sqlalchemy-schema",
    phase: 1,
    title: "PostgreSQL Schema (SQLAlchemy 2.0)",
    path: "phase1_architecture/backend/app/models.py",
    language: "python",
    description:
      "Multi-tenant relational schema covering organizations, users, projects, tasks, and the 80/20 escrow_ledger with database-level check constraints.",
    code: `from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Enum as SAEnum,
    ForeignKey, Index, Numeric, String, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class SubscriptionTier(str, enum.Enum):
    STARTER = "starter"
    GROWTH = "growth"
    ENTERPRISE_WHITELABEL = "enterprise_whitelabel"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ANNOTATOR = "annotator"
    CLIENT = "client"


class ProjectRoleType(str, enum.Enum):
    TTS_QA = "tts_qa"
    PROMPT_ENG = "prompt_eng"
    RED_TEAM = "red_team"


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class EscrowStatus(str, enum.Enum):
    HELD = "held"
    RELEASED = "released"
    DISPUTED = "disputed"
    REFUNDED = "refunded"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    subscription_tier: Mapped[SubscriptionTier] = mapped_column(
        SAEnum(SubscriptionTier, name="subscription_tier_enum"),
        nullable=False,
        default=SubscriptionTier.GROWTH,
    )
    korapay_customer_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("org_id", "email", name="uq_users_org_email"),
        Index("ix_users_org_role", "org_id", "role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="user_role_enum"), nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (Index("ix_projects_org_status", "org_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_type: Mapped[ProjectRoleType] = mapped_column(SAEnum(ProjectRoleType, name="project_role_type_enum"), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(SAEnum(ProjectStatus, name="project_status_enum"), nullable=False)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_org_status", "org_id", "status"),
        CheckConstraint("verifier_score IS NULL OR (verifier_score >= 0.0 AND verifier_score <= 1.0)", name="ck_tasks_verifier_score_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    input_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    output_payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus, name="task_status_enum"), nullable=False, default=TaskStatus.PENDING)
    verifier_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3), nullable=True)


class EscrowLedger(Base):
    __tablename__ = "escrow_ledger"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_escrow_amount_non_negative"),
        CheckConstraint("platform_fee + annotator_payout = amount", name="ck_escrow_split_sum_equals_amount"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    annotator_payout: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[EscrowStatus] = mapped_column(SAEnum(EscrowStatus, name="escrow_status_enum"), nullable=False, default=EscrowStatus.HELD)

    @classmethod
    def calculate_split(cls, gross_amount: Decimal) -> tuple[Decimal, Decimal]:
        fee = (gross_amount * Decimal("0.20")).quantize(Decimal("0.01"))
        return fee, gross_amount - fee`,
  },
  {
    id: "rls-middleware",
    phase: 1,
    title: "FastAPI Multi-Tenant RLS Middleware",
    path: "phase1_architecture/backend/app/middleware/tenant_rls.py",
    language: "python",
    description:
      "Extracts verified JWT tenant claims, binds ContextVar isolation per request, and configures PostgreSQL SET LOCAL app.current_org_id.",
    code: `from contextvars import ContextVar
from dataclasses import dataclass
from uuid import UUID
import jwt
from fastapi import Depends, HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.database import open_tenant_session
from app.models import UserRole

@dataclass(frozen=True, slots=True)
class TenantContext:
    org_id: UUID
    user_id: UUID
    role: UserRole

_tenant_ctx_var: ContextVar[TenantContext | None] = ContextVar("tenant_context", default=None)

class TenantIsolationMiddleware(BaseHTTPMiddleware):
    EXEMPT_PATHS = {"/health", "/ready", "/api/v1/auth/login"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.EXEMPT_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Bearer token required."})

        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            ctx = TenantContext(
                org_id=UUID(payload["org_id"]),
                user_id=UUID(payload["sub"]),
                role=UserRole(payload["role"]),
            )
        except (jwt.PyJWTError, KeyError, ValueError) as exc:
            return JSONResponse(status_code=401, content={"detail": f"Invalid tenant token: {exc}"})

        token_handle = _tenant_ctx_var.set(ctx)
        try:
            return await call_next(request)
        finally:
            _tenant_ctx_var.reset(token_handle)

async def get_tenant_db(ctx: TenantContext = Depends(get_current_tenant_context)):
    async for session in open_tenant_session(ctx.org_id, ctx.user_id, ctx.role.value):
        yield session`,
  },
  {
    id: "postgres-rls-sql",
    phase: 1,
    title: "PostgreSQL Row-Level Security Policies",
    path: "phase1_architecture/backend/migrations/001_enable_rls.sql",
    language: "sql",
    description:
      "Enforces strict database-level tenant isolation across organizations, users, projects, tasks, and escrow_ledger.",
    code: `CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION app_current_user_role() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_user_role', true), '');
$$ LANGUAGE SQL STABLE;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY org_self_isolation ON organizations
  USING (id = app_current_org_id())
  WITH CHECK (id = app_current_org_id());

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tasks_org_select ON tasks
  FOR SELECT USING (
    org_id = app_current_org_id()
    AND (app_current_user_role() IN ('admin', 'client') OR assignee_id = app_current_user_id())
  );

ALTER TABLE escrow_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY escrow_org_select ON escrow_ledger
  FOR SELECT USING (
    org_id = app_current_org_id()
    AND (
      app_current_user_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = escrow_ledger.task_id AND t.assignee_id = app_current_user_id()
      )
    )
  );`,
  },
  {
    id: "nextjs-layout",
    phase: 1,
    title: "Next.js Multi-Tenant Dashboard Layout",
    path: "phase1_architecture/nextjs/components/DashboardShell.tsx",
    language: "tsx",
    description:
      "Role-aware App Router layout dynamically rendering Organization Admin controls versus Annotator Workbench views.",
    code: `export default async function MultiTenantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await resolveTenantSession();
  if (!session) redirect("/login");
  return <DashboardShell session={session}>{children}</DashboardShell>;
}

// DashboardShell filters navigation & hides admin billing/margin from annotators:
export function DashboardShell({ session, children }: DashboardShellProps) {
  const isAdmin = session.role === "admin";
  const visibleNav = MULTI_TENANT_NAV.filter((item) => item.roles.includes(session.role));

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between">
        <div>
          <div className="px-6 py-5 border-b border-slate-200">
            <p className="text-base font-semibold text-slate-900">{session.orgName}</p>
            <p className="mt-1 text-xs text-slate-500">
              {session.subscriptionTier.replace("_", " ")} · {session.role}
            </p>
          </div>
          <nav className="p-3 space-y-1">
            {visibleNav.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-slate-200 text-xs text-slate-600">
          <p className="font-medium text-slate-900">{session.userName}</p>
          {isAdmin ? (
            <p className="font-mono tabular-nums">Org ID: {session.orgId.slice(0, 8)}</p>
          ) : (
            <p className="font-mono tabular-nums">Rate: \${session.hourlyRate.toFixed(2)}/hr</p>
          )}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-8 border-b border-slate-200 bg-white flex items-center justify-between">
          <span>{session.orgName} / {isAdmin ? "Organization Admin Console" : "Annotator Workbench"}</span>
          {isAdmin && <Link href="/dashboard/projects?new=1">Create Project</Link>}
        </header>
        <main className="flex-1 p-8 max-w-[1200px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}`,
  },
  {
    id: "job-scraper-worker",
    phase: 2,
    title: "Job Board Scraper Worker (Python)",
    path: "phase2_architecture/backend/app/workers/job_scraper.py",
    language: "python",
    description:
      "Async Python worker scraping Upwork, Mercor, AfterQuery, and TELUS Digital with keyword & technical requirement extraction.",
    code: `class JobBoardScraperWorker:
    REQUIREMENT_PATTERNS = (
        (r"24\\s*kHz|48\\s*kHz|mono|wav", "24kHz Mono WAV"),
        (r"SNR\\s*[>>=]+\\s*\\d+\\s*dB", "SNR > 35dB"),
        (r"noise\\s*floor\\s*[<=-]+\\s*-?\\d+\\s*dB", "Noise Floor < -70dB"),
        (r"IoU\\s*[>>=]+\\s*0\\.\\d+", "YOLOv8 IoU >= 0.70"),
        (r"Spanish\\s*Native|ES-ES|ES-MX", "Native Spanish (ES)"),
    )

    async def run_scrape_cycle(self, session, org_id, boards, keywords=None):
        active_keywords = keywords or ["TTS", "Audio QA", "Data Annotation", "Spanish Native"]
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            results = await asyncio.gather(
                *[self.fetch_board_listings(client, b, active_keywords) for b in boards],
                return_exceptions=True,
            )
        # Insert matching leads scoped strictly to org_id (ON CONFLICT DO NOTHING)`,
  },
  {
    id: "proposal-generator",
    phase: 2,
    title: "LLM Proposal Generator Service",
    path: "phase2_architecture/backend/app/services/proposal_generator.py",
    language: "python",
    description:
      "Parses Job Descriptions and invokes Gemini to synthesize a 3-paragraph agency proposal plus structured bid metadata.",
    code: `class ProposalGeneratorService:
    def build_prompt(self, agency_name: str, job_title: str, job_description: str, detected_requirement: str) -> str:
        return (
            f"Agency Name: {agency_name}\\nContract Title: {job_title}\\n"
            f"Job Description:\\n{job_description}\\n\\n"
            f"You are an expert agency owner at {agency_name}. We have built a custom AI platform "
            f"that automatically validates {detected_requirement}. We can deliver this at 3x the "
            "speed with 100% accuracy. Write a 3-paragraph proposal proving we are the best choice "
            "for this project."
        )`,
  },
  {
    id: "auto-bidder-router",
    phase: 2,
    title: "Auto-Bidder FastAPI Router & RLS",
    path: "phase2_architecture/backend/app/services/auto_bidder.py",
    language: "python",
    description:
      "Admin-only FastAPI endpoints for triggering scrapes, generating proposals, and submitting populated application forms.",
    code: `@router.post("/leads/{lead_id}/submit")
async def auto_submit_application(
    lead_id: UUID,
    body: AutoSubmitRequest,
    ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    now = datetime.now(timezone.utc)
    await db.execute(
        text("UPDATE bid_submissions SET proposal_text=:p, proposed_rate=:r, submitted_at=:t WHERE lead_id=:id"),
        {"p": body.proposal_text, "r": body.proposed_rate, "t": now, "id": str(lead_id)},
    )
    await db.execute(text("UPDATE job_leads SET status = 'submitted' WHERE id = :id"), {"id": str(lead_id)})
    return {"lead_id": str(lead_id), "status": "submitted"}`,
  },
  {
    id: "audio-qa-engine",
    phase: 3,
    title: "Audio QA Engine (librosa + Whisper)",
    path: "phase3_architecture/backend/app/engines/audio_qa.py",
    language: "python",
    description:
      "Validates .wav files for Mono, 24kHz, Peak (-3 to -6 dB), Noise Floor (<-70 dB), SNR (>35 dB), and Whisper STT WER.",
    code: `class AudioQaEngine:
    TARGET_SAMPLE_RATE = 24000
    PEAK_MIN_DB, PEAK_MAX_DB = -6.0, -3.0
    MAX_NOISE_FLOOR_DB = -70.0
    MIN_SNR_DB = 35.0

    def evaluate_wav_bytes(self, wav_bytes: bytes, reference_transcript: str | None = None):
        data, sr = sf.read(io.BytesIO(wav_bytes), always_2d=True)
        channels = int(data.shape[1])
        mono_signal = data[:, 0] if channels == 1 else np.mean(data, axis=1)
        peak_dbfs = float(20.0 * np.log10(max(float(np.max(np.abs(mono_signal))), 1e-12)))
        frame_rms = librosa.feature.rms(y=mono_signal, frame_length=1024, hop_length=512)[0]
        frame_db = 20.0 * np.log10(np.maximum(frame_rms, 1e-12))
        noise_floor_dbfs = float(np.percentile(frame_db, 10))
        snr_db = float(max(0.0, np.percentile(frame_db, 90) - noise_floor_dbfs))
        # Resample to 16kHz -> Whisper STT -> compute_wer(...)`,
  },
  {
    id: "vision-qa-engine",
    phase: 3,
    title: "Vision QA Engine (YOLOv8 IoU)",
    path: "phase3_architecture/backend/app/engines/vision_qa.py",
    language: "python",
    description:
      "Computes Intersection over Union (IoU) against YOLOv8 detections and flags any bounding box with IoU < 0.70.",
    code: `def compute_iou(box_a: BoundingBox, box_b: BoundingBox) -> float:
    ix1, iy1 = max(box_a.x1, box_b.x1), max(box_a.y1, box_b.y1)
    ix2, iy2 = min(box_a.x2, box_b.x2), min(box_a.y2, box_b.y2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, box_a.x2 - box_a.x1) * max(0.0, box_a.y2 - box_a.y1)
    area_b = max(0.0, box_b.x2 - box_b.x1) * max(0.0, box_b.y2 - box_b.y1)
    union = area_a + area_b - inter
    return inter / union if union > 0.0 else 0.0

class VisionQaEngine:
    IOU_THRESHOLD = 0.70`,
  },
  {
    id: "text-qa-engine",
    phase: 3,
    title: "Text & Localization QA Engine",
    path: "phase3_architecture/backend/app/engines/text_qa.py",
    language: "python",
    description:
      "Scores translations and LLM responses on a custom 1-5 rubric using structured JSON output.",
    code: `class TextLocalizationQaEngine:
    def grade_output(self, source_text: str, candidate_output: str, target_locale: str, rubric_criteria: list[str]):
        response = self._client.models.generate_content(
            model="gemini-4-hydrogen",
            contents=f"Locale: {target_locale}\\nSource: {source_text}\\nCandidate: {candidate_output}",
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return TextLocalizationReport(...)`,
  },
  {
    id: "synthetic-data-factory",
    phase: 4,
    title: "Synthetic Data Factory (ElevenLabs / Coqui)",
    path: "phase4_architecture/backend/app/services/synthetic_factory.py",
    language: "python",
    description:
      "Generates 10,000-scale multilingual audio/text corpora across accents, tones, and phonetic profiles via ElevenLabs and Coqui XTTS-v2.",
    code: `class SyntheticDataFactory:
    async def synthesize_dataset_batch(self, org_id, utterances, voice_id, concurrency=8):
        semaphore = asyncio.Semaphore(concurrency)
        async def _produce(idx, item):
            async with semaphore:
                wav_bytes = await self._voice.synthesize_wav(
                    text=item.script_text, voice_id=voice_id,
                    locale=item.locale, tone=item.tone,
                )
                return {"org_id": str(org_id), "index": idx, "byte_size": len(wav_bytes)}
        return await asyncio.gather(*[_produce(i, u) for i, u in enumerate(utterances)])`,
  },
  {
    id: "red-team-agent",
    phase: 4,
    title: "Adversarial Red-Teaming Agent",
    path: "phase4_architecture/backend/app/services/red_team_agent.py",
    language: "python",
    description:
      "Tests target LLMs against prompt injections, roleplay jailbreaks, and logic traps, emitting a Red-Team Vulnerability Report.",
    code: `class AdversarialRedTeamAgent:
    def evaluate_target_model(self, target_model_name, target_system_prompt, vectors, probes_per_vector=3):
        # 1. Generate adversarial probes per vector
        # 2. Execute against target system prompt
        # 3. Judge policy compliance & aggregate breakdown
        return RedTeamVulnerabilityReport(
            target_model=target_model_name,
            total_probes=total, failed_count=failed,
            vulnerability_rate_pct=rate, vector_breakdown=breakdown,
            executive_summary=f"Model failed {rate}% of safety traps",
            outcomes=outcomes,
        )`,
  },
  {
    id: "marketplace-sql-rls",
    phase: 5,
    title: "Expert Marketplace & Payout RLS Schema",
    path: "phase5_architecture/backend/migrations/004_expert_marketplace.sql",
    language: "sql",
    description:
      "Tenant-isolated expert_profiles, marketplace_batches, and payout_transactions tables enforced by PostgreSQL RLS.",
    code: `ALTER TABLE expert_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_expert_profiles ON expert_profiles
    USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_payout_transactions ON payout_transactions
    USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);`,
  },
  {
    id: "payout-orchestrator",
    phase: 5,
    title: "Audio QA Gate & Kora Pay Settlement",
    path: "phase5_architecture/backend/app/services/payout_orchestrator.py",
    language: "python",
    description:
      "Validates human native-speaker .wav uploads via Phase 3 AudioQaEngine, settles 80% expert payouts on Kora Pay Domestic (NGN) or Global (USD/GBP) rails, and retains the 20% agency fee.",
    code: `class MarketplacePayoutOrchestrator:
    async def validate_and_settle(self, wav_bytes, file_name, reference_script, gross_amount, payout_rail, payout_account_ref, batch_id):
        qa_report = self.audio_qa.evaluate_wav_bytes(wav_bytes, file_name, reference_script)
        if not qa_report.passed:
            return MarketplaceSettlementResult(qa_passed=False, qa_report=qa_report, batch_status="qa_failed")

        split = compute_escrow_split(gross_amount)  # 20% agency fee / 80% expert payout
        currency = "USD" if payout_rail == "kora_pay_global" else "NGN"
        transfer_id = await self.korapay.disburse_payout(payout_account_ref, split.expert_payout_80pct, f"apex-{batch_id}", batch_id, currency=currency)
        return MarketplaceSettlementResult(qa_passed=True, qa_report=qa_report, batch_status="delivered_and_paid", payout_rail=payout_rail, external_transfer_id=transfer_id, split=split)`,
  },
  {
    id: "marketplace-router",
    phase: 5,
    title: "FastAPI Expert Marketplace Router",
    path: "phase5_architecture/backend/app/routers/marketplace.py",
    language: "python",
    description:
      "API endpoints for onboarding vetted native speakers, assigning script recording batches, and gating automated Kora Pay payouts on .wav Audio QA.",
    code: `@router.post("/batches/{batch_id}/submit-audio")
async def submit_human_recording_and_settle(batch_id: uuid.UUID, file: UploadFile = File(...), ctx: TenantContext = Depends(require_admin), db: AsyncSession = Depends(get_tenant_db)):
    # Reads .wav upload -> validates DSP/SNR -> releases 80% Kora Pay payout & records 20% agency cut`,
  },
  {
    id: "realtime-ws-telemetry",
    phase: 6,
    title: "Tenant-Isolated WebSocket Telemetry Hub",
    path: "phase6_architecture/backend/app/routers/realtime_telemetry.py",
    language: "python",
    description:
      "FastAPI WebSocket room manager partitioned by organization UUID broadcasting server-authoritative task, QA, escrow, and agent deltas.",
    code: `@router.websocket("/ws/telemetry")
async def org_telemetry_socket(websocket: WebSocket, org_id: str = Query(...), user_id: str = Query(...)):
    peer_count = await telemetry_hub.connect(org_id, websocket)
    await telemetry_hub.broadcast_org_event(org_id, "presence:joined", {"user_id": user_id, "connected_peers": peer_count})`,
  },
  {
    id: "ethical-mock-interview",
    phase: 6,
    title: "Ethical B2C Mock Interview Coach (TTS + STT)",
    path: "phase6_architecture/backend/app/services/interview_coach.py",
    language: "python",
    description:
      "Synthesizes interviewer prompts via Gemini 3.8 TTS, transcribes candidate voice practice via Gemini 3.5 Transcribe, and scores tone, clarity, and technical accuracy.",
    code: `class EthicalMockInterviewCoach:
    def transcribe_and_grade(self, role_track: str, question_text: str, audio_bytes: bytes | None = None, fallback_transcript: str | None = None):
        # 1. Transcribe candidate audio via gemini-3.5-transcribe
        # 2. Grade tone_score, clarity_score, technical_accuracy_score (0-100) via gemini-4-hydrogen
        return InterviewRubricEvaluation(transcript=transcript, tone_score=tone, clarity_score=clarity, technical_accuracy_score=tech, overall_score=overall, ...)`,
  },
  {
    id: "r3f-neural-canvas",
    phase: 7,
    title: "4K @react-three/fiber Neural Lattice Canvas",
    path: "phase7_architecture/nextjs/components/NeuralGridCanvas.tsx",
    language: "tsx",
    description:
      "3D WebGL neural constellation with instanced golden relay nodes, orbital telemetry rings, and mouse-damped camera parallax.",
    code: `export function NeuralGridCanvas() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 8.2], fov: 46 }}>
      <color attach="background" args={["#050914"]} />
      <fog attach="fog" args={["#050914", 7, 18]} />
      <directionalLight position={[6, 8, 5]} intensity={2.1} color="#FDE68A" />
      <NeuralLatticeMesh />
    </Canvas>
  );
}`,
  },
  {
    id: "nextjs-homepage",
    phase: 7,
    title: "Next.js 15 Conversion Homepage (app/page.tsx)",
    path: "phase7_architecture/nextjs/app/page.tsx",
    language: "tsx",
    description:
      "Dark navy/gold landing page with 4K R3F hero, Framer Motion scroll parallax Vision & Mission cards, 4 glowing feature cards, and Dutchkem Ventures footer.",
    code: `export default function HomePage() {
  // Hero headline: "The Ultimate AI Data Copilot. Scale Your Agency. Automate Your QA."
  // Parallax Vision & Mission glassmorphism cards + 4 animated feature cards:
  // Auto-Bidder AI | Audio QA (librosa) | Synthetic Data Factory | Vision Annotation (YOLO)
}`,
  },
  {
    id: "nextjs-settings-2fa",
    phase: 8,
    title: "Next.js 15 Settings & 2FA TOTP (app/settings/page.tsx)",
    path: "phase8_architecture/nextjs/app/settings/page.tsx",
    language: "tsx",
    description:
      "Profile editor, otplib Google Authenticator QR code 2FA setup, current-password change gate, and full Logout cookie/localStorage/hard-redirect flow.",
    code: `// Profile Settings + TOTP 2FA (otplib + qrcode) + Change Password + Logout
async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.localStorage.clear();
  window.location.href = "/login";
}`,
  },
  {
    id: "nextjs-login-page",
    phase: 8,
    title: "Next.js 15 Login & Return to Homepage (app/login/page.tsx)",
    path: "phase8_architecture/nextjs/app/login/page.tsx",
    language: "tsx",
    description:
      "Dedicated /login route supporting email/password, conditional 6-digit TOTP verification, and subtle Return to Homepage link.",
    code: `export default function LoginPage() {
  // Email + password + conditional Google Authenticator 6-digit TOTP step
  // Subtle <Link href="/">Return to Homepage</Link> below the login card
}`,
  },
  {
    id: "nextjs-auth-middleware",
    phase: 8,
    title: "Next.js Session & Logout Middleware (middleware.ts)",
    path: "phase8_architecture/nextjs/middleware.ts",
    language: "ts",
    description:
      "Edge middleware guarding /dashboard, /settings, and /pricing routes and clearing HTTP-only apex_session cookies on /logout.",
    code: `export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/logout") {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set("apex_session", "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  }
}`,
  },
  {
    id: "nextjs-pricing-korapay",
    phase: 9,
    title: "Next.js 15 Pricing & Kora Pay Checkout (app/pricing/page.tsx)",
    path: "phase9_architecture/nextjs/app/pricing/page.tsx",
    language: "tsx",
    description:
      "3-column Starter Trial ($0/mo), Pro ($49/mo Most Popular glow), and Agency ($199/mo) subscription tiers wired to Kora Pay.",
    code: `// Starter Free Trial ($0/mo, 3 tasks) | Pro ($49/mo, 50 tasks) | Agency ($199/mo, Unlimited)
const res = await fetch("/api/billing/korapay/initialize", {
  method: "POST",
  body: JSON.stringify({ tier }),
});`,
  },
  {
    id: "nextjs-trial-middleware",
    phase: 9,
    title: "Next.js Trial & Logout Middleware (middleware.ts)",
    path: "phase9_architecture/nextjs/middleware.ts",
    language: "ts",
    description:
      "Enforces 14-day trial expiration and 3-task quota, redirecting to /pricing with 'Upgrade to continue using the Apex Copilot.'",
    code: `if (isProtected && session?.subscriptionTier === "trial") {
  const trialExpired = Boolean(session.trialEndsAt) && Date.parse(session.trialEndsAt) <= Date.now();
  const quotaExceeded = (session.monthlyTaskCount ?? 0) >= 3;
  if (trialExpired || quotaExceeded) {
    const url = new URL("/pricing", request.url);
    url.searchParams.set("toast", "Upgrade to continue using the Apex Copilot.");
    return NextResponse.redirect(url);
  }
}`,
  },
  {
    id: "korapay-webhook-route",
    phase: 9,
    title: "Kora Pay Webhook Tier Sync (app/api/webhooks/korapay/route.ts)",
    path: "phase9_architecture/nextjs/app/api/webhooks/korapay/route.ts",
    language: "ts",
    description:
      "Verifies x-korapay-signature HMAC-SHA256 using KORA_SECRET_KEY and upgrades organization subscription_tier on charge.success.",
    code: `const expected = crypto.createHmac("sha256", secretKey).update(JSON.stringify(body.data)).digest("hex");
if (body.event === "charge.success" && body.data?.status === "success") {
  // Update organization subscription_tier to 'pro' or 'agency'
}`,
  },
  {
    id: "phase10-create-checkout-session",
    phase: 10,
    title: "Checkout Session API (app/api/payments/create-checkout-session/route.ts)",
    path: "phase10_architecture/nextjs/app/api/payments/create-checkout-session/route.ts",
    language: "ts",
    description:
      "Creates live Kora Pay Checkout sessions across local (NGN) and international (USD/GBP) currencies for price_pro_monthly ($49/mo) and price_agency_monthly ($199/mo).",
    code: `const PRICE_PLAN_MAP = {
  price_pro_monthly: { tier: "pro", amountUsd: 49, amountNgn: 75000, amountGbp: 39, tasksLimit: 50 },
  price_agency_monthly: { tier: "agency", amountUsd: 199, amountNgn: 305000, amountGbp: 158, tasksLimit: null },
};

export async function POST(request: NextRequest) {
  const { price_id, currency = "NGN" } = await request.json();
  const plan = PRICE_PLAN_MAP[price_id];
  if (!plan) return NextResponse.json({ error: "Invalid price_id" }, { status: 400 });
  // Initializes Kora Pay Checkout (/merchant/api/v1/charges/initialize) for NGN, USD, or GBP
}`,
  },
  {
    id: "phase10-payment-webhook",
    phase: 10,
    title: "Kora Pay Webhook Handler (app/api/webhooks/payment/route.ts)",
    path: "phase10_architecture/nextjs/app/api/webhooks/payment/route.ts",
    language: "ts",
    description:
      "Verifies x-korapay-signature HMAC-SHA256; upgrades subscription_ends_at (+30d) and tasks_limit on charge.success or downgrades & locks on failure/cancellation.",
    code: `if (isUpgradeSuccess) {
  const subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const tasksLimit = requestedTier === "pro" ? 50 : Infinity;
  // Sync users: subscription_tier, subscription_ends_at, tasks_limit, subscription_locked = false
}
if (isDowngradeOrFailure) {
  // Downgrade to trial (tasks_limit = 3) and set subscription_locked = true
}`,
  },
  {
    id: "phase10-customer-portal",
    phase: 10,
    title: "Kora Pay Billing Portal (app/api/payments/portal/route.ts)",
    path: "phase10_architecture/nextjs/app/api/payments/portal/route.ts",
    language: "ts",
    description:
      "Serves self-serve Kora Pay subscription management, local/international invoice receipts, and instant workspace cancellation.",
    code: `return NextResponse.json({
  mode: "korapay_self_serve_portal",
  portalUrl: \`\${origin}/pricing?portal=manage\`,
});`,
  },
  {
    id: "phase10-fastapi-payments",
    phase: 10,
    title: "FastAPI Payments & Sync Router (app/routers/payments.py)",
    path: "phase10_architecture/backend/app/routers/payments.py",
    language: "python",
    description:
      "Persists PostgreSQL organization subscription_tier, subscription_ends_at, monthly_task_limit, and subscription_locked under tenant RLS.",
    code: `@router.post("/sync")
async def sync_subscription_state(body: PaymentSyncPayload, ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)), db: AsyncSession = Depends(get_tenant_db)):
    await db.execute(text("""
        UPDATE organizations
        SET subscription_tier = :tier, subscription_ends_at = :ends_at,
            monthly_task_limit = :tasks_limit, subscription_locked = :locked
        WHERE id = :org_id
    """), {"tier": body.subscription_tier, "ends_at": body.subscription_ends_at, "tasks_limit": body.tasks_limit, "locked": body.subscription_locked, "org_id": str(ctx.org_id)})`,
  },
  {
    id: "phase11-programmatic-jobs",
    phase: 11,
    title: "Programmatic Job Landing Pages (app/jobs/[slug]/page.tsx)",
    path: "phase11_architecture/nextjs/app/jobs/[slug]/page.tsx",
    language: "tsx",
    description:
      "Generates 12 static keyword-targeted job pages (tts-audio-qa, multilingual-prompt-engineering, video-annotation-qa, etc.) with dynamic generateMetadata and Start Trial CTA.",
    code: `export function generateStaticParams() {
  return JOB_SEO_CATALOG.map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params;
  const job = JOB_SEO_CATALOG.find((item) => item.slug === slug);
  return {
    title: job.metaTitle,
    description: job.metaDescription,
    openGraph: { title: job.metaTitle, description: job.metaDescription, images: [\`\${baseUrl}/api/og?title=\${encodeURIComponent(job.title)}\`] },
  };
}`,
  },
  {
    id: "phase11-gemini-article-generator",
    phase: 11,
    title: "Automated Blog Generator (scripts/generate-seo-articles.ts)",
    path: "phase11_architecture/nextjs/scripts/generate-seo-articles.ts",
    language: "ts",
    description:
      "Uses @google/genai (gemini-4-hydrogen) to generate 1,000-word structured guides and publish them to app/blog/[slug]/page.tsx.",
    code: `const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});

const response = await ai.models.generateContent({
  model: "gemini-4-hydrogen",
  contents: \`Write a 1,000-word SEO guide titled "\${item.topic}"\`,
  config: { responseMimeType: "application/json", responseSchema },
});`,
  },
  {
    id: "phase11-blog-dynamic-route",
    phase: 11,
    title: "Dynamic SEO Blog Route (app/blog/[slug]/page.tsx)",
    path: "phase11_architecture/nextjs/app/blog/[slug]/page.tsx",
    language: "tsx",
    description:
      "Publishes generated 1,000-word articles with OpenGraph article metadata, reading sections, and Start Your Free Trial conversion footer.",
    code: `export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params;
  const article = (await readPublishedArticles()).find((a) => a.slug === slug);
  return { title: article.metaTitle, description: article.metaDescription, openGraph: { type: "article" } };
}`,
  },
  {
    id: "phase11-sitemap-robots-jsonld",
    phase: 11,
    title: "Sitemap, Robots & JSON-LD (app/sitemap.ts + schema-jsonld.tsx)",
    path: "phase11_architecture/nextjs/app/sitemap.ts",
    language: "ts",
    description:
      "Native Next.js sitemap.xml + robots.txt generators and Schema.org Organization + SoftwareApplication structured data.",
    code: `export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, priority: 1.0 },
    { url: \`\${baseUrl}/pricing\`, priority: 0.9 },
    ...JOB_SLUGS.map((slug) => ({ url: \`\${baseUrl}/jobs/\${slug}\`, priority: 0.85 })),
    ...BLOG_SLUGS.map((slug) => ({ url: \`\${baseUrl}/blog/\${slug}\`, priority: 0.8 })),
  ];
}`,
  },
  {
    id: "phase12-terms-of-service",
    phase: 12,
    title: "Terms of Service (app/legal/terms/page.tsx)",
    path: "phase12_architecture/nextjs/app/legal/terms/page.tsx",
    language: "tsx",
    description:
      "Independent contractor classification, 80/20 escrow settlement terms via Kora Pay (home NGN & global USD/GBP), and tenant RLS usage boundaries.",
    code: `export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <h1>Terms of Service</h1>
      <p>Independent contractor status, 80/20 QA-gated Kora Pay escrow settlement, and zero-trust RLS rules.</p>
    </main>
  );
}`,
  },
  {
    id: "phase12-privacy-ndpa",
    phase: 12,
    title: "Privacy Policy · NDPA & GDPR (app/legal/privacy/page.tsx)",
    path: "phase12_architecture/nextjs/app/legal/privacy/page.tsx",
    language: "tsx",
    description:
      "NDPA 2023 and GDPR compliant Privacy Policy detailing Neon PostgreSQL RLS user data isolation and encrypted WAV audio file storage.",
    code: `export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <h1>Privacy Policy (NDPA & GDPR Compliant)</h1>
      <p>Neon PostgreSQL encrypted audio retention, RLS tenant isolation, and 72-hour erasure SLA.</p>
    </main>
  );
}`,
  },
  {
    id: "phase12-refund-policy",
    phase: 12,
    title: "Refund Policy (app/legal/refund/page.tsx)",
    path: "phase12_architecture/nextjs/app/legal/refund/page.tsx",
    language: "tsx",
    description:
      "7-day money-back guarantee for first-time Pro ($49/mo) users, 14-day trial protection, and escrow milestone settlement terms.",
    code: `export default function RefundPolicyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <h1>Refund Policy</h1>
      <p>Unconditional 7-day money-back guarantee for first-time Pro subscribers.</p>
    </main>
  );
}`,
  },
  {
    id: "phase12-global-footer",
    phase: 12,
    title: "Global Legal Footer (components/GlobalFooter.tsx)",
    path: "phase12_architecture/nextjs/components/GlobalFooter.tsx",
    language: "tsx",
    description:
      "Shared footer navigation surfacing /legal/terms, /legal/privacy, /legal/refund, /pricing, and /dashboard.",
    code: `<nav aria-label="Global footer links" className="flex flex-wrap gap-6">
  <Link href="/legal/terms">Terms of Service</Link>
  <Link href="/legal/privacy">Privacy Policy (NDPA)</Link>
  <Link href="/legal/refund">Refund Policy</Link>
  <Link href="/pricing">Pricing</Link>
</nav>`,
  },
  {
    id: "phase13-next-config-vercel-cron",
    phase: 13,
    title: "Next.js Config & Vercel Cron Jobs (next.config.js + vercel.json)",
    path: "phase13_architecture/nextjs/vercel.json",
    language: "json",
    description:
      "Configures AVIF/WebP image optimization, strict security headers, and automated Vercel Cron triggers for Auto-Bidder (*/15 * * * *) and daily SEO article publishing (0 6 * * *).",
    code: `{
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/auto-bidder", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/seo-articles", "schedule": "0 6 * * *" }
  ]
}`,
  },
  {
    id: "phase13-fastapi-dockerfile",
    phase: 13,
    title: "FastAPI Audio & Vision QA Dockerfile (backend/Dockerfile)",
    path: "phase13_architecture/backend/Dockerfile",
    language: "dockerfile",
    description:
      "Multi-stage python:3.11-slim container installing ffmpeg, libsndfile1, librosa, faster-whisper, and YOLOv8 (ultralytics) under non-root apexuser.",
    code: `FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgl1 libglib2.0-0 curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]`,
  },
  {
    id: "phase13-docker-compose",
    phase: 13,
    title: "Full-Stack Local Orchestration (docker-compose.yml)",
    path: "phase13_architecture/docker-compose.yml",
    language: "yaml",
    description:
      "Orchestrates PostgreSQL 16 (with RLS schema init), Redis 7, FastAPI QA backend, Celery worker, and Next.js 15 frontend.",
    code: `services:
  postgres: { image: "postgres:16-alpine", ports: ["5432:5432"] }
  redis: { image: "redis:7-alpine", ports: ["6379:6379"] }
  backend: { build: "./backend", ports: ["8000:8000"] }
  worker: { build: "./backend", command: ["celery", "-A", "app.worker.celery_app", "worker"] }
  frontend: { image: "node:20-alpine", ports: ["3000:3000"] }`,
  },
  {
    id: "phase13-env-example",
    phase: 13,
    title: "Production Environment Template (.env.example)",
    path: ".env.example",
    language: "ini",
    description:
      "Complete production environment schema for Neon PostgreSQL, Upstash Redis, Gemini & NVIDIA NIM, Kora Pay local/global payments, and Cron secrets.",
    code: `DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/neondb?sslmode=require&channel_binding=require"
REDIS_URL="rediss://default:MY_UPSTASH_TOKEN@HOST.upstash.io:6379"
GEMINI_API_KEY="MY_GEMINI_API_KEY"
NVIDIA_API_KEY="MY_NVIDIA_API_KEY"
KORA_SECRET_KEY="MY_KORA_SECRET_KEY"
KORA_WEBHOOK_SECRET="MY_KORA_WEBHOOK_SECRET_OR_URL"
NEXT_PUBLIC_KORA_PUBLIC_KEY="MY_KORA_PUBLIC_KEY"
SESSION_SIGNING_SECRET="MY_SESSION_SIGNING_SECRET"
CRON_SECRET="MY_VERCEL_CRON_BEARER_SECRET"`,
  },
  {
    id: "phase14-fastapi-b2b-gateway",
    phase: 14,
    title: "FastAPI B2B QA Gateway (/api/v1/qa/audio, /vision, /text)",
    path: "phase14_architecture/backend/app/routers/b2b_gateway.py",
    language: "python",
    description:
      "Authenticates AI Labs via Authorization: Bearer sk_live_..., enforces PostgreSQL RLS, executes librosa WAV DSP / YOLOv8 / Gemini 4 QA checks, and meters $0.10/call.",
    code: `@router.post("/audio")
async def b2b_audio_qa(
    file: UploadFile = File(...),
    api_key: ApiKey = Depends(authenticate_b2b_api_key),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    started_at = time.perf_counter()
    samples, sr = sf.read(io.BytesIO(await file.read()), always_2d=True)
    channels = samples.shape[1]
    mono = np.mean(samples, axis=1)
    peak_dbfs = round(20.0 * np.log10(max(float(np.max(np.abs(mono))), 1e-12)), 2)
    rms_db = 20.0 * np.log10(np.maximum(librosa.feature.rms(y=mono)[0], 1e-12))
    noise_floor_dbfs = round(float(np.percentile(rms_db, 10)), 2)
    snr_db = round(max(0.0, float(np.percentile(rms_db, 90)) - noise_floor_dbfs), 2)
    passed = bool(channels == 1 and sr == 24000 and -6.0 <= peak_dbfs <= -3.0 and noise_floor_dbfs < -70.0 and snr_db > 35.0)
    await meter_api_call(db, api_key, "/api/v1/qa/audio", 200, passed, started_at)
    return {"snrDb": snr_db, "peakDbfs": peak_dbfs, "noiseFloorDbfs": noise_floor_dbfs, "passed": passed}`,
  },
  {
    id: "phase14-sqlalchemy-usage-schema",
    phase: 14,
    title: "PostgreSQL API Key & Metered Usage Schema (api_usage_models.py)",
    path: "phase14_architecture/backend/app/api_usage_models.py",
    language: "python",
    description:
      "SQLAlchemy 2.0 + Neon PostgreSQL RLS tables for b2b_api_keys (SHA-256 key hash), b2b_api_usage_logs, and b2b_metered_invoices (Kora Pay NGN/USD/GBP).",
    code: `class ApiKey(Base):
    __tablename__ = "b2b_api_keys"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    key_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    key_hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    total_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unbilled_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit_price_usd: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("0.1000"))
    status: Mapped[ApiKeyStatus] = mapped_column(SAEnum(ApiKeyStatus, name="b2b_api_key_status_enum"))`,
  },
  {
    id: "phase14-korapay-metered-webhook",
    phase: 14,
    title: "Kora Pay Metered Billing Webhook (api/webhooks/korapay-metered)",
    path: "phase14_architecture/nextjs/app/api/webhooks/korapay-metered/route.ts",
    language: "ts",
    description:
      "Verifies Kora Pay HMAC-SHA256 signatures, settles monthly metered NGN/USD/GBP invoices ($0.10/call), resets unbilled_calls, and handles past_due dunning.",
    code: `if (secretKey && signature && body.data) {
  const expected = crypto.createHmac("sha256", secretKey).update(JSON.stringify(body.data)).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"))) {
    return NextResponse.json({ detail: "Invalid Kora Pay HMAC signature." }, { status: 401 });
  }
}
if (eventName === "charge.success" && body.data?.status === "success") {
  return NextResponse.json({ received: true, provider: "korapay", status: "paid" });
}`,
  },
  {
    id: "phase14-nextjs-api-gateway-ui",
    phase: 14,
    title: "Next.js 15 B2B API Key Management UI (dashboard/api-gateway/page.tsx)",
    path: "phase14_architecture/nextjs/app/dashboard/api-gateway/page.tsx",
    language: "tsx",
    description:
      "Generates sk_live_... API keys, displays live unbilled call metering ($0.10/call), and triggers monthly Kora Pay checkout in NGN, USD, or GBP.",
    code: `async function handleGenerateKey(e: React.FormEvent) {
  e.preventDefault();
  const res = await fetch("/api/b2b/keys", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, scopes: ["audio", "vision", "text"] }),
  });
  const data = await res.json();
  if (res.ok && data.rawKey) setCreatedSecret(data.rawKey);
}`,
  },
  {
    id: "phase15-jobboard-models",
    phase: 15,
    title: "Two-Sided Job Board & 85/15 Escrow Schema (job_board_models.py)",
    path: "phase15_architecture/backend/app/job_board_models.py",
    language: "python",
    description:
      "SQLAlchemy 2.0 schema enforcing $500 client listing fees via Kora Pay, freelancer bids, funded escrows, and 85/15 disbursement splits.",
    code: `class MarketplaceJob(Base):
    __tablename__ = "marketplace_jobs"
    __table_args__ = (
        CheckConstraint("listing_fee_usd = 500.00", name="ck_job_listing_fee_500"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_fee_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("500.00"))
    escrow_status: Mapped[JobEscrowStatus] = mapped_column(SAEnum(JobEscrowStatus, name="job_escrow_status_enum"))
    freelancer_payout_85pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    platform_fee_15pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))`,
  },
  {
    id: "phase15-fastapi-escrow-automation",
    phase: 15,
    title: "FastAPI Client Posting, Bidding & 85/15 Escrow Split (job_board.py)",
    path: "phase15_architecture/backend/app/routers/job_board.py",
    language: "python",
    description:
      "Initializes $500 Kora Pay listing charges, records freelancer bids, funds Kora Pay escrow on acceptance, and executes 85/15 payout splits when QA passes.",
    code: `@router.post("/{job_id}/submit")
async def submit_work_and_release_85_15(job_id: uuid.UUID, qa_passed: bool, db: AsyncSession = Depends(get_db_session)):
    job = await db.get(MarketplaceJob, job_id)
    if not qa_passed:
        job.escrow_status = JobEscrowStatus.QA_REJECTED
        raise HTTPException(status_code=422, detail="Automated QA failed. Escrow locked.")
    freelancer_85 = (gross * Decimal("0.85")).quantize(Decimal("0.01"))
    platform_15 = gross - freelancer_85
    job.escrow_status = JobEscrowStatus.RELEASED
    return {"freelancer_payout_85pct": float(freelancer_85), "platform_fee_15pct": float(platform_15)}`,
  },
  {
    id: "phase15-korapay-jobs-webhook",
    phase: 15,
    title: "Kora Pay Listing Fee & Escrow Webhook (korapay-jobs/route.ts)",
    path: "phase15_architecture/nextjs/app/api/webhooks/korapay-jobs/route.ts",
    language: "ts",
    description:
      "Verifies Kora Pay HMAC-SHA256 webhooks to activate $500 client job postings (status: open) and fund bid escrow milestones (escrow_status: funded).",
    code: `if (body.event === "charge.success" && body.data?.status === "success") {
  const meta = body.data.metadata ?? {};
  if (meta.flow === "listing_fee") {
    return NextResponse.json({ received: true, flow: "listing_fee", status: "open" });
  }
  if (meta.flow === "bid_escrow") {
    return NextResponse.json({ received: true, flow: "bid_escrow", escrowStatus: "funded" });
  }
}`,
  },
  {
    id: "phase16-affiliate-models",
    phase: 16,
    title: "Affiliate Click, Attribution & 20% Commission Schema (affiliate_models.py)",
    path: "phase16_architecture/backend/app/affiliate_models.py",
    language: "python",
    description:
      "SQLAlchemy 2.0 schema tracking /ref/{user_id} clicks, 30-day cookie attributions, 20% recurring Pro/Agency commissions, and Kora Pay payout references.",
    code: `class ReferralCommission(Base):
    __tablename__ = "referral_commissions"
    __table_args__ = (
        CheckConstraint("commission_rate = 0.2000", name="ck_affiliate_20pct_rate"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    commission_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.2000"))
    commission_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payout_reference: Mapped[Optional[str]] = mapped_column(String(128))`,
  },
  {
    id: "phase16-fastapi-affiliates-router",
    phase: 16,
    title: "FastAPI /ref/{user_id} Cookie & 20% Kora Pay Commissions (affiliates.py)",
    path: "phase16_architecture/backend/app/routers/affiliates.py",
    language: "python",
    description:
      "Sets the 30-day apex_ref_id referral cookie, computes 20% recurring commission on Pro ($49) / Agency ($199) upgrades, and settles payouts via Kora Pay.",
    code: `@router.post("/api/affiliates/commission/credit")
async def credit_recurring_commission(payload: CreditCommissionPayload, db: AsyncSession = Depends(get_db_session)):
    gross_usd = PLAN_PRICES_USD[payload.plan_tier]
    commission_usd = (gross_usd * Decimal("0.20")).quantize(Decimal("0.01"))
    entry = ReferralCommission(
        referrer_user_id=attribution.referrer_user_id,
        referred_org_id=payload.referred_org_id,
        kora_subscription_ref=payload.kora_subscription_ref,
        commission_usd=commission_usd,
    )
    db.add(entry)
    await db.commit()
    return {"credited": True, "commission_usd": float(commission_usd)}`,
  },
  {
    id: "phase16-nextjs-ref-route",
    phase: 16,
    title: "Next.js 15 /ref/[userId] Persistent Cookie Interceptor (route.ts)",
    path: "phase16_architecture/nextjs/app/ref/[userId]/route.ts",
    language: "ts",
    description:
      "Persists a 30-day apex_ref_id cookie upon /ref/[userId] visit, forwards async click telemetry, and redirects into the onboarding funnel.",
    code: `response.cookies.set({
  name: "apex_ref_id",
  value: cleanReferrerId,
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
  sameSite: "lax",
});`,
  },
  {
    id: "phase17-surge-models",
    phase: 17,
    title: "Dynamic Surge Multipliers & Demand Schema (dynamic_pricing_models.py)",
    path: "phase17_architecture/backend/app/dynamic_pricing_models.py",
    language: "python",
    description:
      "SQLAlchemy 2.0 schema storing admin-configured QA module surge multipliers and per-locale demand weights.",
    code: `class QaSurgePricingRule(Base):
    __tablename__ = "qa_surge_pricing_rules"
    base_unit_price_usd: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=Decimal("0.1000"))
    audio_qa_multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("1.00"))
    vision_qa_multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("1.00"))
    text_qa_multiplier: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("1.00"))
    auto_language_surge_enabled: Mapped[bool] = mapped_column(Boolean, default=True)`,
  },
  {
    id: "phase17-admin-insights-router",
    phase: 17,
    title: "Admin-Only Surge Pricing & PDF Intelligence Export (admin_insights.py)",
    path: "phase17_architecture/backend/app/routers/admin_insights.py",
    language: "python",
    description:
      "RBAC-protected FastAPI endpoints adjusting dynamic Kora Pay QA pricing, aggregating anonymized corpus defects, and streaming commercial PDF intelligence.",
    code: `@router.put("/pricing/surge")
async def update_surge_pricing(payload: SurgeConfigUpdate, ctx: TenantContext = Depends(require_admin_role)):
    return {
        "updated": True,
        "settlement_rail": "korapay",
        "audio_unit_price_usd": round(0.10 * payload.audio_qa_multiplier, 4),
    }

@router.get("/insights/report.pdf")
async def export_market_intelligence_pdf(_ctx: TenantContext = Depends(require_admin_role)):
    return Response(content=pdf_bytes, media_type="application/pdf")`,
  },
  {
    id: "phase17-nextjs-admin-insights",
    phase: 17,
    title: "Next.js 15 Admin Surge Pricing & Insights Page (insights/page.tsx)",
    path: "phase17_architecture/nextjs/app/dashboard/admin/insights/page.tsx",
    language: "ts",
    description:
      "Admin-only UI displaying 10,000+ audio hours processed, Noise Floor defect ranking, live surge sliders, and 1-click PDF export.",
    code: `<a href="/api/admin/insights/report.pdf" className="px-4 py-2 text-xs font-semibold bg-slate-950 text-white rounded-lg">
  Export PDF Report
</a>`,
  },
  {
    id: "phase18a-sqlalchemy-kora-escrow",
    phase: 18,
    title: "Kora Pay 85/15 Escrow & Tax Receipt Schema (kora_escrow_models.py)",
    path: "phase18_architecture/backend/app/kora_escrow_models.py",
    language: "python",
    description:
      "SQLAlchemy 2.0 schema extending users.kora_recipient_id and adding multi-currency NGN/USD escrow_ledger, tax_receipts, and X-Event-ID webhook_events.",
    code: `class EscrowLedger(Base):
    __tablename__ = "escrow_ledger"
    __table_args__ = (
        CheckConstraint("platform_fee + freelancer_payout = gross_amount", name="ck_kora_escrow_85_15_invariant"),
    )
    currency: Mapped[EscrowCurrency] = mapped_column(SAEnum(EscrowCurrency, name="kora_currency_enum"))
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)       # 15%
    freelancer_payout: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)  # 85%
    split_rule_name: Mapped[str] = mapped_column(String(64), default="apex-marketplace-split")`,
  },
  {
    id: "phase18a-python-kora-client",
    phase: 18,
    title: "Python Kora Pay Client Wrapper (kora_client.py)",
    path: "phase18_architecture/backend/app/services/kora_client.py",
    language: "python",
    description:
      "Async httpx wrapper supporting charge_initialize, apex-marketplace-split rule creation, QA-triggered 85/15 split_payment, refund, and HMAC-SHA256 verify_webhook.",
    code: `class KoraPayClient:
    BASE_URL = "https://api.korapay.com/merchant/api/v1"

    def verify_webhook(self, raw_body: bytes, signature_header: str) -> bool:
        expected = hmac.new(self.webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature_header.strip())`,
  },
  {
    id: "phase18a-nextjs-payout-status",
    phase: 18,
    title: "Next.js 15 Freelancer Payout & T+2 Dashboard (PayoutStatusDashboard.tsx)",
    path: "phase18_architecture/nextjs/components/PayoutStatusDashboard.tsx",
    language: "ts",
    description:
      "Displays NGN/USD 85/15 net payouts, T+2 business day settlement countdown, indicative USD->NGN conversion, and PDF tax receipt download links.",
    code: `{isProcessingT2 && (
  <p className="font-semibold">
    Your payout is being processed. Expected settlement: 2 business days (T+2).
  </p>
)}`,
  },
  {
    id: "phase18a-pdf-lib-tax-receipt",
    phase: 18,
    title: "Tax-Compliant PDF Receipt Generator (taxReceiptPdf.ts)",
    path: "phase18_architecture/nextjs/lib/taxReceiptPdf.ts",
    language: "ts",
    description:
      "Uses pdf-lib to render A4 tax receipts detailing freelancer name, kora_recipient_id, gross escrow, 15% fee, VAT, 85% net payout, and Kora transaction reference.",
    code: `export async function generateKoraTaxReceiptPdf(input: KoraTaxReceiptInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  page.drawText("KORA PAY TAX-COMPLIANT MARKETPLACE SETTLEMENT RECEIPT", { x: 58, y: 758, size: 9 });
  return pdfDoc.save();
}`,
  },
  {
    id: "phase18b-fastapi-escrow-fund",
    phase: 18,
    title: "Phase 18B Client Escrow Pay-In & charge.success (escrow_funding.py)",
    path: "phase18_architecture/backend/app/routers/escrow_funding.py",
    language: "python",
    description:
      "Calls Kora Initialize Charge API (NGN/USD), returns checkout_url, and transitions escrow_ledger -> funded on HMAC-verified charge.success without triggering split.",
    code: `@router.post("/api/escrow/fund", response_model=FundEscrowResponse)
async def fund_escrow(payload: FundEscrowRequest, db: AsyncSession = Depends(get_db)):
    kora_response = await KoraPayClient().charge_initialize(
        amount=gross, currency=payload.currency, reference=reference, ...
    )
    ledger = EscrowLedger(status=KoraEscrowStatus.PENDING_FUNDING, kora_split_reference=None, ...)
    return FundEscrowResponse(checkout_url=kora_response["data"]["checkout_url"], split_triggered=False)`,
  },
  {
    id: "phase18b-nextjs-fund-modal",
    phase: 18,
    title: "Phase 18B Next.js 15 Fund Escrow Modal (FundEscrowModal.tsx)",
    path: "phase18_architecture/nextjs/components/FundEscrowModal.tsx",
    language: "ts",
    description:
      "Client pay-in form submitting { task_id, amount, currency: 'NGN' | 'USD' } to POST /api/escrow/fund and launching Kora checkout_url.",
    code: `const res = await fetch("/api/escrow/fund", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ task_id: taskId.trim(), amount: Number(amount), currency }),
});`,
  },
  {
    id: "phase18c-fastapi-escrow-release",
    phase: 18,
    title: "Phase 18C Automated QA-Triggered 85/15 Split (escrow_release.py)",
    path: "phase18_architecture/backend/app/routers/escrow_release.py",
    language: "python",
    description:
      "Called by the Python QA agent on POST /api/escrow/release: triggers apex-marketplace-split (85/15) + TaxReceipt on qa_passed=true, or flags disputed on qa_passed=false.",
    code: `@router.post("/api/escrow/release")
async def release_escrow_after_qa(payload: EscrowReleaseRequest, db: AsyncSession = Depends(get_db)):
    if not payload.qa_passed:
        ledger.status = KoraEscrowStatus.DISPUTED
        return {"status": "disputed", "admin_actions": ["Release Partial", "Refund Client"]}
    await KoraPayClient().split_payment(split_rule_name="apex-marketplace-split", ...)
    ledger.status = KoraEscrowStatus.RELEASED
    return {"status": "released", "tax_receipt_url": ledger.tax_receipt_url}`,
  },
  {
    id: "phase18d-fastapi-escrow-settlement",
    phase: 18,
    title: "Phase 18D T+2 Settlement & transfer.completed Webhook (escrow_settlement.py)",
    path: "phase18_architecture/backend/app/routers/escrow_settlement.py",
    language: "python",
    description:
      "Verifies HMAC-SHA256 transfer.completed webhooks, updates settled_at = now() & status = settled, retains 15% fee, and computes USD->NGN T+2 conversion.",
    code: `@router.post("/api/webhooks/kora/transfer-completed")
async def kora_transfer_completed_webhook(request: Request, x_korapay_signature: str = Header(default=""), db: AsyncSession = Depends(get_db)):
    if not KoraPayClient().verify_webhook(await request.body(), x_korapay_signature):
        raise HTTPException(status_code=401, detail="Invalid HMAC signature")
    ledger.settled_at = datetime.now(timezone.utc)
    ledger.status = KoraEscrowStatus.SETTLED
    return {"status": "settled", "tax_receipt_url": ledger.tax_receipt_url}`,
  },
  {
    id: "phase18e-fastapi-escrow-dispute",
    phase: 18,
    title: "Phase 18E Dispute & Refund Flow (escrow_dispute.py)",
    path: "phase18_architecture/backend/app/routers/escrow_dispute.py",
    language: "python",
    description:
      "Admin Dispute Review actions: Release Full (85/15), Refund Client via Kora Refund API, and custom Partial Release (e.g. 50/50 split).",
    code: `@router.post("/api/escrow/disputes/{escrow_id}/resolve")
async def resolve_disputed_escrow(escrow_id: uuid.UUID, payload: DisputeResolutionRequest, db: AsyncSession = Depends(get_db)):
    if payload.action == "refund_client":
        await KoraPayClient().refund(original_transaction_reference=ledger.kora_transaction_reference, ...)
        ledger.status = KoraEscrowStatus.REFUNDED
    split_pct = 85 if payload.action == "release_full" else int(payload.freelancer_pct or 50)
    await KoraPayClient().split_payment(freelancer_pct=split_pct, ...)`,
  },
  {
    id: "phase18f-fastapi-webhooks-kora",
    phase: 18,
    title: "Phase 18F Webhooks & X-Event-ID Idempotency (webhooks_kora.py)",
    path: "phase18_architecture/backend/app/routers/webhooks_kora.py",
    language: "python",
    description:
      "Unified /api/webhooks/kora router with raw-body HMAC-SHA256 verification, charge.success/transfer.completed/transfer.failed/transfer.refunded routing, admin alerting, and X-Event-ID webhook_events deduplication.",
    code: `@router.post("/api/webhooks/kora")
async def handle_kora_webhook(request: Request, x_korapay_signature: str = Header(default=""), x_event_id: str = Header(default="", alias="X-Event-ID"), db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    if not KoraPayClient().verify_webhook(raw_body, x_korapay_signature):
        raise HTTPException(status_code=401, detail="Invalid Kora Pay HMAC-SHA256 signature")
    if x_event_id and await db.scalar(select(WebhookEvent).where(WebhookEvent.event_id == x_event_id)):
        return {"received": True, "deduplicated": True, "event_id": x_event_id}
    # Routes charge.success -> funded, transfer.completed -> settled, transfer.failed -> failed + admin alert, transfer.refunded -> refunded
    db.add(WebhookEvent(event_id=x_event_id, event_type=event_name, signature_valid=True, payload_sha256=hashlib.sha256(raw_body).hexdigest()))
    await db.commit()`,
  },
  {
    id: "phase19a-nextjs-middleware",
    phase: 19,
    title: "Phase 19A Three-Plane Route Guard (middleware.ts)",
    path: "phase19_architecture/nextjs/middleware.ts",
    language: "ts",
    description:
      "Enforces isolated Public, User (/dashboard/*, /api/user/* with apex_user_session), and Admin (/admin/*, /api/admin/* with apex_admin_session) planes and logs cross-plane 403 incidents.",
    code: `if (plane === "admin" && !verifiedAdmin) {
  if (isCrossPlaneAttempt) {
    await logSecurityEvent(request, { kind: "incident", incidentType: "cross_plane_attempt", action: "CROSS_PLANE_ADMIN_ACCESS", result: "blocked_403" });
    return NextResponse.json({ error: "CROSS_PLANE_FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}`,
  },
  {
    id: "phase19a-isolated-layouts",
    phase: 19,
    title: "Phase 19A Isolated Route Groups ((admin)/layout.tsx & (user)/layout.tsx)",
    path: "phase19_architecture/nextjs/app/(admin)/admin/layout.tsx",
    language: "ts",
    description:
      "Dedicated AdminPlaneProvider and UserPlaneProvider layout boundaries ensuring zero shared React context or cross-plane state leakage.",
    code: `// app/(admin)/admin/layout.tsx -> <AdminPlaneProvider initialSession={{ plane: "admin", audience: "apex:admin", ... }}>{children}</AdminPlaneProvider>
// app/(user)/dashboard/layout.tsx -> <UserPlaneProvider initialSession={{ plane: "user", audience: "apex:user", ... }}>{children}</UserPlaneProvider>`,
  },
  {
    id: "phase19a-eslint-plane-guard",
    phase: 19,
    title: "Phase 19A Build-Time Cross-Plane ESLint Guard (eslint.config.mjs)",
    path: "phase19_architecture/nextjs/eslint.config.mjs",
    language: "js",
    description:
      "ESLint flat config + scripts/check-plane-isolation.mjs script failing build/lint if /dashboard imports from /admin or vice versa.",
    code: `export default [
  { files: ["app/(user)/**/*.{ts,tsx}", "src/planes/dashboard/**/*.{ts,tsx}"], rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["**/admin/**", "**/(admin)/**"] }] }] } },
  { files: ["app/(admin)/**/*.{ts,tsx}", "src/planes/admin/**/*.{ts,tsx}"], rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["**/dashboard/**", "**/(user)/**"] }] }] } },
];`,
  },
  {
    id: "phase19a-sql-audit-incidents",
    phase: 19,
    title: "Phase 19A Audit & Incidents Migration (019_security_audit_and_incidents.sql)",
    path: "phase19_architecture/backend/migrations/019_security_audit_and_incidents.sql",
    language: "sql",
    description:
      "Creates security_audit_logs and security_incidents tables with partial indexes and app.current_plane = 'admin' Row-Level Security policies.",
    code: `CREATE TABLE IF NOT EXISTS security_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), user_id UUID NULL, admin_id UUID NULL, plane TEXT NOT NULL CHECK (plane IN ('public', 'user', 'admin')), route TEXT NOT NULL, ip_address TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, result TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS security_incidents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), incident_type TEXT NOT NULL, source_plane TEXT NULL, target_plane TEXT NULL, route TEXT NOT NULL, ip_address TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb);`,
  },
  {
    id: "phase19b-user-auth",
    phase: 19,
    title: "Phase 19B User Plane Auth (auth-user.ts)",
    path: "phase19_architecture/nextjs/lib/auth-user.ts",
    language: "ts",
    description:
      "User-plane session cookie (apex_user_session, HttpOnly, SameSite=Lax, Path=/), JWT aud='apex:user', current_user_id claim, and /forgot-password + /reset-password flows.",
    code: `const payload: UserPlaneJwtPayload = { sub: userId, current_user_id: userId, orgId, role, aud: "apex:user", jti: crypto.randomUUID(), iat: now, exp: now + 86400 };
// Cookie: apex_user_session=...; Path=/; HttpOnly; SameSite=Lax; Secure`,
  },
  {
    id: "phase19b-admin-auth",
    phase: 19,
    title: "Phase 19B Admin Auth, TOTP & Invites (auth-admin.ts)",
    path: "phase19_architecture/nextjs/lib/auth-admin.ts",
    language: "ts",
    description:
      "Separate Admin staff auth (/admin/login + /admin/2fa) requiring TOTP before issuing apex_admin_session (SameSite=Strict, Path=/admin, aud='apex:admin', role: super_admin|finance|dpo) plus super_admin signed invites.",
    code: `const payload: AdminPlaneJwtPayload = { sub: adminId, admin_id: adminId, role, totp_verified: true, aud: "apex:admin", jti: crypto.randomUUID(), iat: now, exp: now + 14400 };
// Cookie: apex_admin_session=...; Path=/admin; HttpOnly; SameSite=Strict; Secure`,
  },
  {
    id: "phase19c-bundle-isolation",
    phase: 19,
    title: "Phase 19C Code Splitting & Bundle Verification (verify-dashboard-bundle.mjs)",
    path: "scripts/verify-dashboard-bundle.mjs",
    language: "js",
    description:
      "Lazy-loads AdminPortalShell, AdminEscrowControls, AdminDisputeReviewPanel, and AdminDashboardView out of /dashboard JS bundles and fails production builds if 'Release Escrow', 'Fund Escrow', or 'DPO Dashboard' appear in user chunks.",
    code: `const FORBIDDEN_DASHBOARD_STRINGS = ["Release Escrow", "Fund Escrow", "DPO Dashboard", "DPO Compliance", "Admin Control Plane"];
for (const chunkName of userDashboardChunks) {
  const content = fs.readFileSync(path.join(ASSETS_DIR, chunkName), "utf8");
  for (const needle of FORBIDDEN_DASHBOARD_STRINGS) {
    if (content.includes(needle)) process.exit(1);
  }
}`,
  },
  {
    id: "phase19d-envelope-encryption",
    phase: 19,
    title: "Phase 19D AES-256-GCM Envelope KMS & Field Masking (envelopeCrypto.ts)",
    path: "src/security/envelopeCrypto.ts",
    language: "ts",
    description:
      "Unique per-field 256-bit DEKs wrapped by separate KEK_USER and KEK_ADMIN with 90-day rotation, HTTPS+HSTS transport enforcement, and 'split_***_abcd' masking on User Plane APIs.",
    code: `const dek = crypto.randomBytes(32);
const kek = this.deriveKekBytes(scope, state.kekId, state.version);
const wrappedDek = aes256GcmWrap(dek, kek); // KEK_USER for escrow/Kora IDs, KEK_ADMIN for audit/DPO
export const maskKoraSplitReference = (v?: string | null) => (v ? \`split_***_\${v.trim().slice(-4)}\` : null);`,
  },
  {
    id: "phase19e-totp-2fa",
    phase: 19,
    title: "Phase 19E Mandatory Admin TOTP + 10 Backup Codes & Optional User 2FA",
    path: "phase19_architecture/backend/migrations/019e_totp_2fa_backup_codes.sql",
    language: "sql",
    description:
      "Forces first-login otplib TOTP enrollment with QR code + 10 single-use backup codes sealed via KEK_ADMIN for Admin staff, and provides optional TOTP + backup codes at /dashboard/settings/security for Users.",
    code: `ALTER TABLE IF EXISTS admin_users
  ADD COLUMN IF NOT EXISTS totp_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_secret_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS backup_codes_hashes JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Admin TOTP secret sealed exclusively under KEK_ADMIN; verified before issuing apex_admin_session`,
  },
  {
    id: "phase19f-security-audit-alerts",
    phase: 19,
    title: "Phase 19F Security Audit Trail, Incident Detection & Super Admin Email/Slack Alerts",
    path: "src/security/incidentNotifier.ts",
    language: "ts",
    description:
      "Logs every request touching /admin/* and /api/admin/* into security_audit_logs, triggers security_incidents on cross_plane_attempt, 5+ failed logins within 10 minutes, and rls_violation_attempt, and dispatches super_admin Email + Slack notifications.",
    code: `export function dispatchSuperAdminIncidentAlerts(incident: SecurityIncidentNotificationInput) {
  // Dispatches both Resend/SMTP Email to SUPER_ADMIN_ALERT_EMAIL and Block Kit Slack webhook
  // Recorded in security_alert_dispatches with delivery_mode: 'live_api' | 'sandbox_logged'
  return { dispatchedAt, channels: ["email", "slack"], dispatches: [emailDispatch, slackDispatch] };
}`,
  },
  {
    id: "phase19g-per-plane-logout-blocklist",
    phase: 19,
    title: "Phase 19G Per-Plane Logout & Remaining-TTL JWT Blocklist (jwtBlocklist.ts)",
    path: "src/security/jwtBlocklist.ts",
    language: "ts",
    description:
      "Separates User logout (/api/auth/user/logout -> destroys apex_user_session -> redirects /) from Admin logout (/api/auth/admin/logout -> destroys apex_admin_session -> redirects /admin/login), revoking each plane's JWT JTI in Redis/TTL blocklist with TTL = remaining JWT life without affecting the other plane.",
    code: `const remainingTtlSeconds = Math.max(1, expSec - nowSec);
const key = \`blocklist:jwt:\${input.plane}:\${input.jti}\`;
// User logout revokes aud='apex:user' JTI & clears Path=/ apex_user_session -> 303 /
// Admin logout revokes aud='apex:admin' JTI & clears Path=/admin apex_admin_session -> 303 /admin/login`,
  },
  {
    id: "phase19h-env-secrets",
    phase: 19,
    title: "Phase 19H Environment Variables & Plane Secret Isolation (.env.example)",
    path: ".env.example",
    language: "yaml",
    description:
      "Configures separated ADMIN_JWT_SECRET & USER_JWT_SECRET, distinct KMS_KEK_USER_ID & KMS_KEK_ADMIN_ID envelope keys, TOTP_ISSUER=DutchkemApex, HSTS_MAX_AGE=63072000, and COOKIE_DOMAIN=apexdata.dutchkemventures.com.",
    code: `ADMIN_JWT_SECRET="REPLACE_WITH_64_CHAR_HEX_ADMIN_JWT_SECRET"
USER_JWT_SECRET="REPLACE_WITH_64_CHAR_HEX_USER_JWT_SECRET"
KMS_KEK_USER_ID="kms-kek-user-v1"
KMS_KEK_ADMIN_ID="kms-kek-admin-v1"
TOTP_ISSUER=DutchkemApex
HSTS_MAX_AGE=63072000
COOKIE_DOMAIN=apexdata.dutchkemventures.com`,
  },
  {
    id: "phase20a-support-ticketing-ai",
    phase: 20,
    title: "Phase 20A In-App Support Ticketing, Gemini FAQ Agent & /admin/support Queue",
    path: "phase20_architecture/backend/migrations/020a_support_tickets.sql",
    language: "sql",
    description:
      "Creates RLS-protected support_tickets table, server-side Gemini 4 Hydrogen FAQ Support Agent, floating user SupportChatWidget with 'This didn\\'t help' escalation, and /admin/support specialist reply/close console.",
    code: `CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  ai_response TEXT,
  escalated_to_admin BOOLEAN NOT NULL DEFAULT FALSE
);`,
  },
  {
    id: "phase20b-content-moderation-autoban",
    phase: 20,
    title: "Phase 20B Pre-Upload Content Moderation (NSFW/STT/Toxicity) & 3-Strike Auto-Ban",
    path: "phase20_architecture/backend/fastapi/content_moderation.py",
    language: "python",
    description:
      "Pre-upload moderation middleware inspecting images/video (AWS Rekognition / NSFW.js), audio (STT speech vs noise/spam gate), and text (profanity/toxicity filter) before invoking QA Agents, with 3-strike automatic suspension and Admin incident notification.",
    code: `# 1. Images/Video -> AWS Rekognition DetectModerationLabels / NSFW.js / Gemini Vision Guard
# 2. Audio -> WAV RMS envelope + STT check ensuring real speech (blocks silence/noise/tone spam)
# 3. Text -> Profanity, hate speech, harassment, and injection toxicity filter
# 4. 3-Strike Auto-Ban -> sets users.is_suspended = TRUE, revokes JWT, logs security_incident + alerts Super Admin`,
  },
  {
    id: "phase20c-rate-limiter-circuit-breaker",
    phase: 20,
    title: "Phase 20C Upstash Redis Rate Limiter & Daily AI Spend Circuit Breaker",
    path: "phase20_architecture/backend/fastapi/rate_limiter.py",
    language: "python",
    description:
      "Applies Upstash Redis hourly rate limits (1,000 req/hr per API key on B2B Gateway, 50 uploads/hr for Pro QA Agents) and trips a global $100/day OpenAI/Gemini circuit breaker displaying 'High Traffic' (503) when spend threshold is hit.",
    code: `# B2B API Gateway: 1,000 req/hr per API key -> 429 RATE_LIMIT_EXCEEDED
# QA Agent Uploads: 50 uploads/hr for Pro users (tier-based limits)
# Daily AI Cost Circuit Breaker ($100/day default): returns 503 High Traffic & alerts Super Admin`,
  },
  {
    id: "phase20d-onboarding-empty-states",
    phase: 20,
    title: "Phase 20D Onboarding Wizard (/onboarding), Middleware Gate & Empty States",
    path: "phase20_architecture/nextjs/middleware.ts",
    language: "ts",
    description:
      "Enforces users.onboarding_completed = true in Edge Middleware before granting /dashboard/* access, guides new signups through Kora Pay payout connection, Free Trial/Plan selection, and first QA audio test, and provides Auto-Bidder Tutorial & Synthetic Data empty states.",
    code: `// Edge Middleware enforces users.onboarding_completed === true before /dashboard access
// Step 1: Connect Kora Pay payout recipient -> onboarding_step = 2
// Step 2: Choose Subscription Plan (starts Free Trial) -> onboarding_step = 3
// Step 3: Upload First WAV to test QA Agent -> sets users.onboarding_completed = true
// Empty States: 0 Jobs -> 'Generate Synthetic Data' CTA | 0 Tasks -> Auto-Bidder Video Tutorial`,
  },
  {
    id: "phase21a-prompt-vault-guard",
    phase: 21,
    title: "Phase 21A HashiCorp Prompt Vault, PromptGuard Shield & Revocable sk_live_org_ Keys",
    path: "phase21_architecture/backend/fastapi/prompt_guard.py",
    language: "python",
    description:
      "Moves all AI system prompts into HashiCorp Vault KV v2 (fail closed), decrypts in-memory only at LLM call time via VaultPromptClient, blocks injection patterns ('ignore previous instructions', 'you are now', 'system:', '</prompt>', '{inject}') via Regex + Gemini classifier logging to security_incidents, and issues revocable per-tenant sk_live_org_... API keys from /admin.",
    code: `# PromptGuard Middleware + VaultPromptClient
# Blocks: "ignore previous instructions" | "you are now" | "system:" | "</prompt>" | "{inject}"
# Per-tenant revocable keys: sk_live_org_<org_slug>_<hex> managed in /admin/prompt-vault`,
  },
  {
    id: "phase21b-zero-trust-anomaly",
    phase: 21,
    title: "Phase 21B Zero-Trust Anomaly Detection & Impossible Travel",
    path: "phase21_architecture/backend/fastapi/anomaly_detector.py",
    language: "python",
    description:
      "Integrates IPQualityScore & AbuseIPDB reputation scoring, computes real-time 0-100 AnomalyScore (IP reputation, Geo mismatch, User-Agent drift, Request rate deviation), blocks score > 80 with CAPTCHA challenge + security_incidents logging, and blocks Impossible Travel (> 500km within 60 minutes) requiring re-authentication.",
    code: `# AnomalyScore (0-100): IP Reputation (0-40) + Geo Drift (0-25) + UA Consistency (0-15) + Rate Deviation (0-20)
# Score > 80 -> Block HTTP 403 + Require CAPTCHA + Log security_incident (anomaly_blocked_ip)
# Impossible Travel (> 500km in <= 60m) -> Block Login HTTP 403 + Force Re-Auth + Log impossible_travel_detected`,
  },
  {
    id: "phase21c-webauthn-passkeys",
    phase: 21,
    title: "Phase 21C Phishing-Proof WebAuthn Passkeys & Admin YubiKey Enforcement",
    path: "phase21_architecture/backend/fastapi/webauthn_passkeys.py",
    language: "python",
    description:
      "Adds FIDO2/WebAuthn passkey authentication via @simplewebauthn and py_webauthn backed by the RLS-protected user_passkeys table (credential_id, public_key, counter, device_name). Enforces cross-platform YubiKey hardware keys with User Verification for Admin logins, domain-bound rpID/origin verification (fail closed), and monotonic counter replay protection.",
    code: `# user_passkeys(id, actor_plane, user_id, admin_id, credential_id, public_key, counter, device_name, aaguid, is_hardware_yubikey)
# User Login: Platform & roaming passkeys bound cryptographically to rpID/origin
# Admin Login: authenticatorAttachment='cross-platform', preferredAuthenticatorType='securityKey', userVerification='required' (YubiKey)
# Blocks & logs: WEBAUTHN_PHISHING_ORIGIN_MISMATCH, WEBAUTHN_REPLAY_DETECTED, CROSS_PLANE_FORBIDDEN`,
  },
  {
    id: "phase21d-immutable-audit-ledger",
    phase: 21,
    title: "Phase 21D Immutable Audit Merkle Chain, S3 Object Lock WORM & 72h NDPA Playbook",
    path: "phase21_architecture/backend/fastapi/audit_merkle_chain.py",
    language: "python",
    description:
      "Maintains tamper-evident audit_merkle_chain entries via SHA-256(entry_data + previous_hash), verifies the full chain before every write (failing closed HTTP 423 + alerting on tampering), mirrors records to AWS S3 Object Lock (COMPLIANCE WORM mode), and documents the 72-hour NDPA breach notification protocol in docs/BREACH-PLAYBOOK.md.",
    code: `# audit_merkle_chain(id, sequence_index, entry_hash, previous_hash, merkle_root, timestamp, user_id, action, metadata, worm_s3_key)
# entry_hash = sha256(canonical_entry_data + previous_hash)
# Pre-write verify_chain() -> fails closed (423 MERKLE_CHAIN_TAMPER_DETECTED) & alerts Super Admin + DPO
# S3 Mirror: PutObject(..., ObjectLockMode='COMPLIANCE', ObjectLockRetainUntilDate=+2555d, ContentMD5=...)`,
  },
  {
    id: "phase21e-freelancer-certification",
    phase: 21,
    title: "Phase 21E Freelancer QA Certification ($99 Kora Pay), SVG + JSON Badges & Priority Ranking",
    path: "phase21_architecture/backend/fastapi/certification_program.py",
    language: "python",
    description:
      "Adds RLS-protected certifications, certification_attempts, and priority_job_notifications tables; gates QA exam grading behind $99 Kora Pay verification (402 fail closed) and strict score > 90% threshold; issues custom SVG badges + HMAC-SHA256 verifiable JSON credentials; and ranks Verified/Expert freelancers first across Job Board search & early-access job alerts.",
    code: `# certifications(id, user_id, tier: 'verified' | 'expert', score > 90.00, payment_verified = TRUE, badge_svg, credential_json, issued_at)
# /certification -> $99 Kora Pay (USD/NGN/GBP) -> 10-question QA exam -> Score > 90% -> SVG + W3C JSON Credential
# Job Board Search & Bids -> Verified/Expert ranked strictly first + 30-45m Priority Job Notifications`,
  },
  {
    id: "phase21f-data-marketplace",
    phase: 21,
    title: "Phase 21F AI Data Marketplace (QA + Anonymization Gate & 10% Kora Pay Split)",
    path: "phase21_architecture/backend/fastapi/data_marketplace.py",
    language: "python",
    description:
      "Adds RLS-enforced datasets (id, seller_id, category, sample_count, price, anonymized) and dataset_purchases tables. Blocks unvalidated (< 85% QA) or un-anonymized/PII-leaking datasets fail closed (HTTP 422), settles AI Lab purchases via Kora Pay with an automated 10% platform commission / 90% creator split, and exposes a Marketplace tab on the homepage.",
    code: `# datasets(id, seller_id, category, sample_count, price, anonymized=TRUE, qa_validated=TRUE, qa_score>=85)
# POST /api/data-marketplace/datasets -> fail closed 422 on qa_validated!=true or unmasked PII
# POST /api/data-marketplace/purchase/verify -> 90% seller payout / 10% Kora Pay commission + tokenized JSONL download`,
  },
  {
    id: "phase21g-ai-coach-pro",
    phase: 21,
    title: "Phase 21G Pre-Flight AI Coach Pro ($19/month Kora Pay Subscription Gate)",
    path: "phase21_architecture/backend/fastapi/ai_coach.py",
    language: "python",
    description:
      "Adds RLS-protected coach_pro_subscriptions ($19/month Coach Pro tier) and coach_preflight_runs tables. Routes /coach submissions (Audio WAV DSP, YOLOv8 Bounding Box IoU, Localized Text) through the same production QA engines to report predicted pass rate %, exact metric issues (e.g., Audio 3 noise floor delta in dB), and improvement suggestions—gating unsubscribed users fail closed with HTTP 402.",
    code: `# coach_pro_subscriptions(id, user_id, tier_name='coach_pro', monthly_price_usd=19.00, status)
# POST /api/coach/analyze -> require_coach_pro() fail closed 402 COACH_PRO_REQUIRED
# Returns: predicted_pass_rate_pct, issues[] (exact dB/IoU delta), suggestions[]`,
  },
  {
    id: "phase21h-polygon-blockchain-escrow",
    phase: 21,
    title: "Phase 21H Enterprise Polygon USDC Smart Contract Escrow (Escrow.sol > $10,000)",
    path: "phase21_architecture/contracts/Escrow.sol",
    language: "solidity",
    description:
      "Hardened Solidity smart contract on Polygon PoS Mainnet (Circle USDC 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359) enforcing MIN_ENTERPRISE_USDC > 10,000 USDC for gas efficiency. Client deposits USDC into locked custody; backend QA Oracle signs qaReportHash to release 85/15 split on pass or trigger 100% client refund on QA failure.",
    code: `// Escrow.sol (Polygon PoS · USDC 6 decimals)
// require(amountUsdc > 10_000 * 1e6, "Escrow: contract must exceed $10,000 USDC");
// confirmQaAndRelease(jobId, qaReportHash) -> onlyOracle -> 85% Freelancer / 15% Treasury
// refundOnQaFailure(jobId, qaReportHash, reason) -> onlyOracle -> 100% Client Refund`,
  },
  {
    id: "phase22a-pwa-manifest-sw",
    phase: 22,
    title: "Phase 22A PWA Foundation (manifest.json, vite-plugin-pwa / @serwist/next & /offline)",
    path: "public/manifest.json",
    language: "json",
    description:
      "Installable standalone PWA configured with Deep Navy (#0B1F3A), separate 192x192 & 512x512 maskable PNG icons, VitePWA/Serwist Workbox caching for app shell, fonts, dashboard, and assigned Job Board scripts, plus /offline fallback route and iOS Safari A2HS prompt.",
    code: `{
  "id": "/",
  "name": "Dutchkem Apex Data Copilot",
  "short_name": "ApexData",
  "display": "standalone",
  "theme_color": "#0B1F3A",
  "background_color": "#0B1F3A",
  "icons": [
    { "src": "/pwa-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/pwa-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/pwa-maskable-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}`,
  },
  {
    id: "phase22b-mobile-responsive-layout",
    phase: 22,
    title: "Phase 22B Mobile-First Dashboard Layout, Sheet Drawer & Stacked Ledger Cards",
    path: "phase22_architecture/nextjs/app/(dashboard)/layout.tsx",
    language: "tsx",
    description:
      "Hides permanent sidebar below lg in favor of a shadcn/ui Sheet slide-out drawer and sticky 4-tab Bottom Navigation Bar (Home, Jobs, Earnings, Settings), converts multi-column Escrow Ledger & API Usage tables to stacked cards on mobile, and enforces >=44x44px touch targets for 360px viewports.",
    code: `// Desktop (lg+): hidden lg:flex w-64 sidebar
// Mobile (<lg): shadcn/ui <Sheet /> slide-out menu + fixed bottom nav (Home, Jobs, Earnings, Settings)
// Responsive Tables: md:hidden stacked cards + hidden md:block desktop tables
// Touch Targets: min-h-[44px] min-w-[44px] across buttons, inputs, selects, and navigation`,
  },
  {
    id: "phase22c-mobile-media-capture",
    phase: 22,
    title: "Phase 22C Native Mobile Media Capture (MediaRecorder -> 24kHz Mono WAV -> QA Agent)",
    path: "phase22_architecture/nextjs/components/MobileMediaRecorder.tsx",
    language: "tsx",
    description:
      "Adds Record Audio and Record Video MediaRecorder controls plus <input type='file' accept='audio/*,video/*' capture='environment' /> on /dashboard/workspace, resamples microphone streams to 24kHz Mono PCM-16 .wav via Web Audio OfflineAudioContext, and uploads directly to /api/qa/audio & /api/qa/video.",
    code: `// Capture Controls: Record Audio | Record Video | <input type="file" accept="audio/*,video/*" capture="environment" />
// Conversion: AudioContext.decodeAudioData -> OfflineAudioContext(1, frames, 24000) -> 16-bit PCM RIFF .wav
// QA Direct Upload: POST /api/qa/audio (wavBase64) | POST /api/qa/video (videoBase64)`,
  },
  {
    id: "phase22d-mobile-admin-dashboard",
    phase: 22,
    title: "Phase 22D Mobile Operations & Emergency Settlement Controls",
    path: "phase22_architecture/nextjs/app/admin/page.tsx",
    language: "tsx",
    description:
      "Provides a simplified mobile layout below lg using a dark shadcn/ui Sheet drawer and sticky bottom bar (Alerts, Escrow, Safety, Menu), converts multi-column ledgers and logs into stacked cards on 360px+ viewports, enforces >=44x44px touch targets, and exposes 1-tap emergency escrow settlement release or client refund actions wired to authenticated backend routes.",
    code: `// Mobile Shell (<lg): hidden lg:flex sidebar + dark <Sheet /> drawer + fixed 4-button bottom bar
// Emergency Controls: 1-tap settlement release (85/15 split) or client refund on critical alerts
// Backend Endpoints: POST /admin/api/escrow/:escrowId/release & /refund (super_admin | finance RBAC)
// Responsive Ledgers: md:hidden stacked cards + hidden md:block desktop tables with min-h-[44px]`,
  },
  {
    id: "phase22e-mobile-e2e-playwright",
    phase: 22,
    title: "Phase 22E Mobile Playwright E2E Suite (iPhone 13, Pixel 5, iPad Mini)",
    path: "playwright.config.ts",
    language: "typescript",
    description:
      "Configures Playwright mobile & tablet projects (iPhone 13, Pixel 5, iPad Mini) and runs full mobile end-to-end tests covering signup, 3-step onboarding, mocked MediaRecorder 24kHz Mono WAV capture, QA Agent verification, task submission, >=44px touch targets, and zero horizontal overflow.",
    code: `// Devices: iPhone 13 (390x844), Pixel 5 (393x851), iPad Mini (768x1024)
// Spec: tests/e2e/mobile-audio-capture.spec.ts -> /signup -> onboarding -> Record Audio -> QA PASSED -> Submit
// Command: npm run test:e2e:mobile`,
  },
  {
    id: "phase23a-zero-downtime-pipeline",
    phase: 23,
    title: "Phase 23A Zero-Downtime Pipeline (Vercel, Railway, 7-Day Redis Sessions, SWR & /api/health)",
    path: "railway.toml",
    language: "toml",
    description:
      "Configures atomic main-only Vercel production deploys with PR previews, isolated Blue-Green console routing on admin.dutchkemventures.com, Railway 30s /api/health rolling container drain + auto-rollback, 7-day Upstash Redis session persistence, and Stale-While-Revalidate PWA updates on next navigation.",
    code: `# railway.toml -> healthcheckPath = "/api/health", healthcheckTimeout = 30, overlapSeconds = 30, drainingSeconds = 30
# vercel.json / vercel.admin.json -> atomic user deploy + isolated Blue-Green console deploy
# RedisSessionStore -> USER_SESSION_TTL_SECONDS = 604800 (7 days, survives rolling deploys)
# VitePWA / Serwist -> StaleWhileRevalidate + skipWaiting: false (updates activate on next navigation)`,
  },
  {
    id: "phase23b-automated-dependency-updates",
    phase: 23,
    title: "Phase 23B Dependabot SemVer Policy, pip-audit/npm-audit Gate, Snyk + Weekly Cron",
    path: ".github/dependabot.yml",
    language: "yaml",
    description:
      "Configures daily Dependabot updates across npm, pip (requirements.txt), and GitHub Actions: patch versions auto-merge after CI/CVE checks pass, minor versions require PR review, major versions require manual review plus staging deploy. Runs pip-audit, npm audit (blocking critical CVEs), and Snyk CLI scans with Slack alerting on every PR and every Sunday at 02:00 UTC.",
    code: `# .github/dependabot.yml + .github/workflows/dependabot-automerge.yml
# - Patch: Auto-approve & squash auto-merge after lint + build + CVE gates pass
# - Minor: Label 'needs-review' -> human review required
# - Major: Label 'major-upgrade, requires-staging-deploy' -> manual review + staging deploy
# .github/workflows/pr-security-gate.yml -> npm audit + pip-audit (Critical CVEs block merge) + Snyk Slack alert
# .github/workflows/security-scan.yml -> cron: "0 2 * * 0" (Sunday 02:00 UTC)`,
  },
  {
    id: "phase23c-feature-flags-canary",
    phase: 23,
    title: "Phase 23C PostHog/Unleash Feature Flags, 24h Canary (5% -> 25% -> 100%) & Instant Rollback",
    path: "src/devops/featureFlags.ts",
    language: "typescript",
    description:
      "Integrates PostHog Feature Flags & self-hosted Unleash with deterministic cohort hashing, gates new features behind feature.new_dashboard_enabled, automates 5% -> 25% -> 100% canary progression over 24 hours, exposes instant zero-redeploy rollback, and assigns individual kill-switch flags across Phases 1 through 22.",
    code: `// Flag Registry: feature.new_dashboard_enabled + phase.1_* through phase.22_*
// Canary Cohorts (24h): T+0h -> 5% | T+8h -> 25% | T+24h -> 100%
// Instant Rollback: POST /admin/api/feature-flags/:key/rollback (0% without redeploy)`,
  },
  {
    id: "phase23d-zero-downtime-migrations",
    phase: 23,
    title: "Phase 23D Zero-Downtime Expand-Contract Migrations & Neon Shadow DB CI",
    path: "migrations/0003_add_escrow.up.sql",
    language: "sql",
    description:
      "Enforces the 3-step Expand -> Migrate -> Contract schema evolution workflow with mandatory .down.sql rollback scripts (e.g., 0003_add_escrow.up.sql + 0003_add_escrow.down.sql), blocks dropping columns in the same deploy as adding columns, and verifies apply up -> apply down -> apply up against an ephemeral Neon shadow DB branch on every PR.",
    code: `-- Step 1 (Expand): migrations/0003_add_escrow.up.sql + .down.sql (additive columns only)
-- Step 2 (Migrate): migrations/0004_backfill_escrow_splits.up.sql (backfill + dual-write trigger)
-- Step 3 (Contract): migrations/0005_contract_legacy_escrow_col.up.sql (drop legacy column later)
-- CI Check (.github/workflows/migration-ci.yml): Neon Shadow DB apply up -> apply down -> apply up`,
  },
  {
    id: "phase23e-self-healing-rollback",
    phase: 23,
    title: "Phase 23E Self-Healing, 5-Failure Circuit Breakers, Sentry/PagerDuty & 60s Auto-Rollback",
    path: "src/devops/selfHealingEngine.ts",
    language: "typescript",
    description:
      "Monitors /api/health (DB, Redis, AI providers, Kora Pay), trips circuit breakers on Kora Pay, OpenAI, and Redis after 5 consecutive failures with automatic fallback + admin alerts, creates Sentry incidents on every 5xx (>10 errors/min triggers PagerDuty + Slack), serves cached snapshots when DB is slow, queues AI tasks when AI is down, and auto-rolls back if 5xx rate exceeds 1% for 60 seconds post-deploy.",
    code: `// Composite Probe: GET /api/health -> 200 healthy | 503 degraded/rolled_back
// Circuit Breakers (threshold = 5 consecutive failures): kora_pay | openai | redis
// Sentry + PagerDuty/Slack: every 5xx -> Sentry incident; >10 errors/min -> PagerDuty + Slack
// Auto-Rollback: 5xx rate > 1% for 60s post-deploy -> revert to PREVIOUS_DEPLOYMENT_ID`,
  },
  {
    id: "phase23f-automation-crons",
    phase: 23,
    title: "Phase 23F Scheduled Curriculum Sync, Weekly 5x SEO Publishing & QA Recomputation",
    path: "src/devops/automationCronService.ts",
    language: "typescript",
    description:
      "Runs three scheduled pipelines: Daily 2 AM curriculum sync across all 6 sources (flagging outdated plans), Weekly Sunday 3 AM generation & publishing of 5 SEO articles to /blog, and Weekly Monday 4 AM freelancer QA/certification recomputation. Every run writes auditable rows to automation_logs and retries failures 3x with exponential backoff + Slack alerts.",
    code: `// vercel.json + .github/workflows/automation-crons.yml:
//   0 2 * * * -> /api/cron/curriculum-sync (6 sources + flag outdated plans)
//   0 3 * * 0 -> /api/cron/seo-weekly (5 articles -> /blog)
//   0 4 * * 1 -> /api/cron/qa-recompute (QA scores & certifications)
// Every run logs to automation_logs; failures retry 3x with backoff + Slack alert`,
  },
  {
    id: "phase23g-backup-recovery",
    phase: 23,
    title: "Phase 23G Neon 7-Day PITR, R2 90-Day Versioning, Weekly Restore Drill & 24h Monitor",
    path: "src/devops/backupRecoveryService.ts",
    language: "typescript",
    description:
      "Enables Neon PostgreSQL Point-in-Time Recovery with 7-day (604,800s) retention, activates Cloudflare R2 bucket versioning on audio/video assets retaining noncurrent versions for 90 days, executes automated weekly staging restore drills (restore -> integrity checks -> delete staging DB), and alerts admins via Slack if no backup completes within 24 hours.",
    code: `// phase23_architecture/backup/neon-pitr-config.json -> historyRetentionDays = 7 (604800s)
// phase23_architecture/backup/r2-lifecycle-versioning.json -> Status = Enabled, NoncurrentDays = 90
// scripts/weekly-restore-drill.mjs -> Sunday 05:00 UTC restore to staging -> verify -> delete staging DB
// /api/cron/backup-monitor -> alerts Slack + Super Admin Incident if lastBackupAgeHours > 24`,
  },
  {
    id: "phase23h-runbook-status-deployments",
    phase: 23,
    title: "Phase 23H Public Status Page (60s Updates), Postmortem Template, /admin/deployments & rollback.sh",
    path: "scripts/rollback.sh",
    language: "bash",
    description:
      "Serves a real-time public status page at status.yourdomain.com (/status) updated every 60 seconds via automated health checks and SSE, provides the incident postmortem template at docs/INCIDENTS/TEMPLATE.md, exposes /admin/deployments with per-release rollback actions, and includes ./scripts/rollback.sh <deploy_id> for one-command recovery.",
    code: `#!/usr/bin/env bash
# Usage: ./scripts/rollback.sh <deploy_id>
# Public Status: /status & status.dutchkemventures.com (60s automated probes + /api/status/stream)
# Postmortem Template: docs/INCIDENTS/TEMPLATE.md
# Admin Deployment Ledger & Rollback UI: /admin/deployments`,
  },
];







