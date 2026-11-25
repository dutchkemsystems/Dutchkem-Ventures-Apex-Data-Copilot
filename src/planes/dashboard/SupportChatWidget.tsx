import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  LifeBuoy,
  MessageSquare,
  Send,
  X,
} from "lucide-react";

export interface UserSupportTicket {
  id: string;
  org_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  subject: string;
  message: string;
  status: "open" | "ai_resolved" | "escalated" | "admin_replied" | "closed";
  ai_response: string | null;
  ai_confidence: number | null;
  matched_topic?: string;
  ai_error?: string | null;
  escalated_to_admin: boolean;
  escalation_reason?: string | null;
  admin_reply: string | null;
  admin_replied_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

const FAQ_CHIPS = [
  {
    label: "Kora Pay 85/15 Split",
    subject: "When do Kora Pay escrow payouts settle?",
    message: "How does the 85/15 Kora Pay split work and when do released NGN/USD payouts arrive?",
  },
  {
    label: "2FA & Backup Codes",
    subject: "How do I enable optional 2FA?",
    message: "Where can I enable TOTP two-factor authentication and generate single-use backup codes?",
  },
  {
    label: "QA Engines & API Keys",
    subject: "B2B API Gateway & QA usage",
    message: "How do I issue a sk_live_ API key and trigger Vision, Audio, or Text QA evaluations?",
  },
];

interface SupportChatWidgetProps {
  orgId: string;
  userId: string;
}

export function SupportChatWidget({ orgId, userId }: SupportChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<UserSupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/support/tickets", {
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch {
      // Non-blocking widget fetch
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    if (open) {
      void loadTickets();
    }
  }, [open, loadTickets]);

  async function handleSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ticket) {
        setTickets((prev) => [data.ticket, ...prev]);
        setSubject("");
        setMessage("");
      }
      if (!res.ok && data.detail) {
        setError(data.detail);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach Support Agent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEscalate(ticketId: string) {
    setEscalatingId(ticketId);
    setError(null);
    try {
      const res = await fetch(
        `/api/support/tickets/${encodeURIComponent(ticketId)}/escalate`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
            "x-user-id": userId,
          },
          body: JSON.stringify({
            reason: "User clicked 'This didn't help'",
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "Unable to escalate ticket.");
        return;
      }
      if (data.ticket) {
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? data.ticket : t)));
      }
    } finally {
      setEscalatingId(null);
    }
  }

  return (
    <div className="fixed bottom-20 right-3 lg:bottom-5 lg:right-5 z-30">
      {open ? (
        <div
          data-testid="support-chat-widget"
          className="w-[390px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[580px]"
        >
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold leading-tight">Apex AI Support Bot</p>
                <p className="text-[11px] text-slate-300">
                  Instant FAQ answers · Click &quot;This didn&apos;t help&quot; to escalate
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Close support chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto flex-1 bg-slate-50">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Common Questions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {FAQ_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      setSubject(chip.subject);
                      setMessage(chip.message);
                    }}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {loading && tickets.length === 0 ? (
              <p className="text-xs text-slate-500">Loading your support threads...</p>
            ) : tickets.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                Ask anything about Kora Pay settlements, QA engines, API keys, or security settings. Our AI Support Agent responds immediately.
              </div>
            ) : (
              <div className="space-y-2.5">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-900">{ticket.subject}</span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded shrink-0 ${
                          ticket.status === "escalated"
                            ? "bg-amber-100 text-amber-800"
                            : ticket.status === "closed"
                              ? "bg-slate-200 text-slate-700"
                              : ticket.status === "admin_replied"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{ticket.message}</p>

                    {ticket.ai_response && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2.5 text-slate-800 space-y-1">
                        <p className="text-[11px] font-semibold text-blue-900">
                          AI Support Agent
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">{ticket.ai_response}</p>
                      </div>
                    )}

                    {ticket.ai_error && !ticket.ai_response && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                        {ticket.ai_error}
                      </div>
                    )}

                    {ticket.admin_reply && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-950 space-y-1">
                        <p className="text-[11px] font-semibold text-emerald-900">
                          Human Support Specialist Reply
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">{ticket.admin_reply}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      {ticket.escalated_to_admin ? (
                        <span className="text-[11px] font-medium text-amber-800">
                          {ticket.status === "closed"
                            ? "Ticket closed by Support Team"
                            : ticket.admin_reply
                              ? "Specialist replied"
                              : "Escalated to Platform Support Queue"}
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Automated Support</span>
                          </span>
                          {ticket.status !== "closed" && (
                            <button
                              type="button"
                              disabled={escalatingId === ticket.id}
                              onClick={() => void handleEscalate(ticket.id)}
                              className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 disabled:opacity-50"
                            >
                              {escalatingId === ticket.id
                                ? "Escalating..."
                                : "This didn't help"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmitTicket}
            className="p-3 border-t border-slate-200 bg-white space-y-2"
          >
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (e.g., Escrow settlement status)"
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <textarea
                rows={2}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 resize-none focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="min-w-[44px] min-h-[44px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center disabled:opacity-50 transition-colors"
                aria-label="Send support message"
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
          className="min-h-[44px] inline-flex items-center gap-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 text-xs font-semibold shadow-lg border border-slate-700 transition-colors"
        >
          <LifeBuoy className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Support Chat</span>
          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
        </button>
      )}
    </div>
  );
}

export default SupportChatWidget;
