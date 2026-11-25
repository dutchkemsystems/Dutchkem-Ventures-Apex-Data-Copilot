import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileAudio, Upload, UserPlus, XCircle } from "lucide-react";
import type {
  AudioQaReport,
  ExpertProfile,
  MarketplaceBatch,
  PayoutRail,
  PayoutTransaction,
  UserRole,
} from "../types/tenant";

interface MarketplaceViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userRole: UserRole;
  onSettled: () => Promise<void> | void;
}

type MarketplaceTab = "batches" | "directory" | "payouts";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read WAV file."));
    reader.readAsDataURL(file);
  });
}

export function MarketplaceView({
  orgId,
  orgName,
  userId,
  userRole,
  onSettled,
}: MarketplaceViewProps) {
  const isAdmin = userRole === "admin";
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("batches");
  const [experts, setExperts] = useState<ExpertProfile[]>([]);
  const [batches, setBatches] = useState<MarketplaceBatch[]>([]);
  const [payouts, setPayouts] = useState<PayoutTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Batch submission & Audio QA state
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [uploadedWavBase64, setUploadedWavBase64] = useState<string>("");
  const [runStt, setRunStt] = useState(false);
  const [submittingAudio, setSubmittingAudio] = useState(false);
  const [latestQaReport, setLatestQaReport] = useState<AudioQaReport | null>(
    null
  );
  const [latestPayout, setLatestPayout] = useState<PayoutTransaction | null>(
    null
  );

  // Admin: Onboard expert form
  const [expName, setExpName] = useState("");
  const [expEmail, setExpEmail] = useState("");
  const [expLocale, setExpLocale] = useState("es-ES");
  const [expDialect, setExpDialect] = useState("Castilian");
  const [expSpecialty, setExpSpecialty] = useState("Native Voice & Prosody");
  const [expRate, setExpRate] = useState("30");
  const [expRail, setExpRail] = useState<PayoutRail>("kora_pay_global");
  const [expAccountRef, setExpAccountRef] = useState("");
  const [onboardingExpert, setOnboardingExpert] = useState(false);

  // Admin: Directory filter
  const [localeFilter, setLocaleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Admin: Create batch form
  const [batchClient, setBatchClient] = useState("TELUS Digital AI");
  const [batchTitle, setBatchTitle] = useState("");
  const [batchLocale, setBatchLocale] = useState("es-ES");
  const [batchBudget, setBatchBudget] = useState("240");
  const [batchExpertId, setBatchExpertId] = useState("");
  const [batchScript, setBatchScript] = useState(
    "Confirmo que la grabación cumple con veinticuatro kilohercios en canal mono y sin ruido de fondo."
  );
  const [creatingBatch, setCreatingBatch] = useState(false);

  const loadMarketplace = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/marketplace", {
        credentials: "include",
        headers: { "x-org-id": orgId, "x-user-id": userId },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to load Expert Marketplace.");
      }
      const data = (await res.json()) as {
        experts: ExpertProfile[];
        batches: MarketplaceBatch[];
        payouts: PayoutTransaction[];
      };
      setExperts(data.experts);
      setBatches(data.batches);
      setPayouts(data.payouts);
      setSelectedBatchId((prev) =>
        data.batches.some((b) => b.id === prev)
          ? prev
          : data.batches[0]?.id ?? ""
      );
      setBatchExpertId((prev) =>
        data.experts.some((e) => e.id === prev)
          ? prev
          : data.experts[0]?.id ?? ""
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Marketplace sync error."
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    loadMarketplace();
  }, [loadMarketplace]);

  const activeBatch =
    batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null;
  const activeExpert = activeBatch
    ? experts.find((e) => e.id === activeBatch.assigned_expert_id) ?? null
    : null;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const b64 = await fileToBase64(file);
      if (!b64) {
        setErrorMsg("Selected WAV file appears empty or corrupted.");
        return;
      }
      setUploadedFileName(file.name);
      setUploadedWavBase64(b64);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to read WAV file from disk."
      );
    }
  }

  async function handleSubmitAudio(preset?: "pass" | "fail") {
    if (!activeBatch) return;
    if (!preset && !uploadedWavBase64) {
      setErrorMsg("Please upload a .wav recording or choose a quick verification fixture.");
      return;
    }
    setSubmittingAudio(true);
    setErrorMsg(null);
    setStatusBanner(null);
    setLatestPayout(null);

    try {
      const payload = preset
        ? { preset, runStt: false }
        : {
            wavBase64: uploadedWavBase64,
            fileName: uploadedFileName || "human_recording.wav",
            runStt,
          };

      const res = await fetch(
        `/api/marketplace/batches/${activeBatch.id}/submit-audio`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
            "x-user-id": userId,
          },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Audio QA validation failed.");
      }

      setLatestQaReport(body.qaReport);
      setLatestPayout(body.payout ?? null);

      if (body.settled) {
        setStatusBanner(
          `Audio QA passed (${body.qaReport.snrDb.toFixed(1)} dB SNR). Settled $${Number(body.payout.expert_payout_80pct).toFixed(2)} via ${body.payout.payout_rail === "kora_pay_global" ? "Kora Pay Global (USD/GBP)" : "Kora Pay Domestic (NGN)"} (${body.payout.external_transfer_id}) and delivered batch to ${activeBatch.client_name}.`
        );
        setUploadedFileName("");
        setUploadedWavBase64("");
        await loadMarketplace();
        await onSettled();
      } else {
        setStatusBanner(
          `Audio QA rejected (${body.qaReport.failureReasons.length} violation${body.qaReport.failureReasons.length === 1 ? "" : "s"}). Escrow remains held with $0.00 disbursed.`
        );
        await loadMarketplace();
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Audio submission failed."
      );
    } finally {
      setSubmittingAudio(false);
    }
  }

  async function handleOnboardExpert(e: React.FormEvent) {
    e.preventDefault();
    setOnboardingExpert(true);
    setErrorMsg(null);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/marketplace/experts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          full_name: expName,
          email: expEmail,
          native_locale: expLocale,
          dialect: expDialect,
          specialty: expSpecialty,
          hourly_rate: Number(expRate) || 30,
          payout_rail: expRail,
          payout_account_ref: expAccountRef,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to onboard expert.");
      }
      setExpName("");
      setExpEmail("");
      setExpAccountRef("");
      setStatusBanner(
        `Onboarded ${body.expert.full_name} (${body.expert.native_locale}) on ${body.expert.payout_rail}.`
      );
      await loadMarketplace();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Expert onboarding failed."
      );
    } finally {
      setOnboardingExpert(false);
    }
  }

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!batchExpertId) return;
    setCreatingBatch(true);
    setErrorMsg(null);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/marketplace/batches", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          client_name: batchClient,
          title: batchTitle || `${batchLocale} Native Recording Batch`,
          target_locale: batchLocale,
          script_text: batchScript,
          budget_amount: Number(batchBudget) || 240,
          assigned_expert_id: batchExpertId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to assign batch.");
      }
      setBatchTitle("");
      setSelectedBatchId(body.batch.id);
      setStatusBanner(
        `Assigned batch "${body.batch.title}" ($${Number(body.batch.budget_amount).toFixed(2)}) for native recording.`
      );
      await loadMarketplace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Batch creation failed.");
    } finally {
      setCreatingBatch(false);
    }
  }

  const totalSettledExpert = payouts.reduce(
    (sum, p) => sum + p.expert_payout_80pct,
    0
  );
  const totalAgencyFees = payouts.reduce(
    (sum, p) => sum + (p.platform_fee_20pct ?? 0),
    0
  );
  const openBatchesCount = batches.filter(
    (b) => b.status !== "delivered_and_paid"
  ).length;

  const uniqueLocales = Array.from(new Set(experts.map((e) => e.native_locale)));
  const filteredExperts = experts.filter((expert) => {
    const matchesLocale =
      localeFilter === "all" || expert.native_locale === localeFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      expert.full_name.toLowerCase().includes(q) ||
      expert.dialect.toLowerCase().includes(q) ||
      expert.native_locale.toLowerCase().includes(q);
    return matchesLocale && matchesQuery;
  });

  const shownQaReport = latestQaReport ?? activeBatch?.last_qa_report ?? null;

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {orgName} · Human-in-the-Loop Native Speakers · Kora Pay Local & Global Payouts
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Expert Marketplace & Automated Payout Gate
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Vetted native speakers record platform scripts, pass real-time WAV DSP checks, and receive instant 80% escrow payouts while retaining the 20% agency margin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
          <button
            type="button"
            onClick={() => setActiveTab("batches")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "batches"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Recording Queue & QA Payout
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "directory"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Expert Directory ({experts.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("payouts")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "payouts"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Payout Settlements ({payouts.length})
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 bg-white rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">
            {isAdmin ? "Vetted Native Speakers" : "Active Speaker Profile"}
          </p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {experts.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {uniqueLocales.join(", ") || "No locales"}
          </p>
        </div>

        <div className="border border-slate-200 bg-white rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Pending QA Batches</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {openBatchesCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Awaiting 24kHz Mono WAV validation
          </p>
        </div>

        <div className="border border-slate-200 bg-white rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">
            {isAdmin ? "Expert Payouts Settled (80%)" : "Your Settled Payouts (80%)"}
          </p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-emerald-700">
            ${totalSettledExpert.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Kora Pay Domestic (NGN) & Global (USD/GBP) rails
          </p>
        </div>

        <div className="border border-slate-200 bg-white rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">
            {isAdmin ? "Agency Cut Retained (20%)" : "Audio QA Gate Threshold"}
          </p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {isAdmin ? `$${totalAgencyFees.toFixed(2)}` : "> 35 dB SNR"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isAdmin
              ? "Auto-booked on delivery"
              : "Mono · 24kHz · Peak -6..-3 dBFS"}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-md text-sm">
          {errorMsg}
        </div>
      )}

      {statusBanner && (
        <div className="p-4 border border-slate-200 bg-white text-slate-800 rounded-md text-sm">
          {statusBanner}
        </div>
      )}

      {loading ? (
        <div className="h-64 border border-slate-200 bg-white rounded-lg animate-pulse" />
      ) : activeTab === "batches" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Assigned Batches & Admin Batch Creation */}
          <div className="lg:col-span-5 space-y-6">
            <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">
                  Human Recording Batches
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a batch to inspect script prompts and run Audio QA escrow release.
                </p>
              </div>

              {batches.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  No marketplace batches assigned under your current persona.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {batches.map((batch) => {
                    const speaker = experts.find(
                      (e) => e.id === batch.assigned_expert_id
                    );
                    const isSelected = activeBatch?.id === batch.id;
                    return (
                      <button
                        key={batch.id}
                        type="button"
                        onClick={() => {
                          setSelectedBatchId(batch.id);
                          setLatestQaReport(batch.last_qa_report);
                          setLatestPayout(null);
                        }}
                        className={`w-full text-left px-5 py-4 transition-colors ${
                          isSelected ? "bg-slate-50" : "hover:bg-slate-50/70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900">
                            {batch.title}
                          </p>
                          <span className="font-mono tabular-nums text-xs font-medium text-slate-900 shrink-0">
                            ${batch.budget_amount.toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {batch.client_name} · {batch.target_locale}
                          {speaker ? ` · ${speaker.full_name}` : ""}
                        </p>
                        <p
                          className={`mt-1.5 text-xs font-medium ${
                            batch.status === "delivered_and_paid"
                              ? "text-emerald-700"
                              : batch.status === "qa_failed"
                                ? "text-red-700"
                                : "text-amber-700"
                          }`}
                        >
                          {batch.status === "delivered_and_paid"
                            ? "Delivered & Paid (Escrow Released)"
                            : batch.status === "qa_failed"
                              ? "QA Rejected (Escrow Held)"
                              : "Assigned · Awaiting WAV Upload"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {isAdmin && (
              <form
                onSubmit={handleCreateBatch}
                className="border border-slate-200 bg-white rounded-lg p-5 space-y-4"
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Dispatch New Script Batch
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Route client voice scripts to a vetted native speaker.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Client Name
                    </label>
                    <input
                      type="text"
                      value={batchClient}
                      onChange={(e) => setBatchClient(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Gross Budget (USD)
                    </label>
                    <input
                      type="number"
                      min="30"
                      step="10"
                      value={batchBudget}
                      onChange={(e) => setBatchBudget(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-md text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Batch Title
                  </label>
                  <input
                    type="text"
                    value={batchTitle}
                    onChange={(e) => setBatchTitle(e.target.value)}
                    placeholder="TELUS ES-ES Customer Care Prompt Set"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Assigned Expert
                    </label>
                    <select
                      value={batchExpertId}
                      onChange={(e) => {
                        setBatchExpertId(e.target.value);
                        const match = experts.find(
                          (x) => x.id === e.target.value
                        );
                        if (match) setBatchLocale(match.native_locale);
                      }}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-900"
                    >
                      {experts.map((expert) => (
                        <option key={expert.id} value={expert.id}>
                          {expert.full_name} ({expert.native_locale})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Target Locale
                    </label>
                    <input
                      type="text"
                      value={batchLocale}
                      onChange={(e) => setBatchLocale(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Recording Script Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={batchScript}
                    onChange={(e) => setBatchScript(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creatingBatch || experts.length === 0}
                  className="w-full px-4 py-2 text-xs font-medium text-white bg-[#0F172A] rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {creatingBatch ? "Assigning Batch..." : "Assign Batch to Speaker"}
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Submission, Audio QA Validation Gate & Payout Receipt */}
          <div className="lg:col-span-7 space-y-6">
            {activeBatch ? (
              <section className="border border-slate-200 bg-white rounded-lg p-6 space-y-6">
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      {activeBatch.client_name} · {activeBatch.target_locale} ·{" "}
                      {activeExpert
                        ? `${activeExpert.full_name} ($${activeExpert.hourly_rate.toFixed(2)}/hr via ${activeExpert.payout_rail === "kora_pay_global" ? "Kora Pay Global" : "Kora Pay Domestic"})`
                        : "Assigned Speaker"}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">
                      {activeBatch.title}
                    </h2>
                  </div>

                  <div className="text-right font-mono tabular-nums shrink-0">
                    <p className="text-sm font-semibold text-slate-900">
                      ${activeBatch.budget_amount.toFixed(2)} Gross
                    </p>
                    <p className="text-xs text-slate-500">
                      80% Expert: ${(activeBatch.budget_amount * 0.8).toFixed(2)}
                      {isAdmin
                        ? ` · 20% Fee: $${(activeBatch.budget_amount * 0.2).toFixed(2)}`
                        : ""}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">
                    Target Native Script
                  </p>
                  <p className="p-4 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-800 leading-relaxed">
                    "{activeBatch.script_text}"
                  </p>
                </div>

                {activeBatch.status !== "delivered_and_paid" ? (
                  <div className="space-y-4 border-t border-slate-200 pt-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          WAV Upload & Automated Audio QA Gate
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Requires Mono · 24kHz · Peak -6 to -3 dBFS · Noise Floor &lt; -70 dBFS · SNR &gt; 35 dB
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={runStt}
                          onChange={(e) => setRunStt(e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        Run STT WER Check
                      </label>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <label className="flex-1 flex items-center justify-between px-4 py-2.5 border border-dashed border-slate-300 rounded-md bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs text-slate-700">
                        <span className="inline-flex items-center gap-2 truncate">
                          <Upload className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="truncate">
                            {uploadedFileName || "Select .wav recording from disk"}
                          </span>
                        </span>
                        <input
                          type="file"
                          accept=".wav,audio/wav"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        disabled={submittingAudio || !uploadedWavBase64}
                        onClick={() => handleSubmitAudio()}
                        className="px-4 py-2.5 text-xs font-medium text-white bg-[#0F172A] rounded-md hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
                      >
                        {submittingAudio
                          ? "Validating WAV..."
                          : "Validate & Release Payout"}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-slate-500">
                        Quick WAV Verification Fixtures:
                      </span>
                      <button
                        type="button"
                        disabled={submittingAudio}
                        onClick={() => handleSubmitAudio("pass")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FileAudio className="w-3.5 h-3.5 text-emerald-700" />
                        Submit Clean 24kHz Mono WAV (Auto-Pay)
                      </button>
                      <button
                        type="button"
                        disabled={submittingAudio}
                        onClick={() => handleSubmitAudio("fail")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FileAudio className="w-3.5 h-3.5 text-red-700" />
                        Test Noisy Stereo 44.1kHz WAV (Block Payout)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border border-emerald-200 bg-emerald-50/70 rounded-md flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-emerald-900 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        Delivered to {activeBatch.client_name} & Escrow Settled
                      </p>
                      <p className="text-xs text-emerald-800 font-mono tabular-nums">
                        {latestPayout
                          ? `${latestPayout.payout_rail} · ${latestPayout.external_transfer_id} · Paid $${latestPayout.expert_payout_80pct.toFixed(2)}`
                          : `Delivered at ${activeBatch.delivered_at ? new Date(activeBatch.delivered_at).toLocaleString() : "Completed"}`}
                      </p>
                    </div>
                  </div>
                )}

                {shownQaReport && (
                  <div className="border-t border-slate-200 pt-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        Audio QA Telemetry · {shownQaReport.fileName}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          shownQaReport.passed
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {shownQaReport.passed ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        {shownQaReport.passed
                          ? "QA Passed · Funds Released"
                          : "QA Rejected · Escrow Held"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <p className="text-[11px] text-slate-500">Channels</p>
                        <p className="mt-1 text-sm font-mono tabular-nums font-medium text-slate-900">
                          {shownQaReport.channels === 1 ? "Mono (1)" : `Stereo (${shownQaReport.channels})`}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <p className="text-[11px] text-slate-500">Sample Rate</p>
                        <p className="mt-1 text-sm font-mono tabular-nums font-medium text-slate-900">
                          {shownQaReport.sampleRateHz} Hz
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <p className="text-[11px] text-slate-500">Peak</p>
                        <p className="mt-1 text-sm font-mono tabular-nums font-medium text-slate-900">
                          {shownQaReport.peakDbfs.toFixed(1)} dBFS
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <p className="text-[11px] text-slate-500">Noise Floor</p>
                        <p className="mt-1 text-sm font-mono tabular-nums font-medium text-slate-900">
                          {shownQaReport.noiseFloorDbfs.toFixed(1)} dBFS
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <p className="text-[11px] text-slate-500">SNR</p>
                        <p className="mt-1 text-sm font-mono tabular-nums font-medium text-slate-900">
                          {shownQaReport.snrDb.toFixed(1)} dB
                        </p>
                      </div>
                    </div>

                    {shownQaReport.failureReasons.length > 0 && (
                      <ul className="space-y-1 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
                        {shownQaReport.failureReasons.map((reason) => (
                          <li key={reason}>• {reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            ) : (
              <div className="border border-slate-200 bg-white rounded-lg p-8 text-sm text-slate-500">
                Select or dispatch a native speaker recording batch to run Audio QA validation.
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "directory" && isAdmin ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-8 border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Vetted Native Speaker Directory
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tenant-isolated human contributors eligible for TELUS, Mercor, and speech batches.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  placeholder="Search speaker or dialect..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-md text-slate-900 w-44"
                />
                <select
                  value={localeFilter}
                  onChange={(e) => setLocaleFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-900"
                >
                  <option value="all">All Locales</option>
                  {uniqueLocales.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">Speaker</th>
                    <th className="py-3 px-4">Locale & Dialect</th>
                    <th className="py-3 px-4">Payout Rail</th>
                    <th className="py-3 px-4 text-right">SNR</th>
                    <th className="py-3 px-4 text-right">Rate</th>
                    <th className="py-3 px-4 text-right">Batches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredExperts.map((expert) => (
                    <tr key={expert.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">
                          {expert.full_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {expert.specialty}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        <span className="font-mono font-medium text-slate-900">
                          {expert.native_locale}
                        </span>{" "}
                        · {expert.dialect}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        <span className="font-medium">
                          {expert.payout_rail === "kora_pay_global"
                            ? "Kora Pay Global (USD)"
                            : "Kora Pay Domestic (NGN)"}
                        </span>
                        <p className="font-mono text-[11px] text-slate-500">
                          {expert.payout_account_ref}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {expert.sample_snr_db.toFixed(1)} dB
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        ${expert.hourly_rate.toFixed(2)}/hr
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {expert.completed_batches}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <form
            onSubmit={handleOnboardExpert}
            className="lg:col-span-4 border border-slate-200 bg-white rounded-lg p-5 space-y-4"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Onboard Vetted Human Expert
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enroll native voice talent with automated Kora Pay local & international disbursement.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={expName}
                onChange={(e) => setExpName(e.target.value)}
                placeholder="Lucía Morales"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={expEmail}
                onChange={(e) => setExpEmail(e.target.value)}
                placeholder="lucia@madridstudio.es"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Native Locale
                </label>
                <input
                  type="text"
                  required
                  value={expLocale}
                  onChange={(e) => setExpLocale(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Dialect
                </label>
                <input
                  type="text"
                  required
                  value={expDialect}
                  onChange={(e) => setExpDialect(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Specialty
              </label>
              <input
                type="text"
                value={expSpecialty}
                onChange={(e) => setExpSpecialty(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hourly Rate (USD)
                </label>
                <input
                  type="number"
                  min="15"
                  step="1"
                  value={expRate}
                  onChange={(e) => setExpRate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-md text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payout Rail
                </label>
                <select
                  value={expRail}
                  onChange={(e) => setExpRail(e.target.value as PayoutRail)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-900"
                >
                  <option value="kora_pay">Kora Pay Domestic (NGN)</option>
                  <option value="kora_pay_global">Kora Pay Global (USD/GBP)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Payout Account Reference
              </label>
              <input
                type="text"
                value={expAccountRef}
                onChange={(e) => setExpAccountRef(e.target.value)}
                placeholder={
                  expRail === "kora_pay_global"
                    ? "kp_intl_beneficiary_ref (optional)"
                    : "kora_ngn_bank_ref (optional)"
                }
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={onboardingExpert}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F172A] rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>
                {onboardingExpert ? "Onboarding..." : "Onboard Vetted Expert"}
              </span>
            </button>
          </form>
        </div>
      ) : (
        <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Automated Kora Pay Settlement Ledger (Local & Global)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every transaction here was gated by Phase 3 WAV Audio QA before releasing the 80% payout.
            </p>
          </div>
          {payouts.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No marketplace settlements recorded yet for this account.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">Transfer ID</th>
                    <th className="py-3 px-4">Speaker</th>
                    <th className="py-3 px-4">Rail</th>
                    <th className="py-3 px-4 text-right">Gross</th>
                    <th className="py-3 px-4 text-right">Expert Net (80%)</th>
                    {isAdmin && (
                      <th className="py-3 px-4 text-right">Agency Cut (20%)</th>
                    )}
                    <th className="py-3 px-4">Settled At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {payouts.map((pay) => {
                    const speaker = experts.find((e) => e.id === pay.expert_id);
                    return (
                      <tr key={pay.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs text-slate-800">
                          {pay.external_transfer_id}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {speaker?.full_name ?? pay.expert_id}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {pay.payout_rail === "kora_pay_global"
                            ? "Kora Pay Global"
                            : "Kora Pay Domestic"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          ${pay.gross_amount.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-emerald-700">
                          ${pay.expert_payout_80pct.toFixed(2)}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                            ${(pay.platform_fee_20pct ?? 0).toFixed(2)}
                          </td>
                        )}
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500">
                          {new Date(pay.created_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
