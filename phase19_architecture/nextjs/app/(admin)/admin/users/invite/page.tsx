"use client";

import React, { useState } from "react";

export default function AdminInvitePage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"super_admin" | "finance" | "dpo">("finance");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/admin/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || "Only super_admin can issue signed admin invites.");
      return;
    }
    setInviteUrl(data.inviteUrl);
  }

  return (
    <div className="space-y-6">
      <div className="border border-slate-800 bg-slate-900 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Invite Platform Admin (Signed Expiring Token)</h2>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new-staff@dutchkemventures.com"
            className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "super_admin" | "finance" | "dpo")}
            className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
          >
            <option value="finance">finance</option>
            <option value="dpo">dpo</option>
            <option value="super_admin">super_admin</option>
          </select>
          <button type="submit" className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white">
            Issue Signed Invite
          </button>
        </form>
        {inviteUrl && (
          <div className="rounded-lg bg-slate-950 border border-emerald-800 p-3 text-xs font-mono text-emerald-300 break-all">
            {inviteUrl}
          </div>
        )}
      </div>
    </div>
  );
}
