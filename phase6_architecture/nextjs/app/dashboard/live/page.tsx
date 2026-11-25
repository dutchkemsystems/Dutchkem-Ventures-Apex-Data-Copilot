"use client";

import React, { useEffect, useState } from "react";

interface TelemetryMessage {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export default function LiveOperationsAndSimulatorPage({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<TelemetryMessage[]>([]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws/telemetry?orgId=${encodeURIComponent(orgId)}&userId=${encodeURIComponent(userId)}`
    );

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (msg) => {
      const parsed = JSON.parse(msg.data) as TelemetryMessage;
      setEvents((prev) => [parsed, ...prev].slice(0, 40));
    };

    return () => socket.close();
  }, [orgId, userId]);

  return (
    <section className="space-y-6 p-8">
      <header className="border-b border-slate-200 pb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Phase 6 · WebSocket Telemetry & Ethical Practice Coaching
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Live Operations & Mock Interview Simulator
          </h1>
        </div>
        <span className="text-xs font-mono text-slate-700">
          {connected ? "WebSocket Connected" : "Reconnecting..."}
        </span>
      </header>

      <div className="border border-slate-200 bg-white rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Real-Time Organization Event Stream
        </h2>
        <div className="divide-y divide-slate-200">
          {events.map((ev, idx) => (
            <div key={`${ev.timestamp}-${idx}`} className="py-2.5 text-xs flex justify-between">
              <span className="font-mono text-slate-800">{ev.type}</span>
              <span className="font-mono tabular-nums text-slate-500">{ev.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
