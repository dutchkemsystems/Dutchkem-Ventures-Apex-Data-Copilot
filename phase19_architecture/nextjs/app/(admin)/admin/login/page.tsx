"use client";

import React, { useState } from "react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/admin/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || "Invalid admin credentials.");
      return;
    }
    if (data.requiresTotp && data.challengeToken) {
      sessionStorage.setItem("apex_admin_2fa_challenge", data.challengeToken);
      window.location.href = "/admin/2fa";
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5">
        <div>
          <p className="text-xs font-mono text-emerald-400">Admin Plane · aud: apex:admin</p>
          <h1 className="mt-1 text-2xl font-bold text-white">Staff &amp; DPO Sign In</h1>
          <p className="mt-1 text-xs text-slate-400">Self-registration is disabled. TOTP verification is mandatory.</p>
        </div>
        {error && <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg p-3">{error}</p>}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="superadmin@dutchkemventures.com"
          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin Password"
          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white"
        />
        <button type="submit" className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2.5 text-sm font-semibold text-white">
          Continue to 2FA Verification
        </button>
      </form>
    </div>
  );
}
