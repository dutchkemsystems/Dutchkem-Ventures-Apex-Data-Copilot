import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Phase 23C: Feature Flags & Progressive Canary Release Engine
 * Supports PostHog Feature Flags, self-hosted Unleash, and deterministic local evaluation
 * with 24-hour progressive canary stages (5% -> 25% -> 100%) and zero-redeploy instant rollback.
 */

export type FeatureFlagProvider = "posthog" | "unleash" | "local_deterministic";
export type CanaryStage = "rollback_0pct" | "canary_5pct" | "canary_25pct" | "ga_100pct";

export interface FeatureFlagRecord {
  key: string;
  label: string;
  description: string;
  category: "feature" | "phase";
  phaseNumber: number | null;
  enabled: boolean;
  rolloutPercentage: number;
  canaryStage: CanaryStage;
  canaryStartedAt: string | null;
  canaryTargetHours: number;
  lastToggledAt: string;
  lastToggledBy: string;
  rollbackCount: number;
}

export interface FeatureFlagAuditEvent {
  id: string;
  timestamp: string;
  flagKey: string;
  action: "toggle_on" | "toggle_off" | "canary_stage_changed" | "instant_rollback";
  actor: string;
  previousPercentage: number;
  newPercentage: number;
  previousEnabled: boolean;
  newEnabled: boolean;
  providerSynced: boolean;
}

const PERSISTENCE_PATH = path.join("/tmp", "apex_feature_flags_v1.json");

