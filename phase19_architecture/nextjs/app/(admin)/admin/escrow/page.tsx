"use client";

import React from "react";

export default function AdminEscrowControlPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <p className="text-xs font-mono text-emerald-400">Role Gate: super_admin | finance</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Admin Escrow &amp; Settlement Control</h1>
        <p className="mt-1 text-sm text-slate-400">
          Authorized platform staff can inspect unmasked Kora Pay split references, Fund Escrow holds, or execute Release Escrow dispute resolutions.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
        >
          Fund Escrow
        </button>
        <button
          type="button"
          className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
        >
          Release Escrow
        </button>
      </div>
    </div>
  );
}
