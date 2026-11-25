"use client";

import React, { useEffect, useState } from "react";

interface AffiliateSummary {
  referralLink: string;
  commissionRatePct: number;
  clicks: number;
  signups: number;
  conversions: number;
  totalEarnedUsd: number;
  availableUsd: number;
}

export default function AffiliateDashboardPage() {
  const [summary, setSummary] = useState<AffiliateSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [currency, setCurrency] = useState<"NGN" | "USD" | "GBP">("USD");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function loadSummary() {
    const res = await fetch("/api/referrals/summary", { credentials: "include" });
    if (res.ok) setSummary(await res.json());
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  async function handleCopyLink() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleWithdrawKoraPay() {
    const res = await fetch("/api/referrals/withdraw", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatusMessage(`Settled $${data.amountUsd.toFixed(2)} via Kora Pay (${data.payoutRef}).`);
      await loadSummary();
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold text-blue-600">Phase 16 · Affiliate &amp; Referral Engine</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">20% Recurring Partner Earnings</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "NGN" | "USD" | "GBP")}
            className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white"
          >
            <option value="NGN">NGN (Kora Pay Local)</option>
            <option value="USD">USD (Kora Pay Global)</option>
            <option value="GBP">GBP (Kora Pay UK)</option>
          </select>
          <button
            type="button"
            onClick={handleWithdrawKoraPay}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
          >
            Withdraw via Kora Pay
          </button>
        </div>
      </header>

      {summary && (
        <>
          <section className="p-6 rounded-2xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Your Unique Referral Link (30-Day Cookie)</p>
              <p className="mt-1 font-mono text-sm font-semibold text-blue-700 truncate">{summary.referralLink}</p>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg"
            >
              {copied ? "Copied Link" : "Copy Referral Link"}
            </button>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Total Link Clicks</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{summary.clicks}</p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Attributed Sign-Ups</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{summary.signups}</p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">Pro / Agency Upgrades</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{summary.conversions}</p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <p className="text-xs text-slate-500">20% Recurring Earnings</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                ${summary.totalEarnedUsd.toFixed(2)}
              </p>
            </div>
          </section>
        </>
      )}

      {statusMessage && (
        <p className="p-4 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
          {statusMessage}
        </p>
      )}
    </main>
  );
}
