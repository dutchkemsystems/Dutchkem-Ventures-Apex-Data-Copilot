"use client";

import React, { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/user/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || "Unable to issue password reset link.");
      return;
    }
    setStatusMessage(data.message || "Reset instructions issued.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFF] p-6">
      <form onSubmit={handleRequestReset} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 space-y-5 shadow-sm">
        <div>
          <p className="text-xs font-mono text-blue-700">User Plane · Account Recovery</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Reset your password</h1>
        </div>
        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
        {statusMessage && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{statusMessage}</p>}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@agency.com"
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950"
        />
        <button type="submit" className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-semibold text-white">
          Send Reset Link
        </button>
      </form>
    </div>
  );
}
