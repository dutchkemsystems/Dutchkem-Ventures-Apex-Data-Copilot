import crypto from "node:crypto";

export const NEW_DASHBOARD_FLAG = "feature.new_dashboard_enabled";

export const PHASE_FLAGS: Record<number, string> = {
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
};

export function resolveCanaryPctOver24h(hoursSinceCanaryStart: number): 5 | 25 | 100 {
  if (hoursSinceCanaryStart < 8) return 5;
  if (hoursSinceCanaryStart < 24) return 25;
  return 100;
}

export function inDeterministicCanaryCohort(
  flagKey: string,
  distinctId: string,
  rolloutPct: number
): boolean {
  if (rolloutPct <= 0) return false;
  if (rolloutPct >= 100) return true;
  const bucket = crypto.createHash("sha256").update(`${flagKey}:${distinctId}`).digest().readUInt32BE(0) % 100;
  return bucket < rolloutPct;
}

export async function evaluatePostHogFlag(flagKey: string, distinctId: string): Promise<boolean | null> {
  const apiKey = (process.env.POSTHOG_PROJECT_API_KEY || "").trim();
  const host = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").trim().replace(/\/+$/, "");
  if (!apiKey) return null;

  const res = await fetch(`${host}/decide/?v=3`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, distinct_id: distinctId }),
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { featureFlags?: Record<string, boolean | string> };
  const val = data.featureFlags?.[flagKey];
  return typeof val === "boolean" ? val : null;
}

export async function isFeatureEnabledForUser(
  flagKey: string,
  distinctId: string,
  fallbackRolloutPct = 100
): Promise<boolean> {
  try {
    const posthogVal = await evaluatePostHogFlag(flagKey, distinctId);
    if (posthogVal !== null) return posthogVal;
  } catch {
    // fallback to deterministic canary evaluation
  }
  return inDeterministicCanaryCohort(flagKey, distinctId, fallbackRolloutPct);
}
