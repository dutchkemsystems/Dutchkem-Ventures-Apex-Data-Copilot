"use client";

import React, { useEffect, useState } from "react";

interface InsightsSummary {
  totalAudioHoursProcessed: number;
  topFailedQaCheck: string;
  globalPassRatePct: number;
  projectedMonthlyUpliftUsd: number;
}

export default function AdminDynamicPricingInsightsPage() {
  const [audioMult, setAudioMult] = useState(2.0);
  const [visionMult, setVisionMult] = useState(1.25);
  const [textMult, setTextMult] = useState(1.0);
  const [insights, setInsights] = useState<InsightsSummary | null>(null);

  useEffect(() => {
    fetch("/api/admin/insights/overview", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.insights) setInsights(data.insights);
      })
      .catch(() => {});
  }, []);

  async function saveSurgeMultipliers() {
    await fetch("/api/admin/pricing/surge", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_qa_multiplier: audioMult,
        vision_qa_multiplier: visionMult,
        text_qa_multiplier: textMult,
        auto_language_surge_enabled: true,
      }),
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold text-blue-600">Phase 17 · Admin Intelligence &amp; Surge Pricing</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Dynamic QA Pricing &amp; Data Insights</h1>
        </div>
        <a
          href="/api/admin/insights/report.pdf"
          className="px-4 py-2 text-xs font-semibold bg-slate-950 text-white rounded-lg"
        >
          Export PDF Report
        </a>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 bg-white">
          <p className="text-xs text-slate-500">Total Audio Hours Processed</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {insights?.totalAudioHoursProcessed.toLocaleString() ?? "10,000"}
          </p>
        </div>
        <div className="p-5 rounded-2xl border border-slate-200 bg-white">
          <p className="text-xs text-slate-500">Top Failed QA Check</p>
          <p className="mt-2 text-xl font-bold text-amber-700">
            {insights?.topFailedQaCheck ?? "Noise Floor (< -70 dBFS)"}
          </p>
        </div>
        <div className="p-5 rounded-2xl border border-slate-200 bg-white">
          <p className="text-xs text-slate-500">Effective Audio Unit Rate (Kora Pay)</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            ${(0.1 * audioMult).toFixed(2)} / call
          </p>
        </div>
      </section>

      <section className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4">
        <h2 className="text-base font-bold text-slate-950">Module Surge Multipliers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-xs font-semibold text-slate-700">
            Audio QA Multiplier ({audioMult.toFixed(2)}x)
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.25"
              value={audioMult}
              onChange={(e) => setAudioMult(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Vision QA Multiplier ({visionMult.toFixed(2)}x)
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.25"
              value={visionMult}
              onChange={(e) => setVisionMult(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Text QA Multiplier ({textMult.toFixed(2)}x)
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.25"
              value={textMult}
              onChange={(e) => setTextMult(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={saveSurgeMultipliers}
          className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg"
        >
          Apply Surge Multipliers
        </button>
      </section>
    </main>
  );
}
