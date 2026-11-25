import React from "react";
import { Wallet } from "lucide-react";

interface AdminEscrowControlsProps {
  freelancers: Array<{ id: string; full_name: string; kora_recipient_id: string | null }>;
  fundTaskTitle: string;
  fundFreelancerId: string;
  fundAmount: string;
  fundCurrency: "NGN" | "USD";
  fundingSubmitting: boolean;
  onChangeTitle: (val: string) => void;
  onChangeFreelancerId: (val: string) => void;
  onChangeAmount: (val: string) => void;
  onChangeCurrency: (val: "NGN" | "USD") => void;
  onSubmitFundEscrow: (e: React.FormEvent) => void;
}

/**
 * Isolated Admin-Plane Escrow Funding Control ("Fund Escrow").
 * Strictly separated from User/Dashboard bundles.
 */
export function AdminEscrowControls({
  freelancers,
  fundTaskTitle,
  fundFreelancerId,
  fundAmount,
  fundCurrency,
  fundingSubmitting,
  onChangeTitle,
  onChangeFreelancerId,
  onChangeAmount,
  onChangeCurrency,
  onSubmitFundEscrow,
}: AdminEscrowControlsProps) {
  return (
    <section
      data-security-plane="admin"
      className="p-4 sm:p-6 bg-white border border-slate-200 rounded-2xl space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Fund Escrow via Kora Pay (Admin Finance Control)
            </h2>
            <p className="text-xs text-slate-600">
              Collects NGN or USD into the platform Kora balance via{" "}
              <span className="font-mono font-semibold text-slate-900">POST /api/escrow/fund</span>.
              The 85/15 split stays un-triggered until QA approval.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-semibold text-blue-700 whitespace-nowrap shrink-0">
          Zero Split on Pay-In
        </span>
      </div>

      <form onSubmit={onSubmitFundEscrow} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Task Title / Deliverable
          </label>
          <input
            type="text"
            required
            value={fundTaskTitle}
            onChange={(e) => onChangeTitle(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Assigned Freelancer
          </label>
          <select
            value={fundFreelancerId}
            onChange={(e) => onChangeFreelancerId(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {freelancers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name} ({f.kora_recipient_id ? "Kora Ready" : "Unbound"})
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Amount</label>
          <input
            type="number"
            min="1"
            step="0.01"
            required
            value={fundAmount}
            onChange={(e) => onChangeAmount(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Currency</label>
          <select
            value={fundCurrency}
            onChange={(e) => onChangeCurrency(e.target.value as "NGN" | "USD")}
            className="w-full min-h-[44px] px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="USD">USD</option>
            <option value="NGN">NGN</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={fundingSubmitting}
            className="w-full min-h-[44px] px-4 py-2 text-xs font-semibold bg-slate-950 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {fundingSubmitting ? "Initializing..." : "Fund Escrow"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminEscrowControls;
