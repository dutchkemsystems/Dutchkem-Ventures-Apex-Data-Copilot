"use client";

import React, { useEffect, useState } from "react";

interface JobItem {
  id: string;
  title: string;
  clientOrgName: string;
  budgetUsd: number;
  status: "awaiting_listing_fee" | "open" | "in_progress" | "completed";
  escrowStatus: "unfunded" | "funded" | "released" | "qa_rejected";
}

export default function TwoSidedJobBoardPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [title, setTitle] = useState("Need 450 Spanish Audio Utterances (24kHz Mono)");
  const [budgetUsd, setBudgetUsd] = useState("3600");

  useEffect(() => {
    fetch("/api/marketplace-jobs")
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => setJobs(d.jobs ?? []));
  }, []);

  async function handlePostJob(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/marketplace-jobs/post/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: "Studio 24kHz Mono WAV with SNR > 35dB and Whisper WER < 2%.",
        qaType: "audio",
        budgetUsd: Number(budgetUsd),
        currency: "NGN",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      await fetch("/api/marketplace-jobs/post/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: data.reference, gatewayStatus: "success" }),
      });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 space-y-8">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Two-Sided AI Data Job Board</h1>
          <p className="text-sm text-slate-600">
            AI Labs pay $500 via Kora Pay to post verified cohorts · Freelancers earn 85% via QA-gated escrow.
          </p>
        </div>
      </header>

      <form onSubmit={handlePostJob} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        <input value={budgetUsd} onChange={(e) => setBudgetUsd(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white">
          Post a Job ($500 Kora Pay Fee)
        </button>
      </form>

      <section className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
        {jobs.map((job) => (
          <div key={job.id} className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900">{job.title}</p>
              <p className="text-xs text-slate-500">{job.clientOrgName} · {job.status} · Escrow: {job.escrowStatus}</p>
            </div>
            <p className="font-mono tabular-nums font-bold text-emerald-700">${job.budgetUsd.toLocaleString()}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
