import React, { useEffect, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, Clock, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";

interface PublicStatusSnapshot {
  statusPageUrl: string;
  overallStatus: "operational" | "degraded_performance" | "partial_outage" | "major_outage";
  probeIntervalSeconds: number;
  lastCheckedAt: string;
  uptime30dPct: number;
  activeDeploymentId: string;
  components: Array<{
    id: string;
    name: string;
    category: string;
    status: "operational" | "degraded_performance" | "partial_outage" | "major_outage";
    latencyMs: number;
    uptimePct30d: number;
    lastCheckedAt: string;
    detail: string;
  }>;
  heartbeatHistory: Array<{
    id: string;
    timestamp: string;
    overallStatus: string;
    healthyComponents: number;
    totalComponents: number;
    avgLatencyMs: number;
  }>;
  incidents: Array<{
    id: string;
    title: string;
    status: string;
    impact: string;
    createdAt: string;
    updatedAt: string;
    updates: Array<{
      timestamp: string;
      message: string;
      status: string;
    }>;
  }>;
}

interface PublicStatusPageViewProps {
  onReturnHomepage: () => void;
  onOpenJobBoard: () => void;
}

export function PublicStatusPageView({
  onReturnHomepage,
  onOpenJobBoard,
}: PublicStatusPageViewProps) {
  const [snapshot, setSnapshot] = useState<PublicStatusSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [secondsUntilProbe, setSecondsUntilProbe] = useState(60);

  async function loadStatus() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = (await res.json()) as PublicStatusSnapshot;
        setSnapshot(data);
        setSecondsUntilProbe(data.probeIntervalSeconds || 60);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadStatus();

    let evtSource: EventSource | null = null;
    if (typeof window !== "undefined" && typeof EventSource !== "undefined") {
      evtSource = new EventSource("/api/status/stream");
      evtSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as PublicStatusSnapshot;
          if (parsed && Array.isArray(parsed.components)) {
            setSnapshot(parsed);
            setSecondsUntilProbe(parsed.probeIntervalSeconds || 60);
          }
        } catch {
          // Ignore malformed SSE tick
        }
      };
    }

    const countdown = window.setInterval(() => {
      setSecondsUntilProbe((prev) => {
        if (prev <= 1) {
          void loadStatus();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(countdown);
      if (evtSource) evtSource.close();
    };
  }, []);

  const isOperational = snapshot?.overallStatus === "operational";

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Dutchkem Ventures · System Status
              </h1>
              <p className="font-mono text-xs text-slate-400">
                status.dutchkemventures.com · 60-second automated SRE probes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenJobBoard}
              className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Public Job Board
            </button>
            <button
              type="button"
              onClick={onReturnHomepage}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Apex Home</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
        {/* Global Status Banner */}
        <section
          className={`rounded-2xl border p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 ${
            isOperational
              ? "border-emerald-700/70 bg-emerald-950/30"
              : "border-amber-700/70 bg-amber-950/30"
          }`}
        >
          <div className="flex items-start gap-3">
            {isOperational ? (
              <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-7 h-7 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {snapshot
                  ? isOperational
                    ? "All Systems Operational"
                    : "Partial Service Degradation (Fallback Active)"
                  : "Connecting to Live Status Stream..."}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-300">
                30-Day Rolling Uptime:{" "}
                <span className="font-mono font-semibold text-emerald-300">
                  {snapshot?.uptime30dPct ?? 99.98}%
                </span>{" "}
                · Active Release:{" "}
                <span className="font-mono text-slate-200">
                  {snapshot?.activeDeploymentId ?? "dep-v23-active"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Next 60s probe in {secondsUntilProbe}s</span>
            </span>
            <button
              type="button"
              onClick={() => void loadStatus()}
              disabled={refreshing}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Probe Now</span>
            </button>
          </div>
        </section>

        {/* 60-Second Heartbeat Bars */}
        {snapshot && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                Real-Time 60-Second Automated Check Heartbeats (Last {snapshot.heartbeatHistory.length} Probes)
              </h3>
              <span className="font-mono text-[11px] text-slate-400">
                Last Probe: {new Date(snapshot.lastCheckedAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-end gap-1 pt-1">
              {snapshot.heartbeatHistory.map((tick) => (
                <div
                  key={tick.id}
                  title={`${tick.timestamp} — ${tick.overallStatus} (${tick.healthyComponents}/${tick.totalComponents} healthy, ${tick.avgLatencyMs}ms)`}
                  className={`flex-1 min-w-[4px] h-8 rounded-sm transition-colors ${
                    tick.overallStatus === "operational"
                      ? "bg-emerald-500/80 hover:bg-emerald-400"
                      : tick.overallStatus === "degraded_performance"
                      ? "bg-amber-500/80 hover:bg-amber-400"
                      : "bg-red-500/80 hover:bg-red-400"
                  }`}
                />
              ))}
            </div>
          </section>
        )}

        {/* Component Status List */}
        {snapshot && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800">
            {snapshot.components.map((comp) => (
              <div
                key={comp.id}
                className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck
                      className={`w-4 h-4 ${
                        comp.status === "operational" ? "text-emerald-400" : "text-amber-400"
                      }`}
                    />
                    <span className="text-sm font-semibold text-white">{comp.name}</span>
                    <span className="font-mono text-[11px] text-slate-500">({comp.category})</span>
                  </div>
                  <p className="text-xs text-slate-400 pl-6">{comp.detail}</p>
                </div>
                <div className="text-right font-mono text-xs space-y-0.5">
                  <div
                    className={
                      comp.status === "operational" ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"
                    }
                  >
                    {comp.status === "operational" ? "OPERATIONAL" : "DEGRADED FALLBACK"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {comp.uptimePct30d}% uptime · {comp.latencyMs}ms
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Recent Incidents & Zero-Downtime Events */}
        {snapshot && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Recent Incidents &amp; Deployment Notices</h3>
            <div className="space-y-3">
              {snapshot.incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-white">{inc.title}</h4>
                    <span className="font-mono text-[11px] uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {inc.status}
                    </span>
                  </div>
                  {inc.updates.map((upd, idx) => (
                    <p key={idx} className="text-xs text-slate-300">
                      <span className="font-mono text-slate-500 mr-2">
                        [{new Date(upd.timestamp).toLocaleString()}]
                      </span>
                      {upd.message}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
