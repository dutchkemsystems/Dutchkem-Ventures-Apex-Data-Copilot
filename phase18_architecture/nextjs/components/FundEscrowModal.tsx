"use client";

import React, { useState } from "react";

interface FundEscrowModalProps {
  defaultTaskId?: string;
  onFunded?: (payload: { reference: string; checkout_url: string; escrow_id: string }) => void;
}

export default function FundEscrowModal({ defaultTaskId = "", onFunded }: FundEscrowModalProps) {
  const [taskId, setTaskId] = useState(defaultTaskId);
  const [amount, setAmount] = useState("1500");
  const [currency, setCurrency] = useState<"NGN" | "USD">("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/escrow/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId.trim(),
          amount: Number(amount),
          currency,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to initialize Kora Pay escrow funding.");
      }
      setCheckoutUrl(body.checkout_url);
      setReference(body.reference);
      onFunded?.(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Escrow pay-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4 max-w-xl">
      <div>
        <p className="text-xs font-semibold text-blue-700">Kora Pay Escrow Pay-In (Phase 18B)</p>
        <h2 className="text-lg font-bold text-slate-950">Fund Task Escrow in Platform Balance</h2>
        <p className="text-xs text-slate-600 mt-1">
          Collected into the Dutchkem Kora merchant balance. The 85/15 split is triggered only after QA passes.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Task ID</label>
          <input
            type="text"
            required
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="44444444-4444-4444-8444-000000000005"
            className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Escrow Amount</label>
            <input
              type="number"
              min="1"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            >
              <option value="USD">USD ($)</option>
              <option value="NGN">NGN (₦)</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 text-xs font-semibold bg-slate-950 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Initializing Kora Charge..." : "Fund Escrow via Kora Pay"}
        </button>
      </form>

      {checkoutUrl && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-2">
          <p className="font-semibold text-blue-950">Kora Pay Checkout Ready</p>
          <p className="font-mono text-blue-800">Reference: {reference}</p>
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block px-3 py-1.5 bg-blue-700 text-white font-semibold rounded-lg"
          >
            Proceed to Kora Checkout
          </a>
        </div>
      )}
    </section>
  );
}
