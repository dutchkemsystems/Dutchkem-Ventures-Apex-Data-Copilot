"use client";

import React from "react";

export interface FreelancerPayoutItem {
  id: string;
  taskTitle: string;
  currency: "NGN" | "USD";
  grossAmount: number;
  platformFee15Pct: number;
  netPayout85Pct: number;
  status: "funded" | "released" | "settled" | "disputed" | "refunded" | "failed";
  koraSplitReference: string | null;
  releasedAt: string | null;
  expectedSettlementAt: string | null;
  settledAt: string | null;
  taxReceiptUrl: string | null;
  usdToNgnRate?: number;
}

interface PayoutStatusDashboardProps {
  freelancerName: string;
  koraRecipientId: string | null;
  payouts: FreelancerPayoutItem[];
}

export default function PayoutStatusDashboard({
  freelancerName,
  koraRecipientId,
  payouts,
}: PayoutStatusDashboardProps) {
  function formatAmount(amount: number, currency: "NGN" | "USD") {
    return currency === "NGN"
      ? `₦${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            Kora Pay 85/15 Split Rule · apex-marketplace-split
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Freelancer Payout Status &amp; T+2 Settlement
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            Recipient: <span className="font-semibold text-slate-900">{freelancerName}</span> ·{" "}
            Kora Recipient ID:{" "}
            <span className="font-mono font-semibold text-blue-700">
              {koraRecipientId || "Not onboarded"}
            </span>
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {payouts.map((item) => {
          const isProcessingT2 = item.status === "released";
          const isSettled = item.status === "settled";
          return (
            <article
              key={item.id}
              className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-950">{item.taskTitle}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    Split Ref: {item.koraSplitReference || "Pending QA release"} · Currency:{" "}
                    {item.currency}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                    {formatAmount(item.netPayout85Pct, item.currency)}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-slate-500">
                    85% Net (Gross {formatAmount(item.grossAmount, item.currency)} · Fee{" "}
                    {formatAmount(item.platformFee15Pct, item.currency)})
                  </p>
                </div>
              </div>

              {isProcessingT2 && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
                  <p className="font-semibold">
                    Your payout is being processed. Expected settlement: 2 business days (T+2).
                  </p>
                  {item.currency === "USD" && item.usdToNgnRate && (
                    <p className="font-mono tabular-nums text-blue-800">
                      Indicative NGN local conversion: $1 = ₦{item.usdToNgnRate.toLocaleString()} (≈ ₦
                      {(item.netPayout85Pct * item.usdToNgnRate).toLocaleString()})
                    </p>
                  )}
                </div>
              )}

              {isSettled && item.settledAt && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold">
                    Settled via Kora Pay on {new Date(item.settledAt).toLocaleDateString()}
                  </span>
                  {item.taxReceiptUrl && (
                    <a
                      href={item.taxReceiptUrl}
                      className="font-mono font-semibold text-emerald-800 underline"
                    >
                      Download Tax Receipt (PDF)
                    </a>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
