"use client";

import React, { useEffect, useState } from "react";

interface AdminSupportTicket {
  id: string;
  user_id: string;
  user_email: string;
  subject: string;
  message: string;
  status: string;
  ai_response: string | null;
  escalated_to_admin: boolean;
  admin_reply: string | null;
  created_at: string;
}

export default function AdminSupportQueuePage() {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});

  async function loadTickets() {
    const res = await fetch("/admin/api/support/tickets", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets || []);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, []);

  async function handleReply(ticketId: string, closeTicket: boolean) {
    const reply = (draftReplies[ticketId] || "").trim();
    if (!reply && !closeTicket) return;
    const endpoint = reply
      ? `/admin/api/support/tickets/${encodeURIComponent(ticketId)}/reply`
      : `/admin/api/support/tickets/${encodeURIComponent(ticketId)}/close`;
    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply, closeTicket }),
    });
    if (res.ok) {
      await loadTickets();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Escalated Support Tickets (/admin/support)</h1>
        <p className="text-xs text-slate-400">
          Review tickets where users clicked &quot;This didn&apos;t help&quot;, send specialist replies, and close threads.
        </p>
      </div>
      <div className="space-y-3">
        {tickets.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{t.subject}</span>
              <span className="font-mono text-amber-300">{t.status}</span>
            </div>
            <p className="text-slate-300">{t.message}</p>
            {t.ai_response && (
              <div className="rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-400">
                Prior AI Answer: {t.ai_response}
              </div>
            )}
            <textarea
              rows={2}
              value={draftReplies[t.id] ?? t.admin_reply ?? ""}
              onChange={(e) => setDraftReplies((prev) => ({ ...prev, [t.id]: e.target.value }))}
              placeholder="Write specialist resolution reply..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleReply(t.id, false)}
                className="px-3 py-1.5 rounded bg-blue-600 text-white font-semibold"
              >
                Reply
              </button>
              <button
                type="button"
                onClick={() => void handleReply(t.id, true)}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold"
              >
                Reply &amp; Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
