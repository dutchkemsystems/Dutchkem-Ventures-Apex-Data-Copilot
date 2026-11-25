import crypto from "node:crypto";
import type {
  CertificationCurrency,
  CoachAudioFileReport,
  CoachIssueItem,
  CoachModality,
  CoachPreflightReport,
  CoachProSubscription,
} from "../types/tenant.js";

export const COACH_PRO_MONTHLY_USD = 19;

export function computeCoachProCurrencyAmount(
  usdAmount: number,
  currency: CertificationCurrency
): number {
  if (currency === "NGN") return Math.round(usdAmount * 1530);
  if (currency === "GBP") return Math.round(usdAmount * 0.79 * 100) / 100;
  return Math.round(usdAmount * 100) / 100;
}

export class AiCoachService {
  private readonly subscriptionsByUser = new Map<string, CoachProSubscription>();
  private readonly runsByUser = new Map<string, CoachPreflightReport[]>();

  constructor() {
    this.seedInitialState();
  }

  private seedInitialState(): void {
    // Seed Elena Rostova as an active Coach Pro member; keep Mateo/Hendrik/Claire/Kenji gated ($19/mo) by default.
    const now = Date.now();
    const startIso = new Date(now - 5 * 86400_000).toISOString();
    const endIso = new Date(now + 25 * 86400_000).toISOString();

    const seedSub: CoachProSubscription = {
      id: "csub-seed-elena-01",
      user_id: "11111111-1111-4111-8111-000000000002",
      org_id: "8a1f3c20-4b11-4d9a-9f12-000000000001",
      full_name: "Elena Rostova",
      email: "elena.rostova@dutchkemventures.com",
      tier_name: "coach_pro",
      tier_label: "Coach Pro",
      monthly_price_usd: COACH_PRO_MONTHLY_USD,
      currency: "USD",
      charge_amount: COACH_PRO_MONTHLY_USD,
      kora_reference: "kora_coachpro_seed_elena",
      kora_subscription_code: "SUB_COACH_PRO_ELENA_01",
      status: "active",
      current_period_start: startIso,
      current_period_end: endIso,
      created_at: startIso,
    };
    this.subscriptionsByUser.set(seedSub.user_id, seedSub);
  }

  public getSubscriptionForUser(userId: string): CoachProSubscription | null {
    return this.subscriptionsByUser.get(userId) || null;
  }

  public isActiveSubscription(sub: CoachProSubscription | null): boolean {
    if (!sub) return false;
    if (sub.status !== "active") return false;
    if (!sub.current_period_end) return false;
    return Date.parse(sub.current_period_end) > Date.now();
  }

  /**
   * Fail-closed Coach Pro gate: denies AI Coach usage unless user holds active $19/mo Coach Pro tier.
   */
  public requireActiveSubscription(userId: string):
    | { ok: true; subscription: CoachProSubscription }
    | { ok: false; status: number; code: string; detail: string } {
    const sub = this.getSubscriptionForUser(userId);
    if (!this.isActiveSubscription(sub)) {
      return {
        ok: false,
        status: 402,
        code: "COACH_PRO_REQUIRED",
        detail:
          'Active "$19/month Coach Pro" subscription required before running pre-flight AI Coach QA checks.',
      };
    }
    return { ok: true, subscription: sub as CoachProSubscription };
  }

