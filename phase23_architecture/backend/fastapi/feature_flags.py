import hashlib
import os
from typing import Dict

import httpx
from fastapi import APIRouter, HTTPException, Request, status

router = APIRouter(tags=["Feature Flags & Canary Releases"])

PHASE_FLAGS: Dict[int, str] = {
    1: "phase.1_core_tenant_rls_enabled",
    2: "phase.2_auto_bidder_enabled",
    3: "phase.3_qa_engines_enabled",
    4: "phase.4_synthetic_red_team_enabled",
    5: "phase.5_expert_marketplace_enabled",
    6: "phase.6_realtime_telemetry_enabled",
    7: "phase.7_b2b_api_gateway_enabled",
    8: "phase.8_user_security_2fa_enabled",
    9: "phase.9_trial_billing_korapay_enabled",
    10: "phase.10_landing_seo_funnel_enabled",
    11: "phase.11_white_label_enterprise_enabled",
    12: "phase.12_compliance_legal_pages_enabled",
    13: "phase.13_monorepo_docker_stack_enabled",
    14: "phase.14_ai_eval_benchmarks_enabled",
    15: "phase.15_two_sided_job_board_enabled",
    16: "phase.16_affiliate_referrals_enabled",
    17: "phase.17_dynamic_pricing_insights_enabled",
    18: "phase.18_kora_escrow_splits_enabled",
    19: "phase.19_three_plane_zero_trust_enabled",
    20: "phase.20_trust_safety_onboarding_enabled",
    21: "phase.21_enterprise_moat_blockchain_enabled",
    22: "phase.22_mobile_pwa_capture_enabled",
}

FLAG_ROLLOUT_STATE: Dict[str, dict] = {
    "feature.new_dashboard_enabled": {"enabled": True, "rollout_pct": 100},
    **{key: {"enabled": True, "rollout_pct": 100} for key in PHASE_FLAGS.values()},
}


def deterministic_canary_match(flag_key: str, distinct_id: str, rollout_pct: int) -> bool:
    if rollout_pct <= 0:
        return False
    if rollout_pct >= 100:
        return True
    digest = hashlib.sha256(f"{flag_key}:{distinct_id}".encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:4], "big") % 100
    return bucket < rollout_pct


async def evaluate_flag(flag_key: str, distinct_id: str) -> bool:
    posthog_key = os.getenv("POSTHOG_PROJECT_API_KEY", "").strip()
    posthog_host = os.getenv("POSTHOG_HOST", "https://us.i.posthog.com").strip().rstrip("/")
    if posthog_key:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.post(
                    f"{posthog_host}/decide/?v=3",
                    json={"api_key": posthog_key, "distinct_id": distinct_id},
                )
                if res.status_code == 200:
                    val = res.json().get("featureFlags", {}).get(flag_key)
                    if isinstance(val, bool):
                        return val
        except Exception:
            pass

    state = FLAG_ROLLOUT_STATE.get(flag_key)
    if not state or not state["enabled"]:
        return False
    return deterministic_canary_match(flag_key, distinct_id, int(state["rollout_pct"]))


def require_feature_flag(flag_key: str):
    async def _guard(request: Request) -> None:
        distinct_id = request.headers.get("x-user-id", "anonymous")
        if not await evaluate_flag(flag_key, distinct_id):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Feature '{flag_key}' is currently disabled or rolled back.",
            )

    return _guard


@router.post("/admin/api/feature-flags/{flag_key}/rollback")
async def instant_rollback(flag_key: str) -> dict:
    if flag_key not in FLAG_ROLLOUT_STATE:
        raise HTTPException(status_code=404, detail=f"Unknown flag '{flag_key}'")
    FLAG_ROLLOUT_STATE[flag_key] = {"enabled": False, "rollout_pct": 0}
    return {"flag_key": flag_key, "enabled": False, "rollout_pct": 0, "rolled_back": True}
