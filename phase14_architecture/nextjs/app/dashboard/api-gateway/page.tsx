"use client";

import React, { useEffect, useState } from "react";

interface B2BApiKeyItem {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  totalCalls: number;
  unbilledCalls: number;
  status: "active" | "revoked" | "past_due";
}

export default function B2BApiGatewayPage() {
  const [keys, setKeys] = useState<B2BApiKeyItem[]>([]);
  const [label, setLabel] = useState("Production AI Lab Pipeline");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"NGN" | "USD" | "GBP">("NGN");

  useEffect(() => {
    fetch("/api/b2b/keys", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { keys: [] }))
      .then((data) => setKeys(data.keys ?? []));
  }, []);

  async function handleGenerateKey(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/b2b/keys", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, scopes: ["audio", "vision", "text"] }),
    });
    const data = await res.json();
    if (res.ok && data.rawKey) {
      setCreatedSecret(data.rawKey);
      setKeys((prev) => [data.key, ...prev]);
    }
  }

  async function handleSettleViaKoraPay() {
    await fetch("/api/b2b/billing/settle-month", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency }),
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 space-y-8">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">B2B API Gateway & Kora Pay Metering</h1>
          <p className="text-sm text-slate-600">
            Generate sk_live_... API keys for /api/v1/qa/audio, /vision, and /text ($0.10/call).
          </p>
        </div>
        <button
          type="button"
          onClick={handleSettleViaKoraPay}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white"
        >
          Settle Metered Usage via Kora Pay ({currency})
        </button>
      </header>

      <form onSubmit={handleGenerateKey} className="flex gap-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          placeholder="API key label"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as "NGN" | "USD" | "GBP")}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="NGN">NGN</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
        </select>
        <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white">
          Generate sk_live_ Key
        </button>
      </form>

      {createdSecret && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 font-mono text-xs text-emerald-950">
          Copy your B2B secret now (shown once): {createdSecret}
        </div>
      )}

      <section className="border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
        {keys.map((k) => (
          <div key={k.id} className="px-6 py-4 flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold text-slate-900">{k.label}</p>
              <p className="font-mono text-xs text-slate-500">{k.keyPrefix}</p>
            </div>
            <p className="font-mono tabular-nums text-slate-800">
              {k.unbilledCalls} unbilled calls (${(k.unbilledCalls * 0.1).toFixed(2)})
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
