"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldBan } from "lucide-react";

interface ModerationEventRow {
  id: string;
  user_email: string;
  asset_type: "image" | "video" | "audio" | "text";
  scanner: string;
  verdict: "approved" | "blocked";
  categories: string[];
  reason: string | null;
  strike_number: number;
  auto_banned: boolean;
  created_at: string;
}

interface FlaggedUserRow {
  id: string;
  email: string;
  full_name: string;
  moderation_strikes: number;
  is_suspended: boolean;
  suspension_reason: string | null;
}

export default function AdminModerationPage() {
  const [events, setEvents] = useState<ModerationEventRow[]>([]);
  const [flaggedUsers, setFlaggedUsers] = useState<FlaggedUserRow[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const res = await fetch("/admin/api/moderation/events", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events || []);
      setFlaggedUsers(data.flaggedUsers || []);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function unsuspendUser(userId: string) {
    setBusyUserId(userId);
    try {
      await fetch(`/admin/api/moderation/users/${encodeURIComponent(userId)}/unsuspend`, {
        method: "POST",
        credentials: "include",
      });
      await loadData();
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 text-slate-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldBan className="w-5 h-5 text-red-400" />
          <h1 className="text-xl font-bold">Content Moderation &amp; Auto-Ban Queue</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Suspended &amp; Flagged Users</h2>
        {flaggedUsers.map((u) => (
          <div key={u.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-white">{u.full_name} ({u.email})</p>
              <p className="font-mono text-slate-400">Strikes: {u.moderation_strikes}/3 · {u.suspension_reason}</p>
            </div>
            {u.is_suspended && (
              <button
                type="button"
                disabled={busyUserId === u.id}
                onClick={() => void unsuspendUser(u.id)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"
              >
                Unsuspend Account
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Pre-Upload Moderation Events</h2>
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs flex justify-between">
              <span className="font-mono">{ev.user_email} · {ev.asset_type} · {ev.scanner}</span>
              <span className={ev.verdict === "blocked" ? "text-red-400 font-mono" : "text-emerald-400 font-mono"}>
                {ev.verdict} {ev.verdict === "blocked" ? `(strike ${ev.strike_number}/3)` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
