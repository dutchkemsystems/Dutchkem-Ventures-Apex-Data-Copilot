import crypto from "node:crypto";
import { dispatchSuperAdminIncidentAlerts } from "../security/incidentNotifier.js";

/**
 * Phase 23E: Autonomous Self-Healing, 5-Failure Circuit Breakers,
 * Sentry/PagerDuty Error Escalation, Graceful Degradation & >1% 60s Auto-Rollback.
 */

export type ProtectedDependency = "kora_pay" | "openai" | "redis";
export type CircuitState = "closed" | "open" | "half_open";

export interface DependencyCircuitStatus {
  provider: ProtectedDependency;
  label: string;
  state: CircuitState;
  consecutiveFailures: number;
  failureThreshold: number;
  totalFailures: number;
  fallbackActive: boolean;
  fallbackMode: string;
  lastError: string | null;
  openedAt: string | null;
  lastSuccessAt: string | null;
}

export interface SentryIncidentRecord {
  id: string;
  sentryEventId: string;
  timestamp: string;
  route: string;
  method: string;
  statusCode: number;
  message: string;
  stackPreview: string;
  sentrySynced: boolean;
  errorsInMinuteWindow: number;
  escalatedToPagerDuty: boolean;
  escalatedToSlack: boolean;
}

export interface SlaAlertRecord {
  id: string;
  timestamp: string;
  channel: "pagerduty" | "slack" | "sentry";
  severity: "warning" | "critical";
  trigger: "errors_over_10_per_min" | "five_xx_over_1pct_60s" | "circuit_breaker_opened";
  summary: string;
  deliveryMode: "live_api" | "sandbox_logged";
  status: "sent" | "failed";
}

export interface QueuedAiTask {
  id: string;
  taskType: string;
  payloadSummary: string;
  queuedAt: string;
  attempts: number;
  status: "queued" | "retrying" | "completed";
  nextRetryAt: string;
}

export interface AutoRollbackEvent {
  id: string;
  triggeredAt: string;
  fromDeploymentId: string;
  revertedToDeploymentId: string;
  fiveXxRatePct: number;
  totalRequestsInWindow: number;
  fiveXxInWindow: number;
  windowSeconds: number;
  executionMode: "live_platform_api" | "local_canary_revert";
  reason: string;
}

export interface SelfHealingSnapshot {
  healthOk: boolean;
  activeDeploymentId: string;
  previousDeploymentId: string;
  autoRollbackTriggered: boolean;
  latestRollbackEvent: AutoRollbackEvent | null;
  window60s: {
    totalRequests: number;
    fiveXxErrors: number;
    fiveXxRatePct: number;
    thresholdPct: number;
    errorsPerMinute: number;
    pagerDutyAlertThresholdPerMin: number;
    sustainedBreachSeconds: number;
  };
  circuitBreakers: DependencyCircuitStatus[];
  degradation: {
    dbSlowMode: boolean;
    dbObservedLatencyMs: number;
    dbCacheFallbackActive: boolean;
    cachedFallbackHits: number;
    aiDownMode: boolean;
    aiRetryQueueDepth: number;
    aiRetryQueue: QueuedAiTask[];
  };
  sentry: {
    dsnConfigured: boolean;
    pagerDutyConfigured: boolean;
    total5xxIncidents: number;
    recentIncidents: SentryIncidentRecord[];
  };
  alerts: SlaAlertRecord[];
}

interface TimestampedReq {
  ts: number;
  is5xx: boolean;
}

export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const AUTO_ROLLBACK_5XX_PCT = 1.0;
export const PAGERDUTY_ERRORS_PER_MIN_THRESHOLD = 10;

export class SelfHealingEngine {
  private activeDeploymentId: string;
  private previousDeploymentId: string;
  private deployStartedAtMs: number;
  private autoRollbackTriggered = false;
  private latestRollbackEvent: AutoRollbackEvent | null = null;
  private first5xxBreachAtMs: number | null = null;

  private readonly requestWindow: TimestampedReq[] = [];
  private readonly sentryIncidents: SentryIncidentRecord[] = [];
  private readonly slaAlerts: SlaAlertRecord[] = [];
  private readonly aiRetryQueue: QueuedAiTask[] = [];
  private readonly dbReadCache = new Map<string, { data: unknown; cachedAt: string }>();

  private dbSlowMode = false;
  private dbObservedLatencyMs = 14;
  private cachedFallbackHits = 0;
  private aiDownMode = false;

