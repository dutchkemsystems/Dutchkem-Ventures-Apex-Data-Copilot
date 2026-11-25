import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileDown,
  Flame,
  Gauge,
  Globe,
  RefreshCw,
  Sliders,
  TrendingUp,
} from "lucide-react";
import type {
  AdminInsightsOverview,
  SurgePricingConfig,
} from "../types/tenant";

interface DynamicPricingInsightsViewProps {
  orgId: string;
  orgName: string;
  userId: string;
}

export function DynamicPricingInsightsView({
  orgId,
  orgName,
  userId,
}: DynamicPricingInsightsViewProps) {
  const [surgePricing, setSurgePricing] = useState<SurgePricingConfig | null>(null);
  const [insights, setInsights] = useState<AdminInsightsOverview | null>(null);
  const [audioMult, setAudioMult] = useState<number>(1.0);
  const [visionMult, setVisionMult] = useState<number>(1.0);
  const [textMult, setTextMult] = useState<number>(1.0);
  const [autoLanguageSurge, setAutoLanguageSurge] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/insights/overview", {
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || "Unable to load admin insights.");
      }
      setSurgePricing(body.surgePricing);
      setInsights(body.insights);
      setAudioMult(body.surgePricing.audio_qa_multiplier);
      setVisionMult(body.surgePricing.vision_qa_multiplier);
      setTextMult(body.surgePricing.text_qa_multiplier);
      setAutoLanguageSurge(body.surgePricing.auto_language_surge_enabled);
    } catch (err) {
      setStatusBanner({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to fetch anonymized insights.",
      });
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSaveMultipliers(overrides?: {
    audio?: number;
    vision?: number;
    text?: number;
    autoLang?: boolean;
    localeUpdate?: {
      locale: string;
      activeJobsCount?: number;
      multiplier?: number;
    };
  }) {
    setSaving(true);
    setStatusBanner(null);
    const nextAudio = overrides?.audio ?? audioMult;
    const nextVision = overrides?.vision ?? visionMult;
    const nextText = overrides?.text ?? textMult;
    const nextAuto = overrides?.autoLang ?? autoLanguageSurge;

    try {
      const res = await fetch("/api/admin/pricing/surge", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          audio_qa_multiplier: nextAudio,
          vision_qa_multiplier: nextVision,
          text_qa_multiplier: nextText,
          auto_language_surge_enabled: nextAuto,
          localeUpdate: overrides?.localeUpdate,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || "Failed to update surge pricing multipliers.");
      }
      setSurgePricing(body.surgePricing);
      setInsights(body.insights);
      setAudioMult(body.surgePricing.audio_qa_multiplier);
      setVisionMult(body.surgePricing.vision_qa_multiplier);
      setTextMult(body.surgePricing.text_qa_multiplier);
      setAutoLanguageSurge(body.surgePricing.auto_language_surge_enabled);
      setStatusBanner({
        tone: "success",
        text: `Applied dynamic Kora Pay QA pricing: Audio ${body.surgePricing.audio_qa_multiplier.toFixed(2)}x ($${body.surgePricing.effectiveRatesUsd.audio.toFixed(2)}/call), Vision ${body.surgePricing.vision_qa_multiplier.toFixed(2)}x ($${body.surgePricing.effectiveRatesUsd.vision.toFixed(2)}/call), Text ${body.surgePricing.text_qa_multiplier.toFixed(2)}x ($${body.surgePricing.effectiveRatesUsd.text.toFixed(2)}/call).`,
      });
    } catch (err) {
      setStatusBanner({
        tone: "error",
        text: err instanceof Error ? err.message : "Surge pricing update failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/admin/insights/report.pdf", {
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to generate PDF report.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "dutchkem-qa-market-intelligence-report.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatusBanner({
        tone: "success",
        text: "Exported commercial QA Market Intelligence PDF (dutchkem-qa-market-intelligence-report.pdf).",
      });
    } catch (err) {
      setStatusBanner({
        tone: "error",
        text: err instanceof Error ? err.message : "PDF export failed.",
      });
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="border-b border-slate-200/80 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            Phase 17 · Admin-Only Dynamic Surge Pricing &amp; Market Intelligence
          </p>
          <h1 className="mt-1 text-2xl 2xl:text-3xl font-bold tracking-tight text-slate-950">
            Dynamic QA Pricing &amp; Anonymized Data Insights
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Configure live QA module surge multipliers for{" "}
            <span className="font-semibold text-slate-900">{orgName}</span> Kora Pay API billing,
            track high-demand speech locales, and export anonymized corpus reports for AI labs and
            audio hardware OEMs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Insights</span>
          </button>

          <button
            type="button"
            disabled={exportingPdf || loading}
            onClick={() => void handleExportPdf()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-950 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>{exportingPdf ? "Generating PDF..." : "Export PDF Report"}</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium ${
            statusBanner.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {statusBanner.text}
        </div>
      )}

      {/* 4 Executive Anonymized Telemetry KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Audio Hours Processed</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-slate-950">
            {loading ? "—" : insights?.totalAudioHoursProcessed.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Anonymized 24kHz mono WAV corpus
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Top Failed QA Check</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-3 text-lg font-bold text-amber-700 leading-snug">
            {loading ? "—" : insights?.topFailedQaCheck}
          </p>
          <p className="mt-1 text-xs font-mono tabular-nums text-slate-500">
            {insights?.topFailedCheckRatePct ?? 0}% of total flagged defects
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Global Anonymized QA Pass Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-emerald-700">
            {loading ? "—" : `${insights?.globalQaPassRatePct ?? 0}%`}
          </p>
          <p className="mt-1 text-xs font-mono tabular-nums text-slate-500">
            Across {insights?.totalEvaluationsAcrossModules.toLocaleString() ?? 0} total audits
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Monthly Surge Revenue Uplift</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-blue-700">
            +${loading ? "0" : (insights?.surgeRevenueUpliftMonthlyUsd ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Kora Pay metered settlement uplift ({insights?.activeSurgeLanguagesCount ?? 0} active
            surge locales)
          </p>
        </div>
      </section>

      {/* Surge Pricing Controls Panel */}
      <section className="p-6 rounded-2xl border border-slate-200/80 bg-white space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-950 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Dynamic Surge Pricing Multipliers (B2B Kora Pay API)</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Base rate is <span className="font-mono font-semibold">$0.10 / call</span>. Applying{" "}
              <span className="font-mono font-semibold text-blue-700">
                audio_qa_multiplier = 2.0
              </span>{" "}
              adjusts every live <span className="font-mono">/api/v1/qa/audio</span> metered call
              to <span className="font-mono font-semibold">$0.20</span> immediately.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoLanguageSurge}
              onChange={(e) => {
                const next = e.target.checked;
                setAutoLanguageSurge(next);
                void handleSaveMultipliers({ autoLang: next });
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Auto-Surge High-Demand Languages</span>
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Audio Multiplier */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">audio_qa_multiplier</span>
              <span className="font-mono text-sm font-bold text-blue-700 tabular-nums">
                {audioMult.toFixed(2)}x · ${(0.1 * audioMult).toFixed(2)}/call
              </span>
            </div>
            <input
              aria-label="Audio QA Multiplier"
              type="range"
              min="0.5"
              max="5.0"
              step="0.25"
              value={audioMult}
              onChange={(e) => setAudioMult(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex items-center gap-2">
              {[1.0, 1.5, 2.0, 3.0].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAudioMult(preset);
                    void handleSaveMultipliers({ audio: preset });
                  }}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded border transition-colors ${
                    audioMult === preset
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-blue-400"
                  }`}
                >
                  {preset.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>

          {/* Vision Multiplier */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">vision_qa_multiplier</span>
              <span className="font-mono text-sm font-bold text-indigo-700 tabular-nums">
                {visionMult.toFixed(2)}x · ${(0.1 * visionMult).toFixed(2)}/call
              </span>
            </div>
            <input
              aria-label="Vision QA Multiplier"
              type="range"
              min="0.5"
              max="5.0"
              step="0.25"
              value={visionMult}
              onChange={(e) => setVisionMult(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex items-center gap-2">
              {[1.0, 1.25, 1.5, 2.0].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setVisionMult(preset);
                    void handleSaveMultipliers({ vision: preset });
                  }}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded border transition-colors ${
                    visionMult === preset
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-indigo-400"
                  }`}
                >
                  {preset.toFixed(2)}x
                </button>
              ))}
            </div>
          </div>

          {/* Text Multiplier */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">text_qa_multiplier</span>
              <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                {textMult.toFixed(2)}x · ${(0.1 * textMult).toFixed(2)}/call
              </span>
            </div>
            <input
              aria-label="Text QA Multiplier"
              type="range"
              min="0.5"
              max="5.0"
              step="0.25"
              value={textMult}
              onChange={(e) => setTextMult(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
            <div className="flex items-center gap-2">
              {[1.0, 1.25, 1.5, 2.0].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setTextMult(preset);
                    void handleSaveMultipliers({ text: preset });
                  }}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded border transition-colors ${
                    textMult === preset
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400"
                  }`}
                >
                  {preset.toFixed(2)}x
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-500">
            Last updated by{" "}
            <span className="font-semibold text-slate-800">
              {surgePricing?.updatedBy ?? "Admin"}
            </span>
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveMultipliers()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white hover:from-blue-700 hover:to-sky-700 disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
          >
            {saving ? "Applying..." : "Save & Apply Surge Multipliers"}
          </button>
        </div>
      </section>

      {/* Two-Column Intelligence Grid: Failure Telemetry & Language Surge Matrix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Anonymized Failure Telemetry */}
        <section className="xl:col-span-5 rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Anonymized Failure Telemetry</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">Cross-Tenant Aggregate</span>
          </div>

          <div className="p-6 space-y-4">
            {(insights?.failureBreakdown ?? []).map((item) => (
              <div key={item.checkName} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">{item.checkName}</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-500 uppercase">
                      {item.module}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-slate-800">
                    {item.failedCount.toLocaleString()} ({item.shareOfFailuresPct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.module === "audio"
                        ? "bg-amber-500"
                        : item.module === "vision"
                          ? "bg-blue-600"
                          : "bg-indigo-500"
                    }`}
                    style={{ width: `${Math.min(100, item.shareOfFailuresPct * 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* High-Demand Language Surge Matrix */}
        <section className="xl:col-span-7 rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Language Demand &amp; Auto-Surge Pricing Matrix</span>
            </h2>
            <span className="text-xs font-mono text-emerald-700 font-semibold">
              Effective Audio Rate ($/Call)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                  <th className="py-3 px-4 font-semibold">Language / Locale</th>
                  <th className="py-3 px-4 font-semibold">Demand Queue</th>
                  <th className="py-3 px-4 font-semibold">Demand Tier</th>
                  <th className="py-3 px-4 font-semibold">Locale Mult</th>
                  <th className="py-3 px-4 font-semibold">Effective Rate</th>
                  <th className="py-3 px-4 font-semibold">Auto-Test</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(surgePricing?.languageRules ?? []).map((rule) => (
                  <tr key={rule.locale} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{rule.label}</p>
                      <p className="font-mono text-[11px] text-slate-500">{rule.locale}</p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-800">
                      {rule.activeJobsCount} jobs
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-mono font-semibold uppercase ${
                          rule.demandLevel === "surge"
                            ? "text-amber-700"
                            : rule.demandLevel === "high_demand"
                              ? "text-blue-700"
                              : "text-slate-500"
                        }`}
                      >
                        {rule.demandLevel.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900">
                      {rule.multiplier.toFixed(2)}x
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-bold text-emerald-700">
                      ${rule.effectiveAudioRateUsd.toFixed(3)}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void handleSaveMultipliers({
                            localeUpdate: {
                              locale: rule.locale,
                              activeJobsCount: rule.activeJobsCount + 20,
                            },
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold border border-slate-200 rounded bg-white text-slate-700 hover:border-amber-400 hover:text-amber-700 whitespace-nowrap"
                      >
                        <Flame className="w-3 h-3 text-amber-500" />
                        <span>Spike +20 Jobs</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Module Throughput Summary */}
      <section className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-950 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Anonymized QA Engine Volume &amp; Pricing Valuation</span>
          </h2>
          <span className="text-xs text-slate-500">Ready for Commercial License Sale</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
          {(insights?.moduleBenchmarks ?? []).map((mod) => (
            <div key={mod.module} className="p-6 space-y-2">
              <p className="text-xs font-semibold text-blue-700 uppercase">{mod.module} Pipeline</p>
              <p className="text-base font-bold text-slate-950">{mod.label}</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                {mod.totalProcessedUnits.toLocaleString()}{" "}
                <span className="text-xs font-sans font-medium text-slate-500">{mod.unitLabel}</span>
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-600">
                Pass Rate: <span className="text-emerald-700 font-bold">{mod.passRatePct}%</span> ·
                Rate: <span className="text-blue-700 font-bold">${mod.effectivePricePerCallUsd.toFixed(2)}</span>/call
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
