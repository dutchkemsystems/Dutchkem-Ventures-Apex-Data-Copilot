import React from "react";
import { AlertTriangle } from "lucide-react";

export interface DisputedEscrowEntry {
  id: string;
  task_title: string;
  freelancer_name: string;
  gross_amount: number;
  currency: "NGN" | "USD";
  status: string;
  qa_passed?: boolean | null;
  failure_rate_pct?: number | null;
  qa_report_summary?: string | null;
  kora_transaction_reference: string;
}

interface AdminDisputeReviewPanelProps {
  disputedEntries: DisputedEscrowEntry[];
  partialSplitPctMap: Record<string, number>;
  resolvingDisputeId: string | null;
  onChangePartialPct: (entryId: string, pct: number) => void;
  onResolveDispute: (
    escrowId: string,
    action: "release_full" | "refund_client" | "partial_release",
    freelancerPct?: number
  ) => void;
  formatMoney: (amount: number, currency: "NGN" | "USD") => string;
}

/**
 * Isolated Admin-Plane Dispute Resolution Panel.
 * Code-split out of user JS bundles and dynamically loaded only for admin operators.
 */
export function AdminDisputeReviewPanel({
  disputedEntries,
  partialSplitPctMap,
  resolvingDisputeId,
  onChangePartialPct,
  onResolveDispute,
  formatMoney,
}: AdminDisputeReviewPanelProps) {
  if (disputedEntries.length === 0) return null;

  return (
    <section
      data-security-plane="admin"
      className="p-4 sm:p-6 bg-red-50/70 border border-red-200 rounded-2xl space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-red-950">
              Dispute Review — Failed QA Report Queue (&gt;10% Threshold)
            </h2>
            <p className="text-xs text-red-800">
              Escrow remains held in platform Kora balance. Execute Release Escrow (85/15 Full),
              custom Partial Release, or full Refund Client via Kora Pay API.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {disputedEntries.map((entry) => {
          const pct = partialSplitPctMap[entry.id] ?? 50;
          const busy = resolvingDisputeId === entry.id;
          return (
            <div
              key={entry.id}
              className="p-4 rounded-xl bg-white border border-red-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-bold text-slate-950">
                  {entry.task_title} ·{" "}
                  <span className="font-mono text-red-700">
                    {formatMoney(entry.gross_amount, entry.currency)}
                  </span>
                  {typeof entry.failure_rate_pct === "number" && (
                    <span className="ml-2 font-mono text-xs text-red-700">
                      ({entry.failure_rate_pct}% failed QA)
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-600 break-words">
                  Freelancer: {entry.freelancer_name} · Ref:{" "}
                  <span className="font-mono">{entry.kora_transaction_reference}</span> · Status:{" "}
                  <span className="font-mono font-semibold">{entry.status}</span>
                </p>
                <p className="text-xs text-red-800 font-medium">
                  {entry.qa_report_summary ||
                    "Automated QA checks failed >10% threshold. Held in platform balance."}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolveDispute(entry.id, "release_full")}
                  className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 whitespace-nowrap disabled:opacity-50"
                >
                  {busy ? "Processing..." : "Release Full (85/15)"}
                </button>
                <div className="flex items-center gap-1.5 border border-amber-300 bg-amber-50 rounded-lg px-2 py-1 min-h-[44px]">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={pct}
                    onChange={(e) =>
                      onChangePartialPct(
                        entry.id,
                        Math.max(1, Math.min(99, Number(e.target.value) || 50))
                      )
                    }
                    aria-label="Partial release freelancer percentage"
                    className="w-14 min-h-[36px] px-2 py-1 text-xs font-mono tabular-nums bg-white border border-amber-300 rounded text-slate-900"
                  />
                  <span className="text-[11px] font-mono text-amber-900">%</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onResolveDispute(entry.id, "partial_release", pct)}
                    className="flex-1 sm:flex-none min-h-[36px] px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded hover:bg-amber-700 whitespace-nowrap disabled:opacity-50"
                  >
                    Partial Release
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolveDispute(entry.id, "refund_client")}
                  className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 text-xs font-semibold border border-red-300 bg-red-600 text-white rounded-lg hover:bg-red-700 whitespace-nowrap disabled:opacity-50"
                >
                  Refund Client
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default AdminDisputeReviewPanel;