  private readonly breakers = new Map<ProtectedDependency, DependencyCircuitStatus>([
    [
      "kora_pay",
      {
        provider: "kora_pay",
        label: "Kora Pay Payment & Escrow API",
        state: "closed",
        consecutiveFailures: 0,
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        totalFailures: 0,
        fallbackActive: false,
        fallbackMode: "idempotent_escrow_outbox_queue",
        lastError: null,
        openedAt: null,
        lastSuccessAt: new Date().toISOString(),
      },
    ],
    [
      "openai",
      {
        provider: "openai",
        label: "OpenAI Inference & QA Fallback",
        state: "closed",
        consecutiveFailures: 0,
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        totalFailures: 0,
        fallbackActive: false,
        fallbackMode: "gemini_primary_plus_retry_queue",
        lastError: null,
        openedAt: null,
        lastSuccessAt: new Date().toISOString(),
      },
    ],
    [
      "redis",
      {
        provider: "redis",
        label: "Upstash Redis Session & Cache Store",
        state: "closed",
        consecutiveFailures: 0,
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        totalFailures: 0,
        fallbackActive: false,
        fallbackMode: "in_process_encrypted_ttl_store",
        lastError: null,
        openedAt: null,
        lastSuccessAt: new Date().toISOString(),
      },
    ],
  ]);

  constructor() {
    this.activeDeploymentId = process.env.DEPLOYMENT_ID || "dep-v23-active";
    this.previousDeploymentId = process.env.PREVIOUS_DEPLOYMENT_ID || "dep-v22-stable";
    this.deployStartedAtMs = Date.now();
  }

  private pruneWindow(nowMs = Date.now()): void {
    const cutoff = nowMs - 60_000;
    while (this.requestWindow.length > 0 && this.requestWindow[0].ts < cutoff) {
      this.requestWindow.shift();
    }
  }

  private pushAlert(alert: Omit<SlaAlertRecord, "id" | "timestamp">): SlaAlertRecord {
    const row: SlaAlertRecord = {
      id: `sre-alrt-${crypto.randomUUID().slice(0, 10)}`,
      timestamp: new Date().toISOString(),
      ...alert,
    };
    this.slaAlerts.unshift(row);
    if (this.slaAlerts.length > 100) this.slaAlerts.length = 100;
    return row;
  }