  public initializeSubscriptionCheckout(params: {
    userId: string;
    orgId: string;
    fullName: string;
    email: string;
    currency: CertificationCurrency;
  }): CoachProSubscription {
    const existing = this.getSubscriptionForUser(params.userId);
    if (this.isActiveSubscription(existing)) {
      return existing as CoachProSubscription;
    }

    const chargeAmount = computeCoachProCurrencyAmount(
      COACH_PRO_MONTHLY_USD,
      params.currency
    );
    const sub: CoachProSubscription = {
      id: `csub-${crypto.randomUUID().slice(0, 10)}`,
      user_id: params.userId,
      org_id: params.orgId,
      full_name: params.fullName,
      email: params.email,
      tier_name: "coach_pro",
      tier_label: "Coach Pro",
      monthly_price_usd: COACH_PRO_MONTHLY_USD,
      currency: params.currency,
      charge_amount: chargeAmount,
      kora_reference: `kora_coachpro_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      kora_subscription_code: null,
      status: "pending",
      current_period_start: null,
      current_period_end: null,
      created_at: new Date().toISOString(),
    };
    this.subscriptionsByUser.set(params.userId, sub);
    return sub;
  }

  public findSubscriptionByReference(reference: string): CoachProSubscription | null {
    for (const sub of this.subscriptionsByUser.values()) {
      if (sub.kora_reference === reference) return sub;
    }
    return null;
  }

  public activateSubscription(reference: string): CoachProSubscription | null {
    const sub = this.findSubscriptionByReference(reference);
    if (!sub) return null;

    const now = Date.now();
    sub.status = "active";
    sub.kora_subscription_code = `SUB_COACH_PRO_${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;
    sub.current_period_start = new Date(now).toISOString();
    sub.current_period_end = new Date(now + 30 * 86400_000).toISOString();
    return sub;
  }

  public cancelSubscription(userId: string): CoachProSubscription | null {
    const sub = this.getSubscriptionForUser(userId);
    if (!sub) return null;
    sub.status = "canceled";
    return sub;
  }

  public listRunsForUser(userId: string): CoachPreflightReport[] {
    return this.runsByUser.get(userId) || [];
  }

  public saveReport(userId: string, report: CoachPreflightReport): CoachPreflightReport {
    const existing = this.runsByUser.get(userId) || [];
    const next = [report, ...existing].slice(0, 20);
    this.runsByUser.set(userId, next);
    return report;
  }

  public buildAudioPreflightReport(params: {
    userId: string;
    orgId: string;
    subscriptionId: string;
    analyzedFiles: CoachAudioFileReport[];
    aiAdviceSummary?: string | null;
  }): CoachPreflightReport {
    const issues: CoachIssueItem[] = [];
    const suggestionsSet = new Set<string>();
    let passedCount = 0;

    params.analyzedFiles.forEach((file, idx) => {
      const label = `Audio ${idx + 1}`;
      let checksPassed = 0;
      const totalChecks = 5;

      if (file.isMono) {
        checksPassed += 1;
      } else {
        issues.push({
          item: `${label} (${file.fileName})`,
          severity: "critical",
          metric: "channels",
          measured: `${file.channels} channels`,
          target: "1 channel (Mono)",
          summary: `${label} fails channel spec (${file.channels}ch stereo detected; export 1ch Mono WAV).`,
        });
        suggestionsSet.add(
          `${label}: Downmix stereo tracks to single-channel Mono PCM WAV before final QA upload.`
        );
      }

      if (file.sampleRateHz === 24000) {
        checksPassed += 1;
      } else {
        issues.push({
          item: `${label} (${file.fileName})`,
          severity: "critical",
          metric: "sample_rate_hz",
          measured: `${file.sampleRateHz} Hz`,
          target: "24000 Hz",
          summary: `${label} fails sample rate (${file.sampleRateHz} Hz vs mandatory 24,000 Hz).`,
        });
        suggestionsSet.add(
          `${label}: Resample WAV to 24,000 Hz PCM (librosa / sox) instead of ${file.sampleRateHz} Hz.`
        );
      }

      if (file.peakDbfs >= -6.0 && file.peakDbfs <= -3.0) {
        checksPassed += 1;
      } else {
        const diff =
          file.peakDbfs > -3.0
            ? Math.round((file.peakDbfs - -3.0) * 10) / 10
            : Math.round((-6.0 - file.peakDbfs) * 10) / 10;
        const direction = file.peakDbfs > -3.0 ? "too hot / near clipping" : "under-modulated";
        issues.push({
          item: `${label} (${file.fileName})`,
          severity: "high",
          metric: "peak_dbfs",
          measured: `${file.peakDbfs} dBFS`,
          target: "-6.0 to -3.0 dBFS",
          summary: `${label} fails peak headroom by ${diff.toFixed(1)} dB (${file.peakDbfs} dBFS, ${direction}).`,
        });
        suggestionsSet.add(
          `${label}: Normalize peak amplitude cleanly into -6.0 dBFS to -3.0 dBFS with a true-peak limiter at -3.2 dBFS.`
        );
      }

      if (file.noiseFloorDbfs < -70.0) {
        checksPassed += 1;
      } else {
        const excessDb = Math.max(0.1, Math.round((file.noiseFloorDbfs - -70.0) * 10) / 10);
        issues.push({
          item: `${label} (${file.fileName})`,
          severity: "critical",
          metric: "noise_floor_dbfs",
          measured: `${file.noiseFloorDbfs} dBFS`,
          target: "< -70.0 dBFS",
          summary: `${label} fails noise floor by ${excessDb.toFixed(1)} dB (${file.noiseFloorDbfs} dBFS vs < -70.0 dBFS ceiling).`,
        });
        suggestionsSet.add(
          `${label}: Enable booth acoustic dampening or apply gentle spectral noise reduction to cut room floor by at least ${Math.ceil(excessDb + 2)} dB.`
        );
      }

      if (file.snrDb > 35.0) {
        checksPassed += 1;
      } else {
        const deficitDb = Math.max(0.1, Math.round((35.0 - file.snrDb) * 10) / 10);
        issues.push({
          item: `${label} (${file.fileName})`,
          severity: "critical",
          metric: "snr_db",
          measured: `${file.snrDb} dB`,
          target: "> 35.0 dB",
          summary: `${label} fails SNR threshold by ${deficitDb.toFixed(1)} dB (${file.snrDb} dB vs > 35.0 dB).`,
        });
        suggestionsSet.add(
          `${label}: Move microphone to 12–15 cm off-axis and silence HVAC/fan hum to raise SNR above 35 dB.`
        );
      }

      file.passed = checksPassed === totalChecks;
      if (file.passed) passedCount += 1;
    });

    // Weight both file pass ratio and individual sub-check completeness for predictive accuracy
    const totalFiles = Math.max(1, params.analyzedFiles.length);
    const totalSubChecks = totalFiles * 5;
    const failedSubChecks = issues.length;
    const subCheckPassRatio = Math.max(0, (totalSubChecks - failedSubChecks) / totalSubChecks);
    const filePassRatio = passedCount / totalFiles;
    const predictedPassRatePct = Math.round((filePassRatio * 0.65 + subCheckPassRatio * 0.35) * 100);

    if (params.aiAdviceSummary) {
      suggestionsSet.add(params.aiAdviceSummary);
    }
    if (suggestionsSet.size === 0) {
      suggestionsSet.add(
        "All submitted audio files meet 24kHz Mono, peak headroom (-6 to -3 dBFS), < -70 dBFS noise floor, and > 35 dB SNR requirements. Ready to submit for live job escrow release."
      );
    }

    const report: CoachPreflightReport = {
      id: `coach-${crypto.randomUUID().slice(0, 10)}`,
      user_id: params.userId,
      org_id: params.orgId,
      subscription_id: params.subscriptionId,
      modality: "audio",
      files_count: totalFiles,
      predicted_pass_rate_pct: predictedPassRatePct,
      verdict: issues.length === 0 ? "ready_for_job" : "needs_remediation",
      issues,
      suggestions: Array.from(suggestionsSet),
      audio_files: params.analyzedFiles,
      created_at: new Date().toISOString(),
    };

    return this.saveReport(params.userId, report);
  }

  public buildVisionPreflightReport(params: {
    userId: string;
    orgId: string;
    subscriptionId: string;
    iouThreshold: number;
    evaluations: Array<{
      index: number;
      boxId: string;
      label: string;
      iou: number;
      flagged: boolean;
      reason: string | null;
    }>;
  }): CoachPreflightReport {
    const issues: CoachIssueItem[] = [];
    const suggestionsSet = new Set<string>();
    const total = Math.max(1, params.evaluations.length);
    let passed = 0;

    for (const ev of params.evaluations) {
      if (!ev.flagged && ev.iou >= params.iouThreshold) {
        passed += 1;
      } else {
        const deficit = Math.max(0.01, Math.round((params.iouThreshold - ev.iou) * 100) / 100);
        issues.push({
          item: `Vision Box ${ev.index} (${ev.label})`,
          severity: "critical",
          metric: "iou",
          measured: `IoU ${ev.iou.toFixed(2)}`,
          target: `IoU >= ${params.iouThreshold.toFixed(2)}`,
          summary:
            ev.reason && !ev.reason.includes("below threshold")
              ? `Box ${ev.index} (${ev.label}) fails: ${ev.reason}`
              : `Box ${ev.index} (${ev.label}) fails YOLOv8 IoU threshold by ${deficit.toFixed(2)} (measured ${ev.iou.toFixed(2)} vs >= ${params.iouThreshold.toFixed(2)}).`,
        });
        suggestionsSet.add(
          `Box ${ev.index} (${ev.label}): Snap bounding edges tightly around occluded corners and verify class label exact match against YOLOv8 reference.`
        );
      }
    }

    if (suggestionsSet.size === 0) {
      suggestionsSet.add(
        `All ${total} bounding boxes exceed YOLOv8 IoU >= ${params.iouThreshold.toFixed(2)}. Ready for live job delivery.`
      );
    }

    const predictedPassRatePct = Math.round((passed / total) * 100);
    const report: CoachPreflightReport = {
      id: `coach-${crypto.randomUUID().slice(0, 10)}`,
      user_id: params.userId,
      org_id: params.orgId,
      subscription_id: params.subscriptionId,
      modality: "vision",
      files_count: total,
      predicted_pass_rate_pct: predictedPassRatePct,
      verdict: issues.length === 0 ? "ready_for_job" : "needs_remediation",
      issues,
      suggestions: Array.from(suggestionsSet),
      created_at: new Date().toISOString(),
    };

    return this.saveReport(params.userId, report);
  }

  public buildTextPreflightReport(params: {
    userId: string;
    orgId: string;
    subscriptionId: string;
    locale: string;
    overallScore: number;
    issues: CoachIssueItem[];
    suggestions: string[];
  }): CoachPreflightReport {
    const predictedPassRatePct = Math.max(0, Math.min(100, Math.round(params.overallScore)));
    const report: CoachPreflightReport = {
      id: `coach-${crypto.randomUUID().slice(0, 10)}`,
      user_id: params.userId,
      org_id: params.orgId,
      subscription_id: params.subscriptionId,
      modality: "text",
      files_count: 1,
      predicted_pass_rate_pct: predictedPassRatePct,
      verdict: params.overallScore >= 80 && params.issues.length === 0 ? "ready_for_job" : "needs_remediation",
      issues: params.issues,
      suggestions: params.suggestions,
      created_at: new Date().toISOString(),
    };

    return this.saveReport(params.userId, report);
  }
}

export function formatAudioCoachDiagnosticLines(
  modality: CoachModality,
  report: CoachPreflightReport
): string {
  return `${modality.toUpperCase()} Pre-flight: ${report.predicted_pass_rate_pct}% predicted pass rate (${report.issues.length} issue${report.issues.length === 1 ? "" : "s"}).`;
}
