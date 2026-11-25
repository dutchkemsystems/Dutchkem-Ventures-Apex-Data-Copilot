import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { PHASE_1_ARTIFACTS } from "../data/phase1CodeArtifacts";

export function BlueprintViewer() {
  const [phaseFilter, setPhaseFilter] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23>(23);
  const visibleArtifacts = PHASE_1_ARTIFACTS.filter((a) => a.phase === phaseFilter);
  const [selectedId, setSelectedId] = useState(visibleArtifacts[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeArtifact =
    visibleArtifacts.find((a) => a.id === selectedId) ?? visibleArtifacts[0];

  function handleSelectPhase(phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23) {
    setPhaseFilter(phase);
    const first = PHASE_1_ARTIFACTS.find((a) => a.phase === phase);
    if (first) setSelectedId(first.id);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeArtifact.code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = activeArtifact.code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedId(activeArtifact.id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Architecture Blueprints · Python FastAPI + PostgreSQL RLS + Next.js App Router
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Phase {phaseFilter} Production Code
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Production source files saved in{" "}
            <span className="font-mono text-xs">/phase{phaseFilter}_architecture</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
          <button
            type="button"
            onClick={() => handleSelectPhase(1)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 1
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 1 · Core & RLS
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(2)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 2
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 2 · Auto-Bidder
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(3)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 3
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 3 · QA Engines
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(4)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 4
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 4 · Factory & Red-Team
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(5)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 5
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 5 · Marketplace
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(6)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 6
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 6 · Live & Simulator
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(7)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 7
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 7 · Homepage
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(8)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 8
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 8 · Settings & Auth
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(9)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 9
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 9 · Kora Pay & Pricing
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(10)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 10
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 10 · Payments & Webhooks
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(11)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 11
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 11 · Automated SEO
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(12)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 12
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 12 · Legal & NDPA
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(13)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 13
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 13 · Deployment &amp; Docker
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(14)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 14
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 14 · B2B API Gateway
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(15)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 15
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 15 · Two-Sided Job Board
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(16)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 16
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 16 · Affiliates &amp; Referrals
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(17)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 17
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 17 · Dynamic Pricing &amp; Insights
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(18)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 18
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 18A–18F · Kora Escrow
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(19)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 19
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 19 · Three-Plane Auth
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(20)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 20
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 20 · Trust &amp; Safety
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(21)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 21
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 21 · Enterprise Moat
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(22)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 22
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 22A · PWA Foundation
          </button>
          <button
            type="button"
            onClick={() => handleSelectPhase(23)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              phaseFilter === 23
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Phase 23 · Autonomous DevOps
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
        {visibleArtifacts.map((artifact) => (
          <button
            key={artifact.id}
            type="button"
            onClick={() => setSelectedId(artifact.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeArtifact.id === artifact.id
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {artifact.title}
          </button>
        ))}
      </div>

      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {activeArtifact.title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono">{activeArtifact.path}</span> ·{" "}
              {activeArtifact.description}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {copiedId === activeArtifact.id ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-6 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
          <code>{activeArtifact.code}</code>
        </pre>
      </section>
    </div>
  );
}
