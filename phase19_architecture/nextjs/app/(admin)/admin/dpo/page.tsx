"use client";

import React from "react";

export default function AdminDpoDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <p className="text-xs font-mono text-emerald-400">Role Gate: super_admin | dpo</p>
        <h1 className="mt-1 text-2xl font-bold text-white">DPO Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Nigeria Data Protection Act (NDPA) compliance oversight, DSAR fulfillment, and encrypted PII decryption ledger.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-slate-400">Cross-Plane Isolation</p>
          <p className="mt-2 font-mono text-lg font-bold text-emerald-400">Enforced (aud: apex:admin)</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-slate-400">DEK Envelope Key</p>
          <p className="mt-2 font-mono text-lg font-bold text-white">KEK_ADMIN (AES-256-GCM)</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-slate-400">DSAR SLA Window</p>
          <p className="mt-2 font-mono text-lg font-bold text-blue-400">&lt; 24 Hours</p>
        </div>
      </div>
    </div>
  );
}
