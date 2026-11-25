"use client";

import React, { useEffect, useState } from "react";

interface OfflineScript {
  id: string;
  title: string;
  orgOrClient: string;
  qaRubric: string;
  scriptBody: string;
}

export default function OfflinePage() {
  const [scripts, setScripts] = useState<OfflineScript[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("apex_offline_assigned_scripts_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setScripts(parsed);
      }
    } catch {
      // Ignore storage read failure offline
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#F8FAFF] text-[#0F172A] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl bg-[#0B1F3A] text-white p-6">
          <p className="text-xs font-semibold text-sky-300">
            Dutchkem Apex Data Copilot · Offline Mode
          </p>
          <h1 className="mt-1 text-xl font-bold">
            Assigned Recording Scripts Available Offline
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Review cached Job Board scripts and QA thresholds until your connection returns.
          </p>
        </header>

        <section className="space-y-4">
          {scripts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Open your dashboard or Job Board once while connected to sync scripts for offline viewing.
            </div>
          ) : (
            scripts.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2"
              >
                <p className="text-xs font-semibold text-blue-700">{item.orgOrClient}</p>
                <h2 className="text-base font-bold text-slate-950">{item.title}</h2>
                <p className="text-sm text-slate-700 whitespace-pre-line">{item.scriptBody}</p>
                <p className="text-xs font-mono text-slate-500">{item.qaRubric}</p>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
