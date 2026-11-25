"use client";

import React, { useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/user/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || "Invalid or expired reset token.");
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFF] p-6">
      <form onSubmit={handleReset} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 space-y-5 shadow-sm">
        <div>
          <p className="text-xs font-mono text-blue-700">User Plane · Password Update</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Choose a new password</h1>
        </div>
        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
        {done && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">Password updated. You may now sign in at /login.</p>}
        <input
          type="text"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Reset Token"
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-mono text-slate-950"
        />
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New Strong Password"
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950"
        />
        <button type="submit" className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-semibold text-white">
          Confirm Password Reset
        </button>
      </form>
    </div>
  );
}