export const PHASE_FLAG_KEYS: Record<number, string> = {
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

const PHASE_FLAG_TITLES: Record<number, string> = {
  1: "Phase 1 · Multi-Tenant Core & Postgres RLS",
  2: "Phase 2 · Autonomous Auto-Bidder & Lead Scraper",
  3: "Phase 3 · Audio DSP, YOLOv8 Vision & Localization QA",
  4: "Phase 4 · Synthetic Data Factory & Red-Team Prober",
  5: "Phase 5 · Verified Expert Marketplace",
  6: "Phase 6 · WebSocket Telemetry & Mock Interview Simulator",
  7: "Phase 7 · B2B Metered API Gateway",
  8: "Phase 8 · User Security, Settings & TOTP 2FA",
  9: "Phase 9 · 14-Day Trial & Kora Pay Subscriptions",
  10: "Phase 10 · Public Marketing Funnel & Programmatic SEO",
  11: "Phase 11 · White-Label Enterprise Isolation Lab",
  12: "Phase 12 · Legal & Compliance Disclosures",
  13: "Phase 13 · Production Architecture & Workers",
  14: "Phase 14 · AI Benchmark Telemetry & QA Evaluators",
  15: "Phase 15 · Two-Sided Client/Freelancer Job Board",
  16: "Phase 16 · 20% Recurring Affiliate Program",
  17: "Phase 17 · Dynamic Surge Pricing & PDF Intelligence",
  18: "Phase 18 · Kora Pay 85/15 Split Escrow & T+2 Receipts",
  19: "Phase 19 · Three-Plane Auth & Envelope KMS",
  20: "Phase 20 · Support AI, Content Moderation & Onboarding",
  21: "Phase 21 · Prompt Vault, Passkeys, Coach & Polygon Escrow",
  22: "Phase 22 · Mobile-First PWA, MediaRecorder & Mobile Admin",
};

function buildDefaultFlags(): FeatureFlagRecord[] {
  const now = new Date().toISOString();
  const list: FeatureFlagRecord[] = [
    {
      key: "feature.new_dashboard_enabled",
      label: "New Data Copilot Dashboard Shell",
      description:
        "Gates the redesigned Data Copilot workspace shell. Supports 24-hour progressive canary (5% -> 25% -> 100%) and instant rollback.",
      category: "feature",
      phaseNumber: null,
      enabled: true,
      rolloutPercentage: 100,
      canaryStage: "ga_100pct",
      canaryStartedAt: now,
      canaryTargetHours: 24,
      lastToggledAt: now,
      lastToggledBy: "system_bootstrap",
      rollbackCount: 0,
    },
    {
      key: "feature.canary_telemetry_v2_enabled",
      label: "Telemetry & QA Benchmarking v2 (Canary)",
      description:
        "Progressive canary release flag demonstrating active 5% -> 25% -> 100% rollout cohorts over 24 hours.",
      category: "feature",
      phaseNumber: null,
      enabled: true,
      rolloutPercentage: 25,
      canaryStage: "canary_25pct",
      canaryStartedAt: now,
      canaryTargetHours: 24,
      lastToggledAt: now,
      lastToggledBy: "system_bootstrap",
      rollbackCount: 0,
    },
  ];

  for (let phase = 1; phase <= 22; phase += 1) {
    const key = PHASE_FLAG_KEYS[phase];
    list.push({
      key,
      label: PHASE_FLAG_TITLES[phase],
      description: `Independent kill-switch & progressive rollout gate for Platform Phase ${phase}.`,
      category: "phase",
      phaseNumber: phase,
      enabled: true,
      rolloutPercentage: 100,
      canaryStage: "ga_100pct",
      canaryStartedAt: now,
      canaryTargetHours: 24,
      lastToggledAt: now,
      lastToggledBy: "system_bootstrap",
      rollbackCount: 0,
    });
  }

  return list;
}

export function computeCanaryBucket(flagKey: string, distinctId: string): number {
  const digest = crypto.createHash("sha256").update(`${flagKey}:${distinctId}`).digest();
  // Deterministic 0..99 bucket using unsigned 32-bit slice
  return digest.readUInt32BE(0) % 100;
}

export function resolve24hCanaryPercentage(hoursElapsed: number): {
  stage: CanaryStage;
  percentage: number;
} {
  if (hoursElapsed < 8) {
    return { stage: "canary_5pct", percentage: 5 };
  }
  if (hoursElapsed < 24) {
    return { stage: "canary_25pct", percentage: 25 };
  }
  return { stage: "ga_100pct", percentage: 100 };
}

export class FeatureFlagService {
  private readonly flags = new Map<string, FeatureFlagRecord>();
  private readonly auditTrail: FeatureFlagAuditEvent[] = [];

  constructor() {
    for (const def of buildDefaultFlags()) {
      this.flags.set(def.key, def);
    }
    this.hydrateFromDisk();
  }

  private hydrateFromDisk(): void {
    try {
      if (!fs.existsSync(PERSISTENCE_PATH)) return;
      const raw = JSON.parse(fs.readFileSync(PERSISTENCE_PATH, "utf8")) as {
        flags?: FeatureFlagRecord[];
        auditTrail?: FeatureFlagAuditEvent[];
      };
      if (Array.isArray(raw.flags)) {
        for (const f of raw.flags) {
          if (f && f.key && this.flags.has(f.key)) {
            this.flags.set(f.key, f);
          }
        }
      }
      if (Array.isArray(raw.auditTrail)) {
        this.auditTrail.push(...raw.auditTrail.slice(0, 100));
      }
    } catch {
      // ignore corrupted cache
    }
  }

  private persistToDisk(): void {
    try {
      fs.writeFileSync(
        PERSISTENCE_PATH,
        JSON.stringify({
          flags: Array.from(this.flags.values()),
          auditTrail: this.auditTrail.slice(0, 100),
        }),
        { mode: 0o600 }
      );
    } catch {
      // non-fatal on read-only fs
    }
  }

  public getProviderConfig(): {
    provider: FeatureFlagProvider;
    posthogConfigured: boolean;
    unleashConfigured: boolean;
    host: string | null;
  } {
    const posthogKey = (process.env.POSTHOG_PROJECT_API_KEY || "").trim();
    const posthogHost = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").trim();
    const unleashUrl = (process.env.UNLEASH_URL || "").trim();
    const unleashToken = (process.env.UNLEASH_API_TOKEN || "").trim();

    const posthogConfigured = Boolean(posthogKey && !posthogKey.includes("MY_POSTHOG"));
    const unleashConfigured = Boolean(
      unleashUrl && unleashToken && !unleashUrl.includes("MY_UNLEASH") && !unleashToken.includes("MY_UNLEASH")
    );

    const provider: FeatureFlagProvider = posthogConfigured
      ? "posthog"
      : unleashConfigured
      ? "unleash"
      : "local_deterministic";

    return {
      provider,
      posthogConfigured,
      unleashConfigured,
      host: posthogConfigured ? posthogHost : unleashConfigured ? unleashUrl : null,
    };
  }

  private async syncUpstreamProvider(flag: FeatureFlagRecord): Promise<boolean> {
    const cfg = this.getProviderConfig();
    if (cfg.provider === "posthog") {
      const personalKey = (process.env.POSTHOG_PERSONAL_API_KEY || "").trim();
      const projectId = (process.env.POSTHOG_PROJECT_ID || "").trim();
      if (!personalKey || !projectId || personalKey.includes("MY_POSTHOG")) {
        return false;
      }
      try {
        const res = await fetch(
          `${(cfg.host || "https://us.posthog.com").replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/feature_flags/`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${personalKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              key: flag.key,
              name: flag.label,
              active: flag.enabled,
              filters: {
                groups: [{ properties: [], rollout_percentage: flag.rolloutPercentage }],
              },
            }),
            signal: AbortSignal.timeout(3000),
          }
        );
        return res.ok;
      } catch {
        return false;
      }
    }

    if (cfg.provider === "unleash") {
      const token = (process.env.UNLEASH_API_TOKEN || "").trim();
      if (!cfg.host || !token) return false;
      try {
        const action = flag.enabled ? "on" : "off";
        const res = await fetch(
          `${cfg.host.replace(/\/$/, "")}/api/admin/projects/default/features/${encodeURIComponent(flag.key)}/environments/production/${action}`,
          {
            method: "POST",
            headers: { Authorization: token },
            signal: AbortSignal.timeout(3000),
          }
        );
        return res.ok;
      } catch {
        return false;
      }
    }

    return false;
  }

  public evaluateFlag(flagKey: string, distinctId = "anonymous-session"): {
    key: string;
    enabled: boolean;
    bucket: number;
    rolloutPercentage: number;
    canaryStage: CanaryStage;
    reason: string;
  } {
    const flag = this.flags.get(flagKey);
    const bucket = computeCanaryBucket(flagKey, distinctId);
    if (!flag) {
      return {
        key: flagKey,
        enabled: false,
        bucket,
        rolloutPercentage: 0,
        canaryStage: "rollback_0pct",
        reason: "unknown_flag_fail_closed",
      };
    }

    if (!flag.enabled || flag.rolloutPercentage <= 0) {
      return {
        key: flagKey,
        enabled: false,
        bucket,
        rolloutPercentage: 0,
        canaryStage: flag.canaryStage,
        reason: "toggled_off_or_rolled_back",
      };
    }

    if (flag.rolloutPercentage >= 100) {
      return {
        key: flagKey,
        enabled: true,
        bucket,
        rolloutPercentage: 100,
        canaryStage: flag.canaryStage,
        reason: "ga_100_percent",
      };
    }

    const inCohort = bucket < flag.rolloutPercentage;
    return {
      key: flagKey,
      enabled: inCohort,
      bucket,
      rolloutPercentage: flag.rolloutPercentage,
      canaryStage: flag.canaryStage,
      reason: inCohort
        ? `canary_cohort_included (bucket ${bucket} < ${flag.rolloutPercentage}%)`
        : `canary_cohort_held_out (bucket ${bucket} >= ${flag.rolloutPercentage}%)`,
    };
  }

  public evaluateAllForActor(distinctId = "anonymous-session"): {
    provider: FeatureFlagProvider;
    distinctId: string;
    flags: Record<string, boolean>;
    details: Array<FeatureFlagRecord & { activeForActor: boolean; bucket: number }>;
  } {
    const flagsMap: Record<string, boolean> = {};
    const details: Array<FeatureFlagRecord & { activeForActor: boolean; bucket: number }> = [];

    for (const record of this.flags.values()) {
      const evaluation = this.evaluateFlag(record.key, distinctId);
      flagsMap[record.key] = evaluation.enabled;
      details.push({
        ...record,
        activeForActor: evaluation.enabled,
        bucket: evaluation.bucket,
      });
    }

    return {
      provider: this.getProviderConfig().provider,
      distinctId,
      flags: flagsMap,
      details,
    };
  }

  public isPhaseEnabled(phaseNumber: number, distinctId = "system"): boolean {
    const key = PHASE_FLAG_KEYS[phaseNumber];
    if (!key) return true;
    return this.evaluateFlag(key, distinctId).enabled;
  }

  public listAllFlags(): FeatureFlagRecord[] {
    return Array.from(this.flags.values());
  }

  public getAuditTrail(): FeatureFlagAuditEvent[] {
    return [...this.auditTrail];
  }

  public async setFlagToggle(
    flagKey: string,
    enabled: boolean,
    actor: string
  ): Promise<FeatureFlagRecord | null> {
    const record = this.flags.get(flagKey);
    if (!record) return null;

    const prevEnabled = record.enabled;
    const prevPct = record.rolloutPercentage;

    record.enabled = enabled;
    if (enabled && record.rolloutPercentage === 0) {
      record.rolloutPercentage = 100;
      record.canaryStage = "ga_100pct";
    }
    if (!enabled) {
      record.rolloutPercentage = 0;
      record.canaryStage = "rollback_0pct";
      record.rollbackCount += 1;
    }
    record.lastToggledAt = new Date().toISOString();
    record.lastToggledBy = actor;

    const providerSynced = await this.syncUpstreamProvider(record);
    this.auditTrail.unshift({
      id: `ff-aud-${Date.now()}`,
      timestamp: record.lastToggledAt,
      flagKey,
      action: enabled ? "toggle_on" : "toggle_off",
      actor,
      previousPercentage: prevPct,
      newPercentage: record.rolloutPercentage,
      previousEnabled: prevEnabled,
      newEnabled: record.enabled,
      providerSynced,
    });
    if (this.auditTrail.length > 100) this.auditTrail.length = 100;
    this.persistToDisk();
    return record;
  }

  public async setCanaryStage(
    flagKey: string,
    stage: "5pct" | "25pct" | "100pct" | "rollback",
    actor: string,
    hoursElapsed?: number
  ): Promise<FeatureFlagRecord | null> {
    const record = this.flags.get(flagKey);
    if (!record) return null;

    const prevEnabled = record.enabled;
    const prevPct = record.rolloutPercentage;

    let targetStage: CanaryStage;
    let targetPct: number;
    let targetEnabled: boolean;

    if (typeof hoursElapsed === "number" && Number.isFinite(hoursElapsed)) {
      const resolved = resolve24hCanaryPercentage(hoursElapsed);
      targetStage = resolved.stage;
      targetPct = resolved.percentage;
      targetEnabled = true;
    } else if (stage === "5pct") {
      targetStage = "canary_5pct";
      targetPct = 5;
      targetEnabled = true;
    } else if (stage === "25pct") {
      targetStage = "canary_25pct";
      targetPct = 25;
      targetEnabled = true;
    } else if (stage === "100pct") {
      targetStage = "ga_100pct";
      targetPct = 100;
      targetEnabled = true;
    } else {
      targetStage = "rollback_0pct";
      targetPct = 0;
      targetEnabled = false;
      record.rollbackCount += 1;
    }

    record.enabled = targetEnabled;
    record.rolloutPercentage = targetPct;
    record.canaryStage = targetStage;
    if (targetStage === "canary_5pct" || !record.canaryStartedAt) {
      record.canaryStartedAt = new Date().toISOString();
    }
    record.lastToggledAt = new Date().toISOString();
    record.lastToggledBy = actor;

    const providerSynced = await this.syncUpstreamProvider(record);
    this.auditTrail.unshift({
      id: `ff-aud-${Date.now()}`,
      timestamp: record.lastToggledAt,
      flagKey,
      action: stage === "rollback" ? "instant_rollback" : "canary_stage_changed",
      actor,
      previousPercentage: prevPct,
      newPercentage: targetPct,
      previousEnabled: prevEnabled,
      newEnabled: targetEnabled,
      providerSynced,
    });
    if (this.auditTrail.length > 100) this.auditTrail.length = 100;
    this.persistToDisk();
    return record;
  }

  public simulateCanaryCohort(flagKey: string, sampleSize = 100): {
    flagKey: string;
    rolloutPercentage: number;
    enabled: boolean;
    sampleSize: number;
    enabledCount: number;
    observedPct: number;
  } {
    const flag = this.flags.get(flagKey);
    let enabledCount = 0;
    for (let i = 0; i < sampleSize; i += 1) {
      const evalRes = this.evaluateFlag(flagKey, `canary-user-${i}`);
      if (evalRes.enabled) enabledCount += 1;
    }
    return {
      flagKey,
      rolloutPercentage: flag?.rolloutPercentage ?? 0,
      enabled: flag?.enabled ?? false,
      sampleSize,
      enabledCount,
      observedPct: Math.round((enabledCount / Math.max(1, sampleSize)) * 1000) / 10,
    };
  }
}
