import { useCallback, useEffect, useState } from "react";

export const PHASE_FEATURE_FLAG_MAP: Record<number, string> = {
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

interface FeatureFlagsResponse {
  provider: string;
  distinctId: string;
  flags: Record<string, boolean>;
}

export function useFeatureFlags(userId?: string | null, orgId?: string | null) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<string>("local_deterministic");
  const [loaded, setLoaded] = useState(false);

  const refreshFlags = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (userId) headers["x-user-id"] = userId;
      if (orgId) headers["x-org-id"] = orgId;
      const res = await fetch("/api/feature-flags", {
        credentials: "include",
        headers,
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as FeatureFlagsResponse;
      if (data && data.flags) {
        setFlags(data.flags);
        setProvider(data.provider || "local_deterministic");
        setLoaded(true);
      }
    } catch {
      // Fail-open UI cache until flag endpoint responds cleanly
    }
  }, [userId, orgId]);

  useEffect(() => {
    void refreshFlags();
    const onFocusOrNav = () => void refreshFlags();
    window.addEventListener("focus", onFocusOrNav);
    window.addEventListener("popstate", onFocusOrNav);
    const interval = window.setInterval(() => void refreshFlags(), 15000);
    return () => {
      window.removeEventListener("focus", onFocusOrNav);
      window.removeEventListener("popstate", onFocusOrNav);
      window.clearInterval(interval);
    };
  }, [refreshFlags]);

  const isFeatureEnabled = useCallback(
    (key: string): boolean => {
      if (!loaded) return true;
      return flags[key] !== false;
    },
    [flags, loaded]
  );

  const isPhaseEnabled = useCallback(
    (phaseNumber: number): boolean => {
      const key = PHASE_FEATURE_FLAG_MAP[phaseNumber];
      if (!key || !loaded) return true;
      return flags[key] !== false;
    },
    [flags, loaded]
  );

  return {
    flags,
    provider,
    loaded,
    isFeatureEnabled,
    isPhaseEnabled,
    refreshFlags,
  };
}
