import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Cookie,
  DollarSign,
  Link2,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import type { AffiliateSummary } from "../types/tenant";

interface AffiliateDashboardViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
}

export function AffiliateDashboardView({
  orgId,
  orgName,
  userId,
  userName,
}: AffiliateDashboardViewProps) {
  const [summary, setSummary] = useState<AffiliateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [currency, setCurrency] = useState<"NGN" | "USD" | "GBP">("USD");
  const [simTier, setSimTier] = useState<"pro" | "agency">("pro");
  const [simOrgName, setSimOrgName] = useState("Kestrel Voice AI");
  const [busyAction, setBusyAction] = useState<
    "track" | "simulate" | "withdraw" | null
  >(null);
  const [banner, setBanner] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/referrals/summary", {
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Unable to fetch affiliate metrics.");
      }
      const data: AffiliateSummary = await res.json();
      setSummary(data);
    } catch (err) {
      setBanner({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to load referral analytics.",
      });
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function handleCopyLink() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.referralLink);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = summary.referralLink;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleTestTrackClick() {
    setBusyAction("track");
    setBanner(null);
    try {
      const res = await fetch("/api/referrals/track", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerId: userId,
          landingPath: `/ref/${userId}`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || "Failed to record referral click.");
      }
      if (typeof document !== "undefined") {
        document.cookie = `apex_ref_id=${encodeURIComponent(userId)}; Path=/; Max-Age=2592000; SameSite=Lax`;
        window.localStorage.setItem("apex_ref_id", userId);
      }
      setBanner({
        tone: "success",
        text: `Recorded /ref click & persisted 30-day cookie apex_ref_id=${userId.slice(0, 8)}...`,
      });
      await loadSummary();
    } catch (err) {
      setBanner({
        tone: "error",
        text: err instanceof Error ? err.message : "Tracking error.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSimulateConversion() {
    setBusyAction("simulate");
    setBanner(null);
    try {
      const res = await fetch("/api/referrals/simulate-conversion", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          planTier: simTier,
          referredOrgName: simOrgName.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || "Unable to simulate referral conversion.");
      }
      if (body.summary) {
        setSummary(body.summary);
      } else {
        await loadSummary();
      }
      const credited = body.commission?.commission_usd ?? (simTier === "agency" ? 39.8 : 9.8);
      setBanner({
        tone: "success",
        text: `Tracked click -> attributed "${body.referredOrg?.name}" -> upgraded to ${simTier.toUpperCase()} via Kora Pay. Credited +$${Number(credited).toFixed(2)} (20% recurring).`,
      });
    } catch (err) {
      setBanner({
        tone: "error",
        text: err instanceof Error ? err.message : "Conversion simulation failed.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWithdrawKoraPay() {
    setBusyAction("withdraw");
    setBanner(null);
    try {
      const res = await fetch("/api/referrals/withdraw", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({ currency }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || "Withdrawal via Kora Pay failed.");
      }
      if (body.summary) {
        setSummary(body.summary);
      } else {
        await loadSummary();
      }
      setBanner({
        tone: "success",
        text: `Settled $${Number(body.amountUsd).toFixed(2)} (${body.currency} ${Number(body.settledAmount).toLocaleString()}) to ${userName} via Kora Pay (${body.payoutRef}).`,
      });
    } catch (err) {
      setBanner({
        tone: "error",
        text: err instanceof Error ? err.message : "Payout error.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="border-b border-slate-200/80 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            Phase 16 · Viral Partner &amp; Affiliate Growth Engine
          </p>
          <h1 className="mt-1 text-2xl 2xl:text-3xl font-bold tracking-tight text-slate-950">
            20% Recurring Affiliate Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Share your unique tracking link. Any AI lab or annotator team that signs up within{" "}
            <span className="font-mono font-semibold text-slate-900">30 days</span> and upgrades
            to Pro ($49/mo) or Agency ($199/mo) automatically credits{" "}
            <span className="font-mono font-semibold text-emerald-700">20% recurring</span> via
            Kora Pay.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <select
            aria-label="Select Kora Pay payout currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "NGN" | "USD" | "GBP")}
            className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="NGN">NGN · Kora Pay Local</option>
            <option value="USD">USD · Kora Pay Global</option>
            <option value="GBP">GBP · Kora Pay UK</option>
          </select>

          <button
            type="button"
            disabled={busyAction !== null || !summary || summary.availableUsd <= 0}
            onClick={() => void handleWithdrawKoraPay()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>
              {busyAction === "withdraw"
                ? "Settling..."
                : `Withdraw $${summary?.availableUsd.toFixed(2) ?? "0.00"} via Kora Pay`}
            </span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium ${
            banner.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Unique Referral Link Card */}
      <section className="p-6 rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span>Unique Partner Referral Link · {userName} ({orgName})</span>
          </div>
          <p className="font-mono text-sm font-semibold text-slate-950 truncate">
            {summary?.referralLink ?? `https://apexdata.io/ref/${userId}`}
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Cookie className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              Sets persistent <span className="font-mono text-slate-700">apex_ref_id</span> cookie
              (30-day attribution window · 20% recurring lifetime payout).
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleTestTrackClick()}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-800 rounded-lg hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            <span>{busyAction === "track" ? "Recording..." : "Test /ref Click & Cookie"}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyLink()}
            disabled={!summary}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-lg hover:from-blue-700 hover:to-sky-700 transition-all whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Referral Link</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 4 KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Referral Link Clicks</span>
            <MousePointerClick className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-slate-950">
            {loading ? "—" : summary?.clicks ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">30-day cookie impressions</p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Attributed Sign-Ups</span>
            <UserCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-slate-950">
            {loading ? "—" : summary?.signups ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">Orgs bound via apex_ref_id</p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Paid Pro / Agency Upgrades</span>
            <ArrowUpRight className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-slate-950">
            {loading ? "—" : summary?.conversions ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">20% recurring commission active</p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Recurring Earnings</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-emerald-700">
            ${loading ? "0.00" : (summary?.totalEarnedUsd ?? 0).toFixed(2)}
          </p>
          <p className="mt-1 text-xs font-mono tabular-nums text-slate-500">
            Available: ${(summary?.availableUsd ?? 0).toFixed(2)} · Paid: $
            {(summary?.withdrawnUsd ?? 0).toFixed(2)}
          </p>
        </div>
      </section>

      {/* Live End-to-End Funnel Trigger (Click -> Cookie Signup -> Kora Pay Pro Upgrade) */}
      <section className="p-6 rounded-2xl border border-slate-200/80 bg-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Verify 20% Kora Pay Conversion Funnel</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Executes a live referred signup via <span className="font-mono">apex_ref_id</span>{" "}
              cookie and processes a Kora Pay subscription upgrade to verify automatic 20%
              commission crediting.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-950 border border-slate-200 rounded-lg self-start whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Ledger</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label
              htmlFor="sim-referred-org"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Referred Organization Name
            </label>
            <input
              id="sim-referred-org"
              type="text"
              value={simOrgName}
              onChange={(e) => setSimOrgName(e.target.value)}
              placeholder="e.g. Kestrel Voice AI"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="md:col-span-4">
            <label
              htmlFor="sim-plan-tier"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Kora Pay Subscription Tier
            </label>
            <select
              id="sim-plan-tier"
              value={simTier}
              onChange={(e) => setSimTier(e.target.value as "pro" | "agency")}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="pro">Pro ($49/mo) · 20% = +$9.80/mo</option>
              <option value="agency">Agency ($199/mo) · 20% = +$39.80/mo</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleSimulateConversion()}
              className="w-full px-4 py-2 text-xs font-semibold rounded-lg bg-slate-950 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {busyAction === "simulate" ? "Crediting..." : "Simulate Upgrade & Credit 20%"}
            </button>
          </div>
        </div>
      </section>

      {/* Two-Column Tables: Referred Organizations & Recurring Commission Ledger */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-5 rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950">Referred Sign-Ups</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {summary?.attributions.length ?? 0} total
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                  <th className="py-3 px-4 font-semibold">Organization</th>
                  <th className="py-3 px-4 font-semibold">Plan</th>
                  <th className="py-3 px-4 font-semibold">Attributed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(summary?.attributions ?? []).map((attr) => (
                  <tr key={attr.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{attr.referred_org_name}</p>
                      <p className="text-slate-500">{attr.referred_user_email}</p>
                    </td>
                    <td className="py-3 px-4 font-mono uppercase font-semibold text-blue-700">
                      {attr.subscription_tier}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {new Date(attr.attributed_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {!loading && (summary?.attributions.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-500">
                      Share your referral link to attribute sign-ups.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="xl:col-span-7 rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950">
              20% Recurring Commissions &amp; Kora Pay Ledger
            </h2>
            <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
              Rate: 20% Lifetime
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                  <th className="py-3 px-4 font-semibold">Referred Lab</th>
                  <th className="py-3 px-4 font-semibold">Plan</th>
                  <th className="py-3 px-4 font-semibold">Gross</th>
                  <th className="py-3 px-4 font-semibold">20% Credit</th>
                  <th className="py-3 px-4 font-semibold">Kora Pay Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(summary?.commissions ?? []).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{row.referred_org_name}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {row.kora_subscription_ref}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono uppercase text-slate-700">
                      {row.plan_tier}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      ${row.gross_subscription_usd.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-bold text-emerald-700">
                      +${row.commission_usd.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      {row.status === "paid_out" ? (
                        <span className="font-mono text-emerald-700 font-semibold">
                          Paid Out ({row.payout_currency} · {row.payout_reference?.slice(-8)})
                        </span>
                      ) : (
                        <span className="font-mono text-blue-700 font-semibold">
                          Credited · Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && (summary?.commissions.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Commissions appear here as soon as a referred lab upgrades via Kora Pay.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
