"use client";

import React, { useState } from "react";

interface JobLead {
  id: string;
  source_board: string;
  title: string;
  budget_display: string;
  matched_keywords: string[];
  extracted_requirements: string[];
  status: string;
}

export default function SalesAgentPage({ initialLeads }: { initialLeads: JobLead[] }) {
  const [leads, setLeads] = useState<JobLead[]>(initialLeads ?? []);
  const [keywords, setKeywords] = useState("TTS, Audio QA, Data Annotation, Spanish Native");
  const [scraping, setScraping] = useState(false);

  async function handleRunScrape() {
    setScraping(true);
    try {
      await fetch("/api/v1/sales-agent/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        }),
      });
    } finally {
      setScraping(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Auto-Bidder Sales Agent</h1>
          <p className="mt-1 text-sm text-slate-600">
            Scrapes Upwork, Mercor, AfterQuery, and TELUS Digital for matching QA & annotation contracts.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRunScrape}
          disabled={scraping}
          className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md"
        >
          {scraping ? "Scanning Boards..." : "Run Scraper"}
        </button>
      </div>

      <div className="border border-slate-200 bg-white rounded-lg p-4">
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Target Scraper Keywords
        </label>
        <input
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
        />
      </div>

      <div className="border border-slate-200 bg-white rounded-lg divide-y divide-slate-200">
        {leads.map((lead) => (
          <div key={lead.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">{lead.title}</p>
              <p className="text-xs text-slate-500">
                {lead.source_board} · {lead.budget_display} · {lead.status}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-600">
              {lead.extracted_requirements.join(", ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
