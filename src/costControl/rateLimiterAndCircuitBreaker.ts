import crypto from "node:crypto";
import type { SubscriptionTier } from "../types/tenant.js";

export type RateLimitScope = "b2b_api_gateway" | "qa_agent_upload";

export interface RateLimitCheckResult {
  allowed: boolean;
  scope: RateLimitScope;
  limitPerHour: number;
  countInWindow: number;
  remaining: number;
  resetSeconds: number;
  backend: "upstash_redis_rest" | "in_memory_sliding_window";
}

export interface RateLimitAuditEvent {
  id: string;
  org_id: string | null;
  actor_id: string;
  scope: RateLimitScope;
  limit_per_hour: number;
  count_in_window: number;
  blocked: boolean;
  backend: "upstash_redis_rest" | "in_memory_sliding_window";
  created_at: string;
}

export interface AiCostCircuitStatus {
  usageDate: string;
  dailySpendUsd: number;
  dailyLimitUsd: number;
  geminiCallsToday: number;
  circuitTripped: boolean;
  manualPaused: boolean;
  circuitOpen: boolean;
  trippedAt: string | null;
  highTrafficMessage: string;
  backend: "upstash_redis_rest" | "in_memory_sliding_window";
}

export const B2B_API_KEY_HOURLY_LIMIT = Math.max(
  1,
  Number(process.env.RATE_LIMIT_B2B_HOURLY || 1000)
);

export const QA_UPLOAD_TIER_HOURLY_LIMITS: Record<SubscriptionTier, number> = {
  trial: 10,
  starter: 20,
  pro: Math.max(1, Number(process.env.RATE_LIMIT_QA_PRO_HOURLY || 50)),
  agency: 250,
  growth: 250,
  enterprise_whitelabel: 1000,
};

export const HIGH_TRAFFIC_CIRCUIT_MESSAGE =
  "High Traffic: Automated AI QA Agents are temporarily paused due to extraordinary demand. Existing submissions remain safe—please retry shortly.";

export class RateLimiterAndCostBreaker {
  private readonly upstashUrl: string;
  private readonly upstashToken: string;
  private readonly localCounters = new Map<string, { count: number; expiresAtMs: number }>();
  private readonly auditEvents: RateLimitAuditEvent[] = [];

  private usageDate: string = new Date().toISOString().slice(0, 10);
  private dailySpendUsd = 0;
  private geminiCallsToday = 0;
  private dailyLimitUsd = Math.max(
    0.01,
    Number(process.env.AI_DAILY_COST_LIMIT_USD || 100)
  );
  private circuitTripped = false;
  private manualPaused = false;
  private trippedAt: string | null = null;
  private customQaProLimitOverride: number | null = null;

  constructor() {
    const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
    const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
    const validUpstash =
      url.startsWith("https://") &&
      !url.includes("MY_UPSTASH") &&
      token.length > 0 &&
      !token.includes("MY_UPSTASH");
    this.upstashUrl = validUpstash ? url.replace(/\/+$/, "") : "";
    this.upstashToken = validUpstash ? token : "";
  }

  getBackendName(): "upstash_redis_rest" | "in_memory_sliding_window" {
    return this.upstashUrl ? "upstash_redis_rest" : "in_memory_sliding_window";
  }

  getQaHourlyLimitForTier(tier: SubscriptionTier): number {
    if (tier === "pro" && this.customQaProLimitOverride !== null) {
      return this.customQaProLimitOverride;
    }
    return QA_UPLOAD_TIER_HOURLY_LIMITS[tier] ?? 50;
  }

