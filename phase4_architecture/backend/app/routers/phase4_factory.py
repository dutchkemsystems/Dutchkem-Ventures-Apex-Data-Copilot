from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.tenant_rls import TenantContext, get_tenant_db, require_roles
from app.models import UserRole
from app.services.red_team_agent import AdversarialRedTeamAgent, AttackVector
from app.services.synthetic_factory import ElevenLabsVoiceProvider, SyntheticDataFactory

router = APIRouter(prefix="/api/v1", tags=["Synthetic Factory & Red-Teaming"])


class GenerateDatasetRequest(BaseModel):
    name: str
    locales: list[str] = Field(default_factory=lambda: ["es-ES", "en-GB", "fr-FR"])
    accents: list[str] = Field(default_factory=lambda: ["Castilian", "Rioplatense"])
    tones: list[str] = Field(default_factory=lambda: ["Neutral", "Empathetic"])
    phonetic_complexity: str = "Plosives, code-switching & financial numerals"
    sample_count: int = Field(default=10, ge=1, le=500)


class RedTeamCampaignRequest(BaseModel):
    target_model_name: str
    target_system_prompt: str
    vectors: list[AttackVector] = Field(
        default_factory=lambda: [
            AttackVector.PROMPT_INJECTION,
            AttackVector.ROLEPLAY_JAILBREAK,
            AttackVector.LOGIC_TRAP,
        ]
    )
    probes_per_vector: int = Field(default=2, ge=1, le=10)


@router.post("/factory/generate")
async def generate_synthetic_dataset(
    body: GenerateDatasetRequest,
    ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)),
    _db: AsyncSession = Depends(get_tenant_db),
):
    provider = ElevenLabsVoiceProvider(api_key="env-injected")
    factory = SyntheticDataFactory(voice_provider=provider)
    utterances = await factory.generate_phonetic_scripts(
        locales=body.locales,
        accents=body.accents,
        tones=body.tones,
        complexity=body.phonetic_complexity,
        batch_size=body.sample_count,
    )
    return {"org_id": str(ctx.org_id), "dataset_name": body.name, "samples": utterances}


@router.post("/red-team/run")
async def run_red_team_campaign(
    body: RedTeamCampaignRequest,
    ctx: TenantContext = Depends(require_roles(UserRole.ADMIN)),
    _db: AsyncSession = Depends(get_tenant_db),
):
    agent = AdversarialRedTeamAgent()
    report = agent.evaluate_target_model(
        target_model_name=body.target_model_name,
        target_system_prompt=body.target_system_prompt,
        vectors=body.vectors,
        probes_per_vector=body.probes_per_vector,
    )
    return {"org_id": str(ctx.org_id), "report": report}