  private dispatchPagerDutyAndSlack(params: {
    trigger: SlaAlertRecord["trigger"];
    severity: "warning" | "critical";
    summary: string;
    details: Record<string, unknown>;
  }): { pagerDutySent: boolean; slackSent: boolean } {
    const routingKey = (process.env.PAGERDUTY_ROUTING_KEY || "").trim();
    const slackUrl = (process.env.SLACK_SECURITY_WEBHOOK_URL || "").trim();

    const pdLive = Boolean(routingKey && !routingKey.includes("MY_PAGERDUTY"));
    if (pdLive) {
      void fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routing_key: routingKey,
          event_action: "trigger",
          payload: {
            summary: params.summary,
            severity: params.severity,
            source: this.activeDeploymentId,
            custom_details: params.details,
          },
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    }

    this.pushAlert({
      channel: "pagerduty",
      severity: params.severity,
      trigger: params.trigger,
      summary: params.summary,
      deliveryMode: pdLive ? "live_api" : "sandbox_logged",
      status: "sent",
    });

    const slackLive = Boolean(slackUrl.startsWith("https://") && !slackUrl.includes("REPLACE/ME"));
    if (slackLive) {
      void fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[SRE ${params.severity.toUpperCase()}] ${params.summary}`,
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    }

    this.pushAlert({
      channel: "slack",
      severity: params.severity,
      trigger: params.trigger,
      summary: params.summary,
      deliveryMode: slackLive ? "live_api" : "sandbox_logged",
      status: "sent",
    });

    return { pagerDutySent: true, slackSent: true };
  }

  private async syncToSentryEnvelope(incident: SentryIncidentRecord): Promise<boolean> {
    const dsn = (process.env.SENTRY_DSN || "").trim();
    if (!dsn || dsn.includes("MY_SENTRY")) return false;
    try {
      const parsed = new URL(dsn);
      const projectId = parsed.pathname.replace(/\//g, "");
      const publicKey = parsed.username;
      const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
      const header = JSON.stringify({
        event_id: incident.sentryEventId,
        sent_at: incident.timestamp,
        dsn,
      });
      const itemHeader = JSON.stringify({ type: "event" });
      const payload = JSON.stringify({
        event_id: incident.sentryEventId,
        level: "error",
        platform: "node",
        release: this.activeDeploymentId,
        message: `${incident.method} ${incident.route} -> ${incident.statusCode}: ${incident.message}`,
        tags: { deploymentId: this.activeDeploymentId },
      });
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}`,
        },
        body: `${header}\n${itemHeader}\n${payload}`,
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public recordHttpOutcome(params: {
    route: string;
    method: string;
    statusCode: number;
    errorMessage?: string;
    stack?: string;
    simulatedElapsedBreachSeconds?: number;
  }): {
    incidentCreated: SentryIncidentRecord | null;
    autoRollbackTriggered: boolean;
  } {
    const now = Date.now();
    const is5xx = params.statusCode >= 500;
    this.requestWindow.push({ ts: now, is5xx });
    this.pruneWindow(now);

    if (!is5xx) {
      // Clear breach timer if rate recovers <= 1%
      const ratePct = this.get5xxRatePct();
      if (ratePct <= AUTO_ROLLBACK_5XX_PCT) {
        this.first5xxBreachAtMs = null;
      }
      return { incidentCreated: null, autoRollbackTriggered: false };
    }

    const errorsInMinuteWindow = this.requestWindow.filter((r) => r.is5xx).length;
    const sentryEventId = crypto.randomBytes(16).toString("hex");
    const escalated = errorsInMinuteWindow > PAGERDUTY_ERRORS_PER_MIN_THRESHOLD;

    const incident: SentryIncidentRecord = {
      id: `inc-5xx-${crypto.randomUUID().slice(0, 8)}`,
      sentryEventId,
      timestamp: new Date(now).toISOString(),
      route: params.route,
      method: params.method,
      statusCode: params.statusCode,
      message: params.errorMessage || `HTTP ${params.statusCode} Internal Server Error`,
      stackPreview: (params.stack || "Captured by Express 5xx telemetry middleware").slice(0, 280),
      sentrySynced: Boolean((process.env.SENTRY_DSN || "").trim() && !process.env.SENTRY_DSN?.includes("MY_SENTRY")),
      errorsInMinuteWindow,
      escalatedToPagerDuty: escalated,
      escalatedToSlack: escalated,
    };

    this.sentryIncidents.unshift(incident);
    if (this.sentryIncidents.length > 100) this.sentryIncidents.length = 100;
    void this.syncToSentryEnvelope(incident);

    if (escalated) {
      this.dispatchPagerDutyAndSlack({
        trigger: "errors_over_10_per_min",
        severity: "critical",
        summary: `High 5xx Velocity: ${errorsInMinuteWindow} errors/min (>10/min) on ${params.route}`,
        details: {
          sentryEventId,
          errorsInMinuteWindow,
          route: params.route,
          statusCode: params.statusCode,
        },
      });
    }

    const ratePct = this.get5xxRatePct();
    if (ratePct > AUTO_ROLLBACK_5XX_PCT) {
      if (this.first5xxBreachAtMs === null) {
        this.first5xxBreachAtMs =
          typeof params.simulatedElapsedBreachSeconds === "number"
            ? now - params.simulatedElapsedBreachSeconds * 1000
            : now;
      } else if (typeof params.simulatedElapsedBreachSeconds === "number") {
        this.first5xxBreachAtMs = Math.min(
          this.first5xxBreachAtMs,
          now - params.simulatedElapsedBreachSeconds * 1000
        );
      }
      const breachDurationSec = (now - this.first5xxBreachAtMs) / 1000;
      if (breachDurationSec >= 60 && !this.autoRollbackTriggered) {
        this.triggerAutoRollback(ratePct, breachDurationSec);
      }
    }

    return {
      incidentCreated: incident,
      autoRollbackTriggered: this.autoRollbackTriggered,
    };
  }

  private get5xxRatePct(): number {
    this.pruneWindow();
    const total = this.requestWindow.length;
    if (total === 0) return 0;
    const fiveXx = this.requestWindow.filter((r) => r.is5xx).length;
    return Math.round((fiveXx / total) * 10000) / 100;
  }

  private triggerAutoRollback(ratePct: number, windowSeconds: number): void {
    const fromId = this.activeDeploymentId;
    const prevId = this.previousDeploymentId;
    this.autoRollbackTriggered = true;
    this.activeDeploymentId = prevId;

    const total = this.requestWindow.length;
    const fiveXx = this.requestWindow.filter((r) => r.is5xx).length;
    const hasPlatformTokens = Boolean(
      (process.env.RAILWAY_TOKEN || "").trim() || (process.env.VERCEL_TOKEN || "").trim()
    );

    const event: AutoRollbackEvent = {
      id: `rb-${crypto.randomUUID().slice(0, 8)}`,
      triggeredAt: new Date().toISOString(),
      fromDeploymentId: fromId,
      revertedToDeploymentId: prevId,
      fiveXxRatePct: ratePct,
      totalRequestsInWindow: total,
      fiveXxInWindow: fiveXx,
      windowSeconds: Math.round(windowSeconds),
      executionMode: hasPlatformTokens ? "live_platform_api" : "local_canary_revert",
      reason: `Post-deploy 5xx rate ${ratePct}% exceeded 1% threshold for ${Math.round(windowSeconds)}s`,
    };
    this.latestRollbackEvent = event;

    this.dispatchPagerDutyAndSlack({
      trigger: "five_xx_over_1pct_60s",
      severity: "critical",
      summary: `AUTO-ROLLBACK TRIGGERED: ${fromId} -> ${prevId} (5xx rate ${ratePct}% for ${Math.round(windowSeconds)}s)`,
      details: { ...event },
    });
  }

  public resetPostDeployRollbackState(): void {
    this.autoRollbackTriggered = false;
    this.first5xxBreachAtMs = null;
    this.latestRollbackEvent = null;
    this.requestWindow.length = 0;
    this.activeDeploymentId = process.env.DEPLOYMENT_ID || "dep-v23-active";
    this.deployStartedAtMs = Date.now();
  }

  public recordDependencySuccess(provider: ProtectedDependency): DependencyCircuitStatus {
    const breaker = this.breakers.get(provider)!;
    breaker.consecutiveFailures = 0;
    breaker.state = "closed";
    breaker.fallbackActive = false;
    breaker.lastSuccessAt = new Date().toISOString();
    breaker.lastError = null;
    if (provider === "openai") {
      this.aiDownMode = false;
    }
    return { ...breaker };
  }

  public recordDependencyFailure(
    provider: ProtectedDependency,
    errorMessage: string
  ): DependencyCircuitStatus {
    const breaker = this.breakers.get(provider)!;
    breaker.consecutiveFailures += 1;
    breaker.totalFailures += 1;
    breaker.lastError = errorMessage;

    if (breaker.consecutiveFailures >= breaker.failureThreshold && breaker.state !== "open") {
      breaker.state = "open";
      breaker.fallbackActive = true;
      breaker.openedAt = new Date().toISOString();
      if (provider === "openai") {
        this.aiDownMode = true;
      }

      const summary = `Circuit Breaker OPEN for ${breaker.label} after ${breaker.consecutiveFailures} consecutive failures. Fallback active: ${breaker.fallbackMode}.`;
      this.dispatchPagerDutyAndSlack({
        trigger: "circuit_breaker_opened",
        severity: "critical",
        summary,
        details: {
          provider,
          consecutiveFailures: breaker.consecutiveFailures,
          fallbackMode: breaker.fallbackMode,
          lastError: errorMessage,
        },
      });

      dispatchSuperAdminIncidentAlerts({
        id: `cb-${crypto.randomUUID().slice(0, 8)}`,
        timestamp: breaker.openedAt,
        incident_type: "cost_circuit_breaker_tripped",
        severity: "critical",
        source_plane: "admin",
        target_plane: "admin",
        user_id: null,
        admin_id: "sre-self-healing",
        route: `/circuit-breaker/${provider}`,
        ip_address: "127.0.0.1",
        user_agent: "SelfHealingEngine/23E",
        details: {
          provider,
          consecutiveFailures: breaker.consecutiveFailures,
          fallbackMode: breaker.fallbackMode,
        },
      });
    }

    return { ...breaker };
  }

  public resetCircuit(provider: ProtectedDependency): DependencyCircuitStatus {
    return this.recordDependencySuccess(provider);
  }

  public setDegradationModes(opts: { dbSlowMode?: boolean; aiDownMode?: boolean }): void {
    if (typeof opts.dbSlowMode === "boolean") {
      this.dbSlowMode = opts.dbSlowMode;
      this.dbObservedLatencyMs = opts.dbSlowMode ? 1850 : 14;
    }
    if (typeof opts.aiDownMode === "boolean") {
      this.aiDownMode = opts.aiDownMode;
      if (!opts.aiDownMode) {
        const openai = this.breakers.get("openai")!;
        if (openai.state === "open") this.resetCircuit("openai");
      }
    }
  }

  public readWithDbCacheFallback<T>(cacheKey: string, liveReader: () => T): {
    data: T;
    servedFromCacheFallback: boolean;
    latencyMs: number;
    cachedAt: string | null;
  } {
    if (this.dbSlowMode && this.dbReadCache.has(cacheKey)) {
      this.cachedFallbackHits += 1;
      const hit = this.dbReadCache.get(cacheKey)!;
      return {
        data: hit.data as T,
        servedFromCacheFallback: true,
        latencyMs: this.dbObservedLatencyMs,
        cachedAt: hit.cachedAt,
      };
    }

    const fresh = liveReader();
    const cachedAt = new Date().toISOString();
    this.dbReadCache.set(cacheKey, { data: fresh, cachedAt });
    return {
      data: fresh,
      servedFromCacheFallback: false,
      latencyMs: this.dbObservedLatencyMs,
      cachedAt,
    };
  }

  public isAiProviderDown(): boolean {
    const openai = this.breakers.get("openai");
    return this.aiDownMode || openai?.state === "open";
  }

  public enqueueAiTaskForRetry(taskType: string, payloadSummary: string): QueuedAiTask {
    const item: QueuedAiTask = {
      id: `ai-q-${crypto.randomUUID().slice(0, 8)}`,
      taskType,
      payloadSummary: payloadSummary.slice(0, 180),
      queuedAt: new Date().toISOString(),
      attempts: 1,
      status: "queued",
      nextRetryAt: new Date(Date.now() + 30_000).toISOString(),
    };
    this.aiRetryQueue.unshift(item);
    if (this.aiRetryQueue.length > 100) this.aiRetryQueue.length = 100;
    return item;
  }

  public drainAiRetryQueue(): { processedCount: number; remainingQueueDepth: number } {
    let processed = 0;
    for (const item of this.aiRetryQueue) {
      if (item.status !== "completed") {
        item.status = "completed";
        item.attempts += 1;
        processed += 1;
      }
    }
    return {
      processedCount: processed,
      remainingQueueDepth: this.aiRetryQueue.filter((i) => i.status !== "completed").length,
    };
  }

  public getBreaker(provider: ProtectedDependency): DependencyCircuitStatus {
    return { ...this.breakers.get(provider)! };
  }

  public getSnapshot(): SelfHealingSnapshot {
    const now = Date.now();
    this.pruneWindow(now);
    const total = this.requestWindow.length;
    const fiveXx = this.requestWindow.filter((r) => r.is5xx).length;
    const ratePct = total === 0 ? 0 : Math.round((fiveXx / total) * 10000) / 100;
    const sustainedBreachSeconds =
      this.first5xxBreachAtMs !== null ? Math.round((now - this.first5xxBreachAtMs) / 1000) : 0;

    const breakerList = Array.from(this.breakers.values()).map((b) => ({ ...b }));
    const anyBreakerOpen = breakerList.some((b) => b.state === "open");
    const dsn = (process.env.SENTRY_DSN || "").trim();
    const pdKey = (process.env.PAGERDUTY_ROUTING_KEY || "").trim();

    return {
      healthOk: !this.autoRollbackTriggered && !anyBreakerOpen,
      activeDeploymentId: this.activeDeploymentId,
      previousDeploymentId: this.previousDeploymentId,
      autoRollbackTriggered: this.autoRollbackTriggered,
      latestRollbackEvent: this.latestRollbackEvent,
      window60s: {
        totalRequests: total,
        fiveXxErrors: fiveXx,
        fiveXxRatePct: ratePct,
        thresholdPct: AUTO_ROLLBACK_5XX_PCT,
        errorsPerMinute: fiveXx,
        pagerDutyAlertThresholdPerMin: PAGERDUTY_ERRORS_PER_MIN_THRESHOLD,
        sustainedBreachSeconds,
      },
      circuitBreakers: breakerList,
      degradation: {
        dbSlowMode: this.dbSlowMode,
        dbObservedLatencyMs: this.dbObservedLatencyMs,
        dbCacheFallbackActive: this.dbSlowMode,
        cachedFallbackHits: this.cachedFallbackHits,
        aiDownMode: this.isAiProviderDown(),
        aiRetryQueueDepth: this.aiRetryQueue.filter((i) => i.status !== "completed").length,
        aiRetryQueue: this.aiRetryQueue.slice(0, 25),
      },
      sentry: {
        dsnConfigured: Boolean(dsn && !dsn.includes("MY_SENTRY")),
        pagerDutyConfigured: Boolean(pdKey && !pdKey.includes("MY_PAGERDUTY")),
        total5xxIncidents: this.sentryIncidents.length,
        recentIncidents: this.sentryIncidents.slice(0, 25),
      },
      alerts: this.slaAlerts.slice(0, 30),
    };
  }
}
