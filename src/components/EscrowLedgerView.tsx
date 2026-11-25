import React, { useState } from "react";
import { Download } from "lucide-react";
import type { WorkspacePayload } from "../types/tenant";

interface EscrowLedgerViewProps {
  data: WorkspacePayload;
}

export function EscrowLedgerView({ data }: EscrowLedgerViewProps) {
  const [filter, setFilter] = useState<"all" | "held" | "released" | "disputed">("all");
  const isAdmin = data.currentUser.role === "admin";

  const entries = data.escrowLedger.filter((entry) =>
    filter === "all" ? true : entry.status === filter
  );

  const totalGross = entries.reduce((acc, e) => acc + e.amount, 0);
  const totalFee = entries.reduce((acc, e) => acc + (e.platform_fee ?? 0), 0);
  const totalPayout = entries.reduce((acc, e) => acc + e.annotator_payout, 0);

  function handleExportCsv() {
    const headers = isAdmin
      ? ["ledger_id", "task_id", "task_title", "status", "gross_usd", "platform_fee_20pct", "annotator_payout_80pct"]
      : ["ledger_id", "task_id", "task_title", "status", "annotator_payout_80pct"];

    const escapeCsv = (val: string | number) =>
      `"${String(val).replace(/"/g, '""')}"`;

    const rows = entries.map((entry) => {
      const task = data.tasks.find((t) => t.id === entry.task_id);
      const base = [
        entry.id,
        entry.task_id,
        task?.title ?? entry.task_id,
        entry.status,
      ];
      if (isAdmin) {
        base.push(
          entry.amount.toFixed(2),
          (entry.platform_fee ?? 0).toFixed(2),
          entry.annotator_payout.toFixed(2)
        );
      } else {
        base.push(entry.annotator_payout.toFixed(2));
      }
      return base.map(escapeCsv).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escrow_ledger_${filter}_${data.organization.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            White-Label Escrow Settlement · {data.organization.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Escrow Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAdmin
              ? "Enforces invariant platform_fee (20%) + annotator_payout (80%) = amount across all org tasks."
              : "Scoped to your assigned tasks. Displays your 80% net annotator payout."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(["all", "held", "released", "disputed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`min-h-[44px] px-3 py-2 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap ${
                  filter === status
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={entries.length === 0}
            onClick={handleExportCsv}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Export Ledger (.csv)</span>
          </button>
        </div>
      </div>

      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        {/* Mobile (<md) Stacked Cards */}
        <div className="md:hidden divide-y divide-slate-200">
          {entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No escrow ledger entries match this status filter.
            </div>
          ) : (
            <>
              {entries.map((entry) => {
                const task = data.tasks.find((t) => t.id === entry.task_id);
                return (
                  <article key={entry.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">
                          {task?.title ?? entry.task_id}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 font-mono truncate">
                          Ledger {entry.id.slice(0, 12)} · Task {entry.task_id.slice(0, 10)}
                        </p>
                      </div>
                      <span
                        className={`text-xs capitalize shrink-0 ${
                          entry.status === "released"
                            ? "text-emerald-700 font-semibold"
                            : entry.status === "disputed"
                              ? "text-red-700 font-semibold"
                              : "text-amber-700 font-semibold"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                      {isAdmin && (
                        <>
                          <div>
                            <dt className="text-slate-500">Gross Amount</dt>
                            <dd className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                              ${entry.amount.toFixed(2)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Platform Fee (20%)</dt>
                            <dd className="mt-0.5 font-mono tabular-nums text-slate-700">
                              ${(entry.platform_fee ?? 0).toFixed(2)}
                            </dd>
                          </div>
                        </>
                      )}
                      <div className={isAdmin ? "col-span-2" : "col-span-2"}>
                        <dt className="text-slate-500">Annotator Payout (80%)</dt>
                        <dd className="mt-0.5 text-sm font-mono tabular-nums font-bold text-emerald-700">
                          ${entry.annotator_payout.toFixed(2)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}

              <div className="p-4 bg-slate-50/80 space-y-2 text-xs">
                <p className="font-semibold text-slate-900">
                  Filtered Totals ({entries.length} entries)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {isAdmin && (
                    <>
                      <div>
                        <span className="text-slate-500 block">Gross Total</span>
                        <span className="font-mono tabular-nums font-bold text-slate-950">
                          ${totalGross.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Platform Fee</span>
                        <span className="font-mono tabular-nums font-bold text-emerald-700">
                          ${totalFee.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="col-span-2">
                    <span className="text-slate-500 block">Net Annotator Payout</span>
                    <span className="text-sm font-mono tabular-nums font-bold text-slate-950">
                      ${totalPayout.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Desktop (md+) Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                <th className="py-3 px-6">Ledger ID</th>
                <th className="py-3 px-4">Linked Task</th>
                <th className="py-3 px-4">Status</th>
                {isAdmin && (
                  <>
                    <th className="py-3 px-4 text-right">Gross Amount</th>
                    <th className="py-3 px-4 text-right">Platform Fee (20%)</th>
                  </>
                )}
                <th className="py-3 px-6 text-right">Annotator Payout (80%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 4}
                    className="py-10 px-6 text-center text-slate-500"
                  >
                    No escrow ledger entries match this status filter.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const task = data.tasks.find((t) => t.id === entry.task_id);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-6 font-mono text-xs text-slate-600">
                        {entry.id.slice(0, 14)}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-900">
                          {task?.title ?? entry.task_id}
                        </p>
                        <p className="text-xs text-slate-500 font-mono">
                          task_id: {entry.task_id.slice(0, 12)}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 capitalize">
                        <span
                          className={
                            entry.status === "released"
                              ? "text-emerald-700 font-medium"
                              : entry.status === "disputed"
                                ? "text-red-700 font-medium"
                                : "text-amber-700 font-medium"
                          }
                        >
                          {entry.status}
                        </span>
                      </td>
                      {isAdmin && (
                        <>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                            ${entry.amount.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                            ${(entry.platform_fee ?? 0).toFixed(2)}
                          </td>
                        </>
                      )}
                      <td className="py-3.5 px-6 text-right font-mono tabular-nums font-medium text-slate-900">
                        ${entry.annotator_payout.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/70 text-sm font-semibold text-slate-900">
                  <td colSpan={3} className="py-3 px-6">
                    Filtered Totals ({entries.length} entries)
                  </td>
                  {isAdmin && (
                    <>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        ${totalGross.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                        ${totalFee.toFixed(2)}
                      </td>
                    </>
                  )}
                  <td className="py-3 px-6 text-right font-mono tabular-nums">
                    ${totalPayout.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
