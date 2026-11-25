import React, { useEffect, useState } from "react";
import { Check, Plus, RefreshCw, Send, Sparkles, X } from "lucide-react";
import type { JobBoard, JobLead } from "../types/tenant";

interface SalesAgentViewProps {
  orgId: string;
  orgName: string;
  userId: string;
}

const BOARD_LABELS: Record<JobBoard, string> = {
  upwork: "Upwork",
  mercor: "Mercor",
  afterquery: "AfterQuery",
  telus_digital: "TELUS Digital",
};

const ALL_BOARDS: JobBoard[] = ["upwork", "mercor", "afterquery", "telus_digital"];

export function SalesAgentView({ orgId, orgName, userId }: SalesAgentViewProps) {
  const [leads, setLeads] = useState<JobLead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "scraped" | "proposal_drafted" | "submitted">("all");
  const [keywordsInput, setKeywordsInput] = useState(
    "TTS, Audio QA, Data Annotation, Spanish Native, Red-Team"
  );
  const [selectedBoards, setSelectedBoards] = useState<JobBoard[]>(ALL_BOARDS);

  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom JD ingestion state
  const [customBoard, setCustomBoard] = useState<JobBoard>("upwork");
  const [customTitle, setCustomTitle] = useState("");
  const [customClient, setCustomClient] = useState("");
  const [customBudget, setCustomBudget] = useState("$95.00 / hr");
  const [customDescription, setCustomDescription] = useState("");

  // Editable auto-application form state
  const [proposalDraft, setProposalDraft] = useState("");
  const [proposedRate, setProposedRate] = useState("90");
  const [turnaroundDays, setTurnaroundDays] = useState("5");
  const [screeningAnswer, setScreeningAnswer] = useState("");

  async function fetchLeads() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/sales-agent/leads", {
        credentials: "include",
        headers: { "x-org-id": orgId, "x-user-id": userId },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Unable to load sales agent leads.");
      }
      const data = (await res.json()) as { leads: JobLead[] };
      setLeads(data.leads);
      if (data.leads.length > 0) {
        setSelectedLeadId((prev) =>
          data.leads.some((l) => l.id === prev) ? prev : data.leads[0].id
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLeads();
  }, [orgId, userId]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;

  useEffect(() => {
    if (selectedLead?.submission) {
      setProposalDraft(selectedLead.submission.proposal_text);
      setProposedRate(String(selectedLead.submission.proposed_rate));
      setTurnaroundDays(String(selectedLead.submission.turnaround_days));
      setScreeningAnswer(selectedLead.submission.screening_answer);
    } else {
      setProposalDraft("");
      setProposedRate("88");
      setTurnaroundDays("5");
      setScreeningAnswer("");
    }
  }, [selectedLead?.id, selectedLead?.submission?.proposal_text]);

  function toggleBoard(board: JobBoard) {
    setSelectedBoards((prev) =>
      prev.includes(board)
        ? prev.length > 1
          ? prev.filter((b) => b !== board)
          : prev
        : [...prev, board]
    );
  }

  async function handleRunScraper() {
    setScraping(true);
    setErrorMessage(null);
    setBannerMessage(null);
    try {
      const keywords = keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const res = await fetch("/api/sales-agent/scrape", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({ boards: selectedBoards, keywords }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Scraper run failed.");
      setLeads(body.leads);
      if (body.leads.length > 0 && !selectedLeadId) {
        setSelectedLeadId(body.leads[0].id);
      }
      setBannerMessage(
        body.ingestedCount > 0
          ? `Scraper ingested ${body.ingestedCount} new matching contract leads.`
          : "Scraper scan complete. All matching board opportunities are already in your queue."
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Scraper run failed.");
    } finally {
      setScraping(false);
    }
  }

  async function handleAddCustomLead(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const res = await fetch("/api/sales-agent/leads", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          source_board: customBoard,
          title: customTitle,
          client_name: customClient,
          budget_display: customBudget,
          raw_description: customDescription,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Failed to add job lead.");
      setLeads((prev) => [body.lead, ...prev]);
      setSelectedLeadId(body.lead.id);
      setCustomTitle("");
      setCustomClient("");
      setCustomDescription("");
      setShowCustomForm(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to add job lead.");
    }
  }

  async function handleGenerateProposal() {
    if (!selectedLead) return;
    setGenerating(true);
    setErrorMessage(null);
    setBannerMessage(null);
    try {
      const res = await fetch(
        `/api/sales-agent/leads/${selectedLead.id}/generate-proposal`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
            "x-user-id": userId,
          },
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Proposal generation failed.");
      }
      const updatedLead = body.lead as JobLead;
      setLeads((prev) =>
        prev.map((l) => (l.id === updatedLead.id ? updatedLead : l))
      );
      if (updatedLead.submission) {
        setProposalDraft(updatedLead.submission.proposal_text);
        setProposedRate(String(updatedLead.submission.proposed_rate));
        setTurnaroundDays(String(updatedLead.submission.turnaround_days));
        setScreeningAnswer(updatedLead.submission.screening_answer);
      }
      setBannerMessage(
        "Generated tailored 3-paragraph agency proposal and extracted requirements."
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Proposal generation error."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleAutoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLead) return;
    setSubmitting(true);
    setErrorMessage(null);
    setBannerMessage(null);
    try {
      const res = await fetch(
        `/api/sales-agent/leads/${selectedLead.id}/submit`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
            "x-user-id": userId,
          },
          body: JSON.stringify({
            proposal_text: proposalDraft,
            proposed_rate: Number(proposedRate) || 85,
            turnaround_days: Number(turnaroundDays) || 5,
            screening_answer: screeningAnswer,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Auto-submission failed.");
      const updatedLead = body.lead as JobLead;
      setLeads((prev) =>
        prev.map((l) => (l.id === updatedLead.id ? updatedLead : l))
      );
      setBannerMessage(
        `Application auto-submitted to ${BOARD_LABELS[updatedLead.source_board]} for ${updatedLead.title}.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Auto-submission failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const filteredLeads = leads.filter((l) =>
    statusFilter === "all" ? true : l.status === statusFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Phase 2 · Auto-Bidder Sales Agent · {orgName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Contract Acquisition & Proposal Engine
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Scrapes Upwork, Mercor, AfterQuery, and TELUS Digital, parses requirements with Gemini, and auto-fills application forms.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCustomForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-800 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            {showCustomForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showCustomForm ? "Close Custom JD" : "Paste Job Description"}</span>
          </button>
          <button
            type="button"
            onClick={handleRunScraper}
            disabled={scraping}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scraping ? "animate-spin" : ""}`} />
            <span>{scraping ? "Scanning Boards..." : "Run Scraper Worker"}</span>
          </button>
        </div>
      </div>

      {/* Scraper Controls Bar */}
      <section className="border border-slate-200 bg-white rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
          <div className="lg:col-span-2">
            <label
              htmlFor="scraper-keywords"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Target Keywords (comma-separated)
            </label>
            <input
              id="scraper-keywords"
              type="text"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700 mb-1.5">
              Enabled Job Boards
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_BOARDS.map((board) => {
                const active = selectedBoards.includes(board);
                return (
                  <button
                    key={board}
                    type="button"
                    onClick={() => toggleBoard(board)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      active
                        ? "bg-[#0F172A] text-white border-[#0F172A]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {BOARD_LABELS[board]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-md text-sm">
          {errorMessage}
        </div>
      )}

      {bannerMessage && (
        <div className="p-4 border border-emerald-200 bg-emerald-50/70 text-emerald-900 rounded-md text-sm flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Optional Custom JD Form */}
      {showCustomForm && (
        <form
          onSubmit={handleAddCustomLead}
          className="border border-slate-200 bg-white rounded-lg p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Ingest Custom Job Listing for AI Proposal Generation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Source Board
              </label>
              <select
                value={customBoard}
                onChange={(e) => setCustomBoard(e.target.value as JobBoard)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
              >
                {ALL_BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {BOARD_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Job Title
              </label>
              <input
                type="text"
                required
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g., Spanish Native TTS Evaluation Lead (SNR > 35dB)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Client / Budget
              </label>
              <input
                type="text"
                value={customBudget}
                onChange={(e) => setCustomBudget(e.target.value)}
                placeholder="$95.00 / hr"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Client Name
              </label>
              <input
                type="text"
                value={customClient}
                onChange={(e) => setCustomClient(e.target.value)}
                placeholder="Acme Voice AI"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Job Description
              </label>
              <textarea
                rows={3}
                required
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Paste job requirements (e.g., 24kHz Mono WAV, SNR > 35dB, IoU >= 0.70, Whisper WER)..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800"
            >
              Add to Lead Queue
            </button>
          </div>
        </form>
      )}

      {/* Split Master-Detail Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Lead Queue */}
        <section className="lg:col-span-5 border border-slate-200 bg-white rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Matched Contracts ({filteredLeads.length})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
              {(["all", "scraped", "proposal_drafted", "submitted"] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      statusFilter === st
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {st === "all"
                      ? "All"
                      : st === "proposal_drafted"
                        ? "Drafted"
                        : st}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-200 max-h-[640px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-sm text-slate-500 text-center">
                Loading tenant job leads...
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-8 text-sm text-slate-500 text-center">
                No job leads match this filter. Run the scraper worker to ingest contracts.
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const isSelected = lead.id === selectedLead?.id;
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full text-left px-5 py-4 transition-colors block ${
                      isSelected ? "bg-slate-50" : "hover:bg-slate-50/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {BOARD_LABELS[lead.source_board]} · {lead.client_name}
                      </span>
                      <span
                        className={`font-medium capitalize ${
                          lead.status === "submitted"
                            ? "text-emerald-700"
                            : lead.status === "proposal_drafted"
                              ? "text-blue-700"
                              : "text-slate-600"
                        }`}
                      >
                        {lead.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-slate-900 leading-snug">
                      {lead.title}
                    </p>
                    <p className="mt-1.5 text-xs font-mono tabular-nums text-slate-600">
                      {lead.budget_display} · {lead.extracted_requirements.slice(0, 2).join(" / ")}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right: Proposal Generator & Auto-Application Form */}
        <section className="lg:col-span-7 border border-slate-200 bg-white rounded-lg p-6 space-y-5">
          {selectedLead ? (
            <>
              <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">
                    {BOARD_LABELS[selectedLead.source_board]} ·{" "}
                    {selectedLead.client_name} ·{" "}
                    <span className="font-mono tabular-nums text-slate-800">
                      {selectedLead.budget_display}
                    </span>
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    {selectedLead.title}
                  </h2>
                  <p className="mt-1.5 text-xs text-slate-600">
                    Detected Requirements:{" "}
                    <span className="font-mono text-slate-800">
                      {selectedLead.extracted_requirements.join(" · ")}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateProposal}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {generating
                      ? "Drafting with Gemini..."
                      : selectedLead.submission
                        ? "Regenerate 3-Para Proposal"
                        : "Generate 3-Para Proposal"}
                  </span>
                </button>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 mb-1.5">
                  Parsed Job Description
                </p>
                <p className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 leading-relaxed">
                  {selectedLead.raw_description}
                </p>
              </div>

              <form onSubmit={handleAutoSubmit} className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Auto-Application Payload ({BOARD_LABELS[selectedLead.source_board]} Form)
                  </h3>
                  {selectedLead.submission?.submitted_at && (
                    <span className="text-xs font-mono text-emerald-700">
                      Submitted {new Date(selectedLead.submission.submitted_at).toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Proposed Bid Rate (USD)
                    </label>
                    <input
                      type="number"
                      min={15}
                      step="1"
                      value={proposedRate}
                      onChange={(e) => setProposedRate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Estimated Turnaround (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={turnaroundDays}
                      onChange={(e) => setTurnaroundDays(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Screening Question Auto-Response
                  </label>
                  <input
                    type="text"
                    value={screeningAnswer}
                    onChange={(e) => setScreeningAnswer(e.target.value)}
                    placeholder="Generate a proposal or type a concise screening response..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>

                <div
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                  className="select-none"
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">
                      3-Paragraph Agency Proposal
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">
                      Copy/Replication Shield Active
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    required
                    value={proposalDraft}
                    onChange={(e) => setProposalDraft(e.target.value)}
                    placeholder="Click 'Generate 3-Para Proposal' to synthesize a tailored bid via Gemini..."
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md leading-relaxed select-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <p className="text-xs text-slate-500">
                    Target URL:{" "}
                    <span className="font-mono text-slate-700">{selectedLead.job_url}</span>
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || !proposalDraft.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {submitting
                        ? "Submitting..."
                        : selectedLead.status === "submitted"
                          ? "Resubmit Application"
                          : "Auto-Submit Application"}
                    </span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              Select a scraped contract on the left to inspect requirements and generate a 3-paragraph proposal.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
