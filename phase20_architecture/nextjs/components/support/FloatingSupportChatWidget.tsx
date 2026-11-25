"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Bot, CheckCircle2, LifeBuoy, MessageSquare, Send, X } from "lucide-react";

interface SupportTicketRecord {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: "open" | "ai_resolved" | "escalated" | "admin_replied" | "closed";
  ai_response: string | null;
  ai_error?: string | null;
  escalated_to_admin: boolean;
  admin_reply: string | null;
  created_at: string;
}

const FAQ_QUICK_PROMPTS = [
  { label: "Kora Pay Payouts", subject: "Kora Pay 85/15 split settlement timing", message: "When do released Kora Pay escrow payouts settle to my verified bank account?" },
  { label: "2FA Backup Codes", subject: "Using 2FA recovery codes", message: "How do I enable optional TOTP 2FA and download backup codes for my workspace account?" },
  { label: "API Rate & Billing", subject: "B2B API key metered usage", message: "How is B2B API Gateway batch usage metered with Kora Pay?" },
];

export default function FloatingSupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/user/support/tickets", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setTickets(data.tickets || []))
      .catch(() => {});
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/support/tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ticket) {
        setTickets((prev) => [data.ticket, ...prev]);
        setSubject("");
        setMessage("");
      }
      if (!res.ok) {
        setError(data.detail || "Unable to submit support ticket.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEscalate(ticketId: string) {
    setEscalatingId(ticketId);
    setError(null);
    try {
      const res = await fetch(`/api/user/support/tickets/${encodeURIComponent(ticketId)}/escalate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User clicked 'This didn't help'" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "Unable to escalate ticket.");
        return;
      }
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? data.ticket : t)));
    } finally {
      setEscalatingId(null);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open ? (
        <div className="w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[560px]">
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold">Apex AI Support</p>
                <p className="text-[11px] text-slate-300">Instant FAQ resolution · Escalate anytime</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label="Close support chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto flex-1 bg-slate-50">
            <div className="flex flex-wrap gap-1.5">
              {FAQ_QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    setSubject(q.subject);
                    setMessage(q.message);
                  }}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700"
                >
                  {q.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 truncate">{ticket.subject}</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {ticket.status}
                  </span>
                </div>
                <p className="text-slate-600">{ticket.message}</p>
                {ticket.ai_response && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2.5 text-slate-800 space-y-1">
                    <p className="font-semibold text-blue-900 text-[11px]">AI Support Response</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{ticket.ai_response}</p>
                  </div>
                )}
                {ticket.ai_error && !ticket.ai_response && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    {ticket.ai_error}
                  </p>
                )}
                {ticket.admin_reply && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-950 space-y-1">
                    <p className="font-semibold text-[11px]">Support Specialist Reply</p>
                    <p>{ticket.admin_reply}</p>
                  </div>
                )}
                {!ticket.escalated_to_admin && ticket.status !== "closed" && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Automated Tier-1</span>
                    </span>
                    <button
                      type="button"
                      disabled={escalatingId === ticket.id}
                      onClick={() => void handleEscalate(ticket.id)}
                      className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline underline-offset-2"
                    >
                      {escalatingId === ticket.id ? "Escalating..." : "This didn't help"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white space-y-2">
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (e.g., Escrow payout timeline)"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <textarea
                rows={2}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask the Apex AI Support Agent..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 text-xs font-semibold shadow-lg border border-slate-700"
        >
          <LifeBuoy className="w-4 h-4 text-emerald-400" />
          <span>Support Chat</span>
          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
        </button>
      )}
    </div>
  );
}