  private rollDateIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.usageDate) {
      this.usageDate = today;
      this.dailySpendUsd = 0;
      this.geminiCallsToday = 0;
      this.circuitTripped = false;
      this.trippedAt = null;
    }
  }

  async checkRateLimit(params: {
    scope: RateLimitScope;
    identifier: string;
    orgId?: string | null;
    limitPerHour: number;
  }): Promise<RateLimitCheckResult> {
    const nowSec = Math.floor(Date.now() / 1000);
    const hourBucket = Math.floor(nowSec / 3600);
    const resetSeconds = Math.max(1, (hourBucket + 1) * 3600 - nowSec);
    const redisKey = `rl:${params.scope}:${params.identifier}:${hourBucket}`;
    const limit = Math.max(1, params.limitPerHour);

    let count = 0;
    let ttlSec = resetSeconds;
    const backend = this.getBackendName();

    if (this.upstashUrl && this.upstashToken) {
      try {
        const res = await fetch(`${this.upstashUrl}/pipeline`, {
          method: "POST",
          signal: AbortSignal.timeout(3000),
          headers: {
            Authorization: `Bearer ${this.upstashToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            ["INCR", redisKey],
            ["EXPIRE", redisKey, 3600],
            ["TTL", redisKey],
          ]),
        });
        if (res.ok) {
          const results = (await res.json()) as Array<{ result?: number }>;
          count = Number(results?.[0]?.result ?? 1);
          const rawTtl = Number(results?.[2]?.result ?? resetSeconds);
          ttlSec = rawTtl > 0 ? rawTtl : resetSeconds;
        } else {
          count = this.incrementLocalCounter(redisKey, resetSeconds);
        }
      } catch {
        count = this.incrementLocalCounter(redisKey, resetSeconds);
      }
    } else {
      count = this.incrementLocalCounter(redisKey, resetSeconds);
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    if (!allowed) {
      this.auditEvents.unshift({
        id: `rl-${crypto.randomUUID().slice(0, 8)}`,
        org_id: params.orgId ?? null,
        actor_id: params.identifier,
        scope: params.scope,
        limit_per_hour: limit,
        count_in_window: count,
        blocked: true,
        backend,
        created_at: new Date().toISOString(),
      });
      if (this.auditEvents.length > 200) this.auditEvents.length = 200;
    }

    return {
      allowed,
      scope: params.scope,
      limitPerHour: limit,
      countInWindow: count,
      remaining,
      resetSeconds: ttlSec,
      backend,
    };
  }

  peekRemaining(params: {
    scope: RateLimitScope;
    identifier: string;
    limitPerHour: number;
  }): { countInWindow: number; remaining: number; limitPerHour: number } {
    const nowSec = Math.floor(Date.now() / 1000);
    const hourBucket = Math.floor(nowSec / 3600);
    const redisKey = `rl:${params.scope}:${params.identifier}:${hourBucket}`;
    const entry = this.localCounters.get(redisKey);
    const count = entry && entry.expiresAtMs > Date.now() ? entry.count : 0;
    return {
      countInWindow: count,
      remaining: Math.max(0, params.limitPerHour - count),
      limitPerHour: params.limitPerHour,
    };
  }

  private incrementLocalCounter(key: string, ttlSeconds: number): number {
    const nowMs = Date.now();
    const existing = this.localCounters.get(key);
    if (!existing || existing.expiresAtMs <= nowMs) {
      this.localCounters.set(key, {
        count: 1,
        expiresAtMs: nowMs + ttlSeconds * 1000,
      });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  recordAiSpend(params: {
    costUsd: number;
    callsCount?: number;
  }): { status: AiCostCircuitStatus; newlyTripped: boolean } {
    this.rollDateIfNeeded();
    const calls = params.callsCount ?? 1;
    const cost = Math.max(0, params.costUsd);
    const wasTripped = this.circuitTripped;

    this.dailySpendUsd = Math.round((this.dailySpendUsd + cost) * 10000) / 10000;
    this.geminiCallsToday += calls;

    if (this.dailySpendUsd >= this.dailyLimitUsd) {
      this.circuitTripped = true;
      if (!this.trippedAt) {
        this.trippedAt = new Date().toISOString();
      }
    }

    if (this.upstashUrl && this.upstashToken && cost > 0) {
      void fetch(`${this.upstashUrl}/pipeline`, {
        method: "POST",
        signal: AbortSignal.timeout(2500),
        headers: {
          Authorization: `Bearer ${this.upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCRBYFLOAT", `ai:cost:daily:${this.usageDate}`, cost],
          ["EXPIRE", `ai:cost:daily:${this.usageDate}`, 172800],
        ]),
      }).catch(() => {});
    }

    return {
      status: this.getCircuitStatus(),
      newlyTripped: !wasTripped && this.circuitTripped,
    };
  }

  getCircuitStatus(): AiCostCircuitStatus {
    this.rollDateIfNeeded();
    return {
      usageDate: this.usageDate,
      dailySpendUsd: this.dailySpendUsd,
      dailyLimitUsd: this.dailyLimitUsd,
      geminiCallsToday: this.geminiCallsToday,
      circuitTripped: this.circuitTripped,
      manualPaused: this.manualPaused,
      circuitOpen: this.circuitTripped || this.manualPaused,
      trippedAt: this.trippedAt,
      highTrafficMessage: HIGH_TRAFFIC_CIRCUIT_MESSAGE,
      backend: this.getBackendName(),
    };
  }

  adminUpdateConfig(input: {
    dailyLimitUsd?: number;
    manualPaused?: boolean;
    resetSpendAndCircuit?: boolean;
    proHourlyLimitOverride?: number | null;
  }): AiCostCircuitStatus {
    this.rollDateIfNeeded();
    if (typeof input.dailyLimitUsd === "number" && Number.isFinite(input.dailyLimitUsd) && input.dailyLimitUsd > 0) {
      this.dailyLimitUsd = Math.round(input.dailyLimitUsd * 100) / 100;
      this.circuitTripped = this.dailySpendUsd >= this.dailyLimitUsd;
      if (!this.circuitTripped) this.trippedAt = null;
    }
    if (typeof input.manualPaused === "boolean") {
      this.manualPaused = input.manualPaused;
    }
    if (input.resetSpendAndCircuit) {
      this.dailySpendUsd = 0;
      this.geminiCallsToday = 0;
      this.circuitTripped = false;
      this.manualPaused = false;
      this.trippedAt = null;
    }
    if (input.proHourlyLimitOverride !== undefined) {
      this.customQaProLimitOverride = input.proHourlyLimitOverride;
    }
    return this.getCircuitStatus();
  }

  getRecentBlockedEvents(limit = 50): RateLimitAuditEvent[] {
    return this.auditEvents.slice(0, limit);
  }
}
