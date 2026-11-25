"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Menu,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type AdminSection = "alerts" | "escrow" | "safety";

interface EmergencyDisputeRecord {
  id: string;
  jobTitle: string;
  freelancerName: string;
  grossAmount: number;
  currency: "USD" | "NGN";
  failureRatePct: number;
  status: "disputed" | "funded" | "released" | "refunded";
}

const INITIAL_DISPUTES: EmergencyDisputeRecord[] = [
  {
    id: "kesc-18a-005",
    jobTitle: "Hausa & Yoruba Clinical Audio QA Batch (180 Clips)",
    freelancerName: "Elena Rostova",
    grossAmount: 950,
    currency: "USD",
    failureRatePct: 14.2,
    status: "disputed",
  },
];

export default function MobileAdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<AdminSection>("alerts");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [disputes, setDisputes] = useState<EmergencyDisputeRecord[]>(INITIAL_DISPUTES);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeAlerts = disputes.filter((d) => d.status === "disputed");

  async function triggerEmergencyAction(
    escrowId: string,
    action: "release" | "refund"
  ) {
    setBusyId(escrowId);
    setFeedback(null);
    try {
      const response = await fetch(`/admin/api/escrow/${escrowId}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason:
            action === "release"
              ? "Super Admin 1-tap mobile release override"
              : "Super Admin 1-tap mobile refund override",
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Emergency ${action} failed`);
      }
      setDisputes((prev) =>
        prev.map((row) =>
          row.id === escrowId
            ? { ...row, status: action === "release" ? "released" : "refunded" }
            : row
        )
      );
      setFeedback(
        action === "release"
          ? `Escrow ${escrowId} released (85/15 split dispatched).`
          : `Escrow ${escrowId} refunded to client funding source.`
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Desktop Sidebar (lg+ only) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
        <div className="px-5 py-5 border-b border-slate-800">
          <p className="text-sm font-bold text-white">Apex Admin Control</p>
          <p className="text-xs text-emerald-300">Super Admin Mobile Plane</p>
        </div>
        <nav aria-label="Desktop admin navigation" className="flex-1 p-3 space-y-1.5">
          {(
            [
              { id: "alerts", label: "Critical Alerts", icon: AlertTriangle },
              { id: "escrow", label: "Escrow Ledger", icon: Landmark },
              { id: "safety", label: "Safety & Audit", icon: ShieldCheck },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-emerald-500 text-slate-950"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open admin navigation menu"
                  className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 shrink-0"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[300px] sm:w-[340px] p-0 bg-slate-900 text-slate-100 border-r border-slate-800"
                headerBarClassName="bg-slate-900/95 border-slate-800"
                closeButtonClassName="border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
              >
                <SheetHeader className="px-5 py-4 border-b border-slate-800">
                  <SheetTitle className="text-base font-bold text-white">
                    Apex Admin Control
                  </SheetTitle>
                  <SheetDescription className="text-xs text-slate-400">
                    Mobile emergency response navigation
                  </SheetDescription>
                </SheetHeader>
                <nav className="p-3 space-y-1.5">
                  {(
                    [
                      { id: "alerts", label: "Critical Alerts", icon: AlertTriangle },
                      { id: "escrow", label: "Escrow Ledger", icon: Landmark },
                      { id: "safety", label: "Safety & Audit", icon: ShieldCheck },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    const selected = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setDrawerOpen(false);
                        }}
                        className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                          selected
                            ? "bg-emerald-500 text-slate-950"
                            : "text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-bold text-white truncate">
              Super Admin Emergency Console
            </span>
          </div>

          {activeAlerts.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("alerts")}
              className="min-h-[44px] px-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-1.5 shrink-0"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{activeAlerts.length} Alert</span>
            </button>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-5xl w-full mx-auto space-y-5">
          {feedback && (
            <div className="p-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Emergency Mobile Alert Card with 1-tap Release / Refund */}
          {activeAlerts.length > 0 && (
            <section className="p-4 sm:p-5 rounded-2xl border border-rose-500/40 bg-rose-950/30 space-y-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Critical Payment Dispute Detected
                  </h2>
                  <p className="text-xs text-rose-200/80 mt-0.5">
                    Tap directly on mobile to settle escrow immediately without opening a laptop.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {activeAlerts.map((dispute) => (
                  <div
                    key={dispute.id}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white break-words">
                          {dispute.jobTitle}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {dispute.freelancerName} • Failure {dispute.failureRatePct}% • ID{" "}
                          {dispute.id}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-amber-300 shrink-0">
                        ${dispute.grossAmount.toFixed(2)} {dispute.currency}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={busyId === dispute.id}
                        onClick={() => triggerEmergencyAction(dispute.id, "release")}
                        className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-sm font-bold inline-flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Release Escrow</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === dispute.id}
                        onClick={() => triggerEmergencyAction(dispute.id, "refund")}
                        className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4 shrink-0" />
                        <span>Refund</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Responsive Escrow Records: Mobile Cards (< md) + Desktop Table (md+) */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200">
              Active Escrow & Dispute Records
            </h3>

            <div className="space-y-3 md:hidden">
              {disputes.map((row) => (
                <div
                  key={row.id}
                  className="p-4 rounded-2xl border border-slate-800 bg-slate-900 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-white break-words">
                      {row.jobTitle}
                    </span>
                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-emerald-300 shrink-0">
                      {row.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {row.freelancerName} • ${row.grossAmount.toFixed(2)} {row.currency}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-xs text-slate-400 uppercase">
                  <tr>
                    <th className="px-4 py-3">Escrow ID</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Freelancer</th>
                    <th className="px-4 py-3">Gross</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {disputes.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                      <td className="px-4 py-3">{row.jobTitle}</td>
                      <td className="px-4 py-3">{row.freelancerName}</td>
                      <td className="px-4 py-3">
                        ${row.grossAmount.toFixed(2)} {row.currency}
                      </td>
                      <td className="px-4 py-3 uppercase text-xs font-bold text-emerald-300">
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* Mobile Admin Bottom Bar (< lg only) */}
      <nav
        aria-label="Mobile admin navigation"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-slate-800 bg-slate-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-4 h-16 px-1">
          <button
            type="button"
            onClick={() => setActiveTab("alerts")}
            className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
              activeTab === "alerts" ? "text-emerald-300" : "text-slate-400"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
            <span>Alerts</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("escrow")}
            className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
              activeTab === "escrow" ? "text-emerald-300" : "text-slate-400"
            }`}
          >
            <Landmark className="w-5 h-5" />
            <span>Escrow</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("safety")}
            className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
              activeTab === "safety" ? "text-emerald-300" : "text-slate-400"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span>Safety</span>
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-400"
          >
            <Menu className="w-5 h-5" />
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
