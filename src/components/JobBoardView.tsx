import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Compass,
  CreditCard,
  PlusCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  ClientJobQaType,
  MarketplaceJobBid,
  MarketplaceJobPosting,
  VerifiedFreelancerDirectoryEntry,
} from "../types/tenant";
import { cacheJobBoardScripts } from "../pwa/offlineScriptStore";

interface JobBoardViewProps {
  standalone?: boolean;
  isAuthenticated?: boolean;
  orgId?: string;
  userName?: string;
  userEmail?: string;
  onReturnHomepage?: () => void;
  onOpenLogin?: () => void;
  onOpenDashboard?: () => void;
  onOpenCertification?: () => void;
  onGenerateSyntheticData?: () => void;
}

interface JobBoardSummary {
  openJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  totalListingFeesUsd: number;
  totalEscrowVolumeUsd: number;
  freelancerSharePct: number;
  platformSharePct: number;
  listingFeeUsd: number;
}

export function JobBoardView({
  standalone = false,
  isAuthenticated = false,
  orgId = "",
  userName = "",
  userEmail = "",
  onReturnHomepage,
  onOpenLogin,
  onOpenDashboard,
  onOpenCertification,
  onGenerateSyntheticData,
}: JobBoardViewProps) {
  const [jobs, setJobs] = useState<MarketplaceJobPosting[]>([]);
  const [bidsByJobId, setBidsByJobId] = useState<Record<string, MarketplaceJobBid[]>>({});
  const [freelancerDirectory, setFreelancerDirectory] = useState<
    VerifiedFreelancerDirectoryEntry[]
  >([]);
  const [directorySearch, setDirectorySearch] = useState("");
  const [summary, setSummary] = useState<JobBoardSummary>({
    openJobs: 0,
    inProgressJobs: 0,
    completedJobs: 0,
    totalListingFeesUsd: 0,
    totalEscrowVolumeUsd: 0,
    freelancerSharePct: 85,
    platformSharePct: 15,
    listingFeeUsd: 500,
  });
  const [koraPublicKey, setKoraPublicKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enterprise" | "open" | "in_progress" | "completed"
  >("all");
  const [showPostForm, setShowPostForm] = useState(standalone);
  const [activeBidJobId, setActiveBidJobId] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Client Job Post ($500 Kora Pay Listing Fee) form state
  const [clientOrgName, setClientOrgName] = useState("Synthesia Frontier AI");
  const [clientEmail, setClientEmail] = useState(userEmail || "procurement@synthesia.ai");
  const [jobTitle, setJobTitle] = useState("Need 450 Spanish Audio Utterances (24kHz Mono WAV)");
  const [jobDesc, setJobDesc] = useState(
    "Record and audit 450 conversational Spanish utterances meeting librosa 24kHz Mono, SNR > 35dB, peak -6 to -3 dBFS, and noise floor < -70 dBFS."
  );
  const [qaType, setQaType] = useState<ClientJobQaType>("audio");
  const [budgetUsd, setBudgetUsd] = useState("3800");
  const [currency, setCurrency] = useState<"NGN" | "USD" | "GBP">("NGN");
  const [postingJob, setPostingJob] = useState(false);
  const [pendingListingRef, setPendingListingRef] = useState<{
    reference: string;
    chargeCurrency: string;
    chargeAmount: number;
    title: string;
  } | null>(null);

  // Freelancer Bid state
  const [freelancerName, setFreelancerName] = useState(
    userName || "Elena Rostova (Senior Audio Cohort)"
  );
  const [freelancerEmail, setFreelancerEmail] = useState(
    userEmail || "elena.rostova@dutchkemventures.com"
  );
  const [bidAmountUsd, setBidAmountUsd] = useState("3400");
  const [turnaroundDays, setTurnaroundDays] = useState("4");
  const [bidPitch, setBidPitch] = useState(
    "Studio booth team with automated librosa pre-flight checks guaranteeing 100% first-pass QA acceptance."
  );
  const [submittingBid, setSubmittingBid] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketplace-jobs");
      if (!res.ok) throw new Error("Unable to load two-sided job board.");
      const data = await res.json();
      const loadedJobs: MarketplaceJobPosting[] = data.jobs ?? [];
      setJobs(loadedJobs);
      cacheJobBoardScripts(loadedJobs);
      setBidsByJobId(data.bidsByJobId ?? {});
      if (Array.isArray(data.freelancerDirectory)) {
        setFreelancerDirectory(data.freelancerDirectory);
      }
      if (data.summary) setSummary(data.summary);
      if (data.koraPublicKey) setKoraPublicKey(data.koraPublicKey);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load job board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/certification/directory?q=${encodeURIComponent(directorySearch.trim())}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          freelancers?: VerifiedFreelancerDirectoryEntry[];
        };
        if (active && Array.isArray(data.freelancers)) {
          setFreelancerDirectory(data.freelancers);
        }
      } catch {
        // Ignore transient directory search error
      }
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [directorySearch]);

  async function handleVerifyListingFee(reference: string, gatewayStatus = "success") {
    setErrorMsg(null);
    try {
      const res = await fetch("/api/marketplace-jobs/post/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, gatewayStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unable to verify $500 Kora Pay listing fee.");
      setPendingListingRef(null);
      setShowPostForm(false);
      setNotice(
        `Verified $500 listing fee via Kora Pay (${reference}). "${data.job.title}" is now live for freelancer bidding.`
      );
      if (data.jobs) {
        setJobs(data.jobs);
        setBidsByJobId(data.bidsByJobId ?? {});
        if (data.summary) setSummary(data.summary);
      } else {
        await loadJobs();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to verify listing fee.");
    }
  }

  async function handlePostJobSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    setPostingJob(true);
    try {
      const res = await fetch("/api/marketplace-jobs/post/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: jobTitle.trim(),
          description: jobDesc.trim(),
          qaType,
          budgetUsd: Number(budgetUsd),
          currency,
          clientOrgName: clientOrgName.trim(),
          clientEmail: clientEmail.trim(),
          orgId: orgId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to initialize $500 listing checkout.");

      setPendingListingRef({
        reference: data.reference,
        chargeCurrency: data.currency,
        chargeAmount: data.chargeAmount,
        title: data.job.title,
      });

      const korapayGlobal = (
        window as unknown as {
          Korapay?: { initialize: (opts: Record<string, unknown>) => void };
        }
      ).Korapay;

      if (korapayGlobal && (data.publicKey || koraPublicKey)) {
        korapayGlobal.initialize({
          key: data.publicKey || koraPublicKey,
          reference: data.reference,
          amount: data.chargeAmount,
          currency: data.currency,
          narration: `Dutchkem $500 Client Job Posting Fee`,
          customer: { name: clientOrgName.trim(), email: clientEmail.trim() },
          onSuccess: () => {
            void handleVerifyListingFee(data.reference, "success");
          },
        });
      }

      setNotice(
        `Initialized $500 Kora Pay listing fee (${data.currency} ${Number(data.chargeAmount).toLocaleString()}). Complete Kora Pay verification below to publish on the Freelancer Board.`
      );
      await loadJobs();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to post client job.");
    } finally {
      setPostingJob(false);
    }
  }

  async function handleSubmitBid(e: React.FormEvent, jobId: string) {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    setSubmittingBid(true);
    try {
      const res = await fetch(`/api/marketplace-jobs/${jobId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freelancerName: freelancerName.trim(),
          freelancerEmail: freelancerEmail.trim(),
          bidAmountUsd: Number(bidAmountUsd),
          turnaroundDays: Number(turnaroundDays),
          pitch: bidPitch.trim(),
          applicantOrgId: orgId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit freelancer bid.");
      setActiveBidJobId(null);
      setNotice(`Bid submitted ($${Number(bidAmountUsd).toLocaleString()}) — client can now accept & fund Kora Pay escrow.`);
      setJobs(data.jobs ?? []);
      setBidsByJobId(data.bidsByJobId ?? {});
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit bid.");
    } finally {
      setSubmittingBid(false);
    }
  }

  async function handleAcceptBidAndFundEscrow(jobId: string, bidId: string) {
    setErrorMsg(null);
    setNotice(null);
    setBusyJobId(jobId);
    try {
      const res = await fetch(`/api/marketplace-jobs/${jobId}/bids/${bidId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to accept bid and fund escrow.");
      setNotice(
        `Bid accepted and Kora Pay Escrow funded (${data.chargeCurrency} ${Number(data.chargeAmount).toLocaleString()}, ref ${data.escrowRef}). Ready for freelancer submission.`
      );
      setJobs(data.jobs ?? []);
      setBidsByJobId(data.bidsByJobId ?? {});
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to fund escrow.");
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleSubmitWorkForQa(jobId: string, wavPreset: "pass" | "fail") {
    setErrorMsg(null);
    setNotice(null);
    setBusyJobId(jobId);
    try {
      const res = await fetch(`/api/marketplace-jobs/${jobId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wavPreset }),
      });
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
        setBidsByJobId(data.bidsByJobId ?? {});
        if (data.summary) setSummary(data.summary);
      } else {
        await loadJobs();
      }
      if (!res.ok) {
        setErrorMsg(data.qaSummary || data.detail || "Automated QA rejected deliverable. Escrow remains locked.");
      } else {
        setNotice(
          `${data.qaSummary} · Released $${Number(data.freelancerPayout85).toFixed(2)} (85%) to freelancer & $${Number(data.platformFee15).toFixed(2)} (15%) to platform via Kora Pay.`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit deliverable.");
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleDepositPolygonUsdc(jobId: string, bidId: string, amountUsd: number) {
    setErrorMsg(null);
    setNotice(null);
    setBusyJobId(jobId);
    try {
      const res = await fetch("/api/blockchain-escrow/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, bidId, amountUsd }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Polygon USDC Smart Contract deposit denied.");
      }
      setJobs(data.jobs ?? []);
      setBidsByJobId(data.bidsByJobId ?? {});
      if (data.summary) setSummary(data.summary);
      setNotice(
        `Polygon Escrow.sol locked $${Number(data.escrow.amount_usd).toLocaleString()} USDC (Tx ${String(data.escrow.deposit_tx_hash).slice(0, 14)}...). QA Oracle armed.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to deposit USDC on Polygon.");
    } finally {
      setBusyJobId(null);
    }
  }

  async function handlePolygonQaOracle(jobId: string, qaPreset: "pass" | "fail") {
    setErrorMsg(null);
    setNotice(null);
    setBusyJobId(jobId);
    try {
      const res = await fetch(`/api/blockchain-escrow/${jobId}/qa-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qaPreset, autoRefund: qaPreset === "fail" }),
      });
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
        setBidsByJobId(data.bidsByJobId ?? {});
        if (data.summary) setSummary(data.summary);
      } else {
        await loadJobs();
      }
      if (!res.ok) {
        throw new Error(data.detail || data.qaSummary || "Polygon QA Oracle verification failed.");
      }
      if (data.refunded) {
        setNotice(
          `${data.qaSummary} · Settlement Tx ${String(data.escrow?.settlement_tx_hash || "").slice(0, 14)}...`
        );
      } else {
        setNotice(
          `${data.qaSummary} · Polygon Escrow.sol disbursed $${Number(data.escrow?.freelancer_payout_usdc || 0).toLocaleString()} USDC (85%) to freelancer.`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Polygon QA Oracle failed.");
    } finally {
      setBusyJobId(null);
    }
  }

  const visibleJobs = jobs.filter((job) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "enterprise") {
      return Boolean(job.blockchain_escrow_eligible || job.budget_usd > 10000);
    }
    return job.status === statusFilter;
  });

  const listingFeeInCurrency =
    currency === "NGN" ? "₦765,000" : currency === "GBP" ? "£395" : "$500";

  return (
    <div className={standalone ? "min-h-screen bg-[#F8FAFF] text-[#0F172A]" : "space-y-8"}>
      {standalone && (
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-6">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="inline-flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 text-white flex items-center justify-center shadow-xs">
                <Compass className="w-4 h-4" />
              </span>
              <span>Dutchkem Ventures</span>
            </button>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={onReturnHomepage}
                className="inline-flex items-center gap-1.5 hover:text-blue-700 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Homepage</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPostForm(true)}
                className="hover:text-blue-700 whitespace-nowrap shrink-0"
              >
                Client Portal
              </button>
              <button
                type="button"
                onClick={() => setShowPostForm(false)}
                className="hover:text-blue-700 whitespace-nowrap shrink-0"
              >
                Freelancer Board
              </button>
              {isAuthenticated && onOpenDashboard ? (
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
                >
                  Go to Dashboard
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
                >
                  Sign In
                </button>
              )}
            </nav>

            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setShowPostForm((prev) => !prev)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white shadow-xs whitespace-nowrap shrink-0"
              >
                {showPostForm ? "Browse Freelancer Board" : "Post a Job ($500)"}
              </button>
            </div>
          </div>
        </header>
      )}

      <div className={standalone ? "mx-auto max-w-7xl px-6 py-10 space-y-8" : "space-y-8"}>
        {/* Hero Header & Action Bar */}
        <section className="rounded-2xl border border-blue-200/80 bg-white p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-700">
              Phase 15 · Two-Sided AI Data Marketplace &amp; 85/15 Kora Pay Escrow
            </p>
            <h1 className="mt-1.5 text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
              Client Job Portal &amp; Freelancer Bidding Board
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              AI Labs pay a verified <span className="font-mono font-semibold text-slate-950">$500</span> listing fee via Kora Pay to publish cohorts. Freelancers apply with bids, clients fund escrow via Kora Pay, and passing automated QA triggers an instant <span className="font-mono font-semibold text-emerald-700">85% Freelancer / 15% Platform</span> payout split.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <select
              aria-label="Kora Pay marketplace currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "NGN" | "USD" | "GBP")}
              className="px-3.5 py-2.5 text-xs font-semibold border border-slate-200 bg-slate-50 rounded-xl text-slate-900"
            >
              <option value="NGN">NGN (Nigeria Local)</option>
              <option value="USD">USD (Global)</option>
              <option value="GBP">GBP (UK / Europe)</option>
            </select>

            <button
              type="button"
              onClick={() => setShowPostForm((prev) => !prev)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white hover:brightness-105 transition-all whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{showPostForm ? "Close Job Form" : `Post a Job (${listingFeeInCurrency})`}</span>
            </button>
          </div>
        </section>

        {errorMsg && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm font-medium flex items-center justify-between gap-4">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-xs font-semibold underline shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 text-sm font-medium flex items-center justify-between gap-4">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* 4-Column KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Open Client Cohorts</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
              {summary.openJobs}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {summary.inProgressJobs} funded · {summary.completedJobs} settled
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Escrow Volume (Kora Pay)</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-700">
              ${summary.totalEscrowVolumeUsd.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">Protected until QA agent clears</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Listing Fees Collected</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
              ${summary.totalListingFeesUsd.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">$500 flat fee per posted job</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Automated Escrow Split</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {summary.freelancerSharePct}% / {summary.platformSharePct}%
            </p>
            <p className="mt-1 text-xs text-slate-500">Freelancer payout · Platform fee</p>
          </div>
        </section>

        {/* Phase 21E: Verified Freelancer Search Directory (Certified Specialists Ranked First) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <Award className="w-4 h-4" />
                <span>Phase 21E · Verified QA Specialist Search &amp; Priority Queue</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                Verified Freelancer Directory (Certified Appear First)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Specialists who pay $99 and pass &gt; 90% QA Certification appear strictly at the top of search results and receive early priority alerts for every new client job.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  aria-label="Search QA freelancers"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Search skill, locale, or Verified..."
                  className="pl-8 pr-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-950 w-full sm:w-64"
                />
              </div>

              {onOpenCertification && (
                <button
                  type="button"
                  onClick={onOpenCertification}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Get Verified ($99)</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2.5 pr-4">Rank</th>
                  <th className="py-2.5 pr-4">Specialist</th>
                  <th className="py-2.5 pr-4">Verification Status</th>
                  <th className="py-2.5 pr-4">Primary QA Discipline</th>
                  <th className="py-2.5 pr-4">Locales</th>
                  <th className="py-2.5 text-right">Hourly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {freelancerDirectory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No QA specialists matched "{directorySearch}".
                    </td>
                  </tr>
                ) : (
                  freelancerDirectory.map((entry, idx) => (
                    <tr key={entry.user_id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-4 font-mono tabular-nums text-slate-500">
                        #{idx + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-950">{entry.full_name}</p>
                        <p className="text-[11px] text-slate-500">{entry.email}</p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {entry.is_verified ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 font-mono tabular-nums">
                            <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              {entry.tier === "expert" ? "Verified · Expert" : "Verified"} (
                              {entry.score}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">Uncertified</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{entry.specialty}</td>
                      <td className="py-3 pr-4 font-mono text-slate-600">{entry.locale}</td>
                      <td className="py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        ${entry.hourly_rate}/hr
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Client Portal: Post a Job ($500 Kora Pay Listing Fee) */}
        {showPostForm && (
          <section className="rounded-2xl border border-blue-200 bg-white p-6 space-y-5">
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Client Portal · Post an AI Data Job ($500 Kora Pay Listing Fee)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Once your $500 listing fee clears via Kora Pay, vetted freelancers can apply and submit escrow bids immediately.
                </p>
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold text-blue-700">
                Fee: {listingFeeInCurrency} ({currency})
              </span>
            </div>

            {pendingListingRef && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-amber-950">
                    Kora Pay Checkout Ready · Reference:{" "}
                    <span className="font-mono">{pendingListingRef.reference}</span>
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Job: {pendingListingRef.title} · Amount: {pendingListingRef.chargeCurrency}{" "}
                    {pendingListingRef.chargeAmount.toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleVerifyListingFee(pendingListingRef.reference, "success")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Confirm $500 Kora Pay Payment &amp; Publish</span>
                </button>
              </div>
            )}

            <form onSubmit={handlePostJobSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="client-org-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  AI Lab / Organization Name
                </label>
                <input
                  id="client-org-input"
                  value={clientOrgName}
                  onChange={(e) => setClientOrgName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div>
                <label htmlFor="client-email-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Procurement / Billing Email
                </label>
                <input
                  id="client-email-input"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="job-title-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Headline
                </label>
                <input
                  id="job-title-input"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div>
                <label htmlFor="job-qa-select" className="block text-xs font-semibold text-slate-700 mb-1">
                  Automated QA Gate Engine
                </label>
                <select
                  id="job-qa-select"
                  value={qaType}
                  onChange={(e) => setQaType(e.target.value as ClientJobQaType)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                >
                  <option value="audio">Audio QA (librosa 24kHz Mono, SNR &gt; 35dB)</option>
                  <option value="vision">Vision QA (YOLOv8 IoU &gt;= 0.70)</option>
                  <option value="text">Text Rubric QA (Gemini 4 Director Score &gt;= 80)</option>
                </select>
              </div>

              <div>
                <label htmlFor="job-budget-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Budget (USD)
                </label>
                <input
                  id="job-budget-input"
                  type="number"
                  min="100"
                  value={budgetUsd}
                  onChange={(e) => setBudgetUsd(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl text-slate-950"
                />
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    Number(budgetUsd) > 10000 ? "text-indigo-700" : "text-slate-500"
                  }`}
                >
                  {Number(budgetUsd) > 10000
                    ? "Enterprise contract (> $10,000): Qualifies for Polygon USDC Blockchain Escrow (Escrow.sol · Gas ~$0.04)."
                    : "Standard contract (<= $10,000): Settled via Kora Pay Escrow. Increase above $10,000 to enable Blockchain Escrow."}
                </p>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="job-desc-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Technical Acceptance Rubric
                </label>
                <textarea
                  id="job-desc-input"
                  rows={3}
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={postingJob}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{postingJob ? "Initializing Kora Pay..." : `Pay $500 Listing Fee via Kora Pay (${currency})`}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                ["all", "All Listings"],
                ["enterprise", "Blockchain Escrow (>$10k)"],
                ["open", "Open for Bids"],
                ["in_progress", "Escrow Funded"],
                ["completed", "85/15 Released"],
              ] as const
            ).map(([val, text]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === val
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          <p className="text-xs text-slate-500 font-mono tabular-nums">
            Showing {visibleJobs.length} verified marketplace cohorts
          </p>
        </div>

        {/* Job Listings + Bidding + Escrow Automation */}
        <div className="space-y-5">
          {loading && visibleJobs.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
              Loading two-sided marketplace listings...
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="p-10 text-center rounded-2xl border border-slate-200 bg-white space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-950">
                  No Open Client Jobs Found
                </h3>
                <p className="text-sm text-slate-600">
                  There are currently 0 active jobs in this queue. Keep your evaluation cohort productive by generating synthetic RLHF &amp; QA datasets.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (onGenerateSyntheticData) {
                      onGenerateSyntheticData();
                    } else if (onOpenDashboard) {
                      onOpenDashboard();
                    } else if (onOpenLogin) {
                      onOpenLogin();
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-white hover:brightness-105 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Synthetic Data</span>
                </button>
                {jobs.length > 0 && statusFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className="px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Show All Listings
                  </button>
                )}
              </div>
            </div>
          ) : (
            visibleJobs.map((job) => {
              const jobBids = bidsByJobId[job.id] ?? [];
              const acceptedBid = jobBids.find((b) => b.id === job.accepted_bid_id);
              const isBidOpen = activeBidJobId === job.id;

              return (
                <article
                  key={job.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-blue-700">{job.client_org_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="uppercase font-mono">{job.qa_type} QA</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium">
                          {job.listing_fee_paid ? "$500 Kora Pay Verified" : "Awaiting $500 Listing Fee"}
                        </span>
                        {(job.blockchain_escrow_eligible || job.budget_usd > 10000) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 text-[11px] font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>Blockchain Escrow</span>
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-950">{job.title}</h3>
                      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">{job.description}</p>
                    </div>

                    <div className="text-left lg:text-right shrink-0 space-y-1">
                      <p className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                        ${job.budget_usd.toLocaleString()}
                      </p>
                      <p className="text-xs font-semibold">
                        {job.status === "open" ? (
                          <span className="text-emerald-700">Open for Freelancer Bids</span>
                        ) : job.status === "in_progress" ? (
                          <span className="text-blue-700">Escrow Funded · In Progress</span>
                        ) : job.status === "completed" ? (
                          <span className="text-emerald-700">Completed · 85/15 Settled</span>
                        ) : (
                          <span className="text-amber-700">Pending $500 Fee</span>
                        )}
                      </p>
                      {job.status === "awaiting_listing_fee" && (
                        <button
                          type="button"
                          onClick={() => void handleVerifyListingFee(job.kora_listing_ref, "success")}
                          className="mt-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                        >
                          Verify $500 Fee
                        </button>
                      )}
                      {job.status === "open" && (
                        <button
                          type="button"
                          onClick={() => setActiveBidJobId(isBidOpen ? null : job.id)}
                          className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap"
                        >
                          <BriefcaseBusiness className="w-3.5 h-3.5" />
                          <span>{isBidOpen ? "Cancel" : "Apply & Submit Bid"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Freelancer Bid Application Form */}
                  {isBidOpen && job.status === "open" && (
                    <form
                      onSubmit={(e) => void handleSubmitBid(e, job.id)}
                      className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100 pb-5"
                    >
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Freelancer / Cohort Name
                        </label>
                        <input
                          value={freelancerName}
                          onChange={(e) => setFreelancerName(e.target.value)}
                          required
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Payout Email
                        </label>
                        <input
                          type="email"
                          value={freelancerEmail}
                          onChange={(e) => setFreelancerEmail(e.target.value)}
                          required
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Bid (USD)
                          </label>
                          <input
                            type="number"
                            min="50"
                            value={bidAmountUsd}
                            onChange={(e) => setBidAmountUsd(e.target.value)}
                            required
                            className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Days
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="90"
                            value={turnaroundDays}
                            onChange={(e) => setTurnaroundDays(e.target.value)}
                            required
                            className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <input
                          value={bidPitch}
                          onChange={(e) => setBidPitch(e.target.value)}
                          placeholder="Describe acoustic/vision tooling & QA commitment..."
                          required
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={submittingBid}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{submittingBid ? "Submitting..." : "Submit Freelancer Bid"}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Bids & Escrow Funding Table */}
                  {jobBids.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold text-slate-700">
                        Submitted Freelancer Bids ({jobBids.length})
                      </p>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                        {jobBids.map((bid) => (
                          <div
                            key={bid.id}
                            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <p className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                                <span>{bid.freelancer_name}</span>
                                {bid.is_verified && (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                    <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>
                                      {bid.certification_tier === "expert"
                                        ? "Expert Verified QA"
                                        : "Verified QA"}
                                    </span>
                                  </span>
                                )}
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-blue-700">
                                  ${bid.bid_amount_usd.toLocaleString()}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{bid.turnaround_days}d SLA</span>
                              </p>
                              <p className="text-slate-600 mt-0.5">{bid.pitch}</p>
                            </div>
                            <div className="shrink-0 flex flex-wrap items-center gap-2">
                              {job.status === "open" ? (
                                <>
                                  {(job.blockchain_escrow_eligible || job.budget_usd > 10000) &&
                                    bid.bid_amount_usd > 10000 && (
                                      <button
                                        type="button"
                                        disabled={busyJobId === job.id}
                                        onClick={() =>
                                          void handleDepositPolygonUsdc(
                                            job.id,
                                            bid.id,
                                            bid.bid_amount_usd
                                          )
                                        }
                                        className="px-3.5 py-2 font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap"
                                      >
                                        Deposit USDC (Polygon Escrow.sol)
                                      </button>
                                    )}
                                  <button
                                    type="button"
                                    disabled={busyJobId === job.id}
                                    onClick={() => void handleAcceptBidAndFundEscrow(job.id, bid.id)}
                                    className="px-3.5 py-2 font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                                  >
                                    Accept Bid &amp; Lock Task Deposit (Kora Pay)
                                  </button>
                                </>
                              ) : bid.status === "accepted" ? (
                                <span className="font-semibold text-emerald-700">
                                  Accepted · Escrow {job.escrow_status}
                                </span>
                              ) : (
                                <span className="text-slate-400">Not selected</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Enterprise Polygon Smart Contract Escrow Panel (> $10,000 USDC) */}
                  {job.blockchain_escrow && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="space-y-1 text-xs">
                          <p className="font-bold text-indigo-950 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span>
                              Polygon PoS Smart Contract Escrow (Escrow.sol · Chain ID{" "}
                              {job.blockchain_escrow.chain_id}) ·{" "}
                              {job.blockchain_escrow.status.toUpperCase()}
                            </span>
                          </p>
                          <p className="font-mono tabular-nums text-[11px] text-slate-700">
                            Contract: {job.blockchain_escrow.contract_address.slice(0, 12)}...
                            {job.blockchain_escrow.contract_address.slice(-6)} · Locked: $
                            {job.blockchain_escrow.amount_usd.toLocaleString()} USDC · Gas ~$
                            {job.blockchain_escrow.estimated_gas_usd.toFixed(2)}
                          </p>
                          <p className="font-mono text-[11px] text-slate-600">
                            Deposit Tx: {job.blockchain_escrow.deposit_tx_hash?.slice(0, 22)}...
                            {job.blockchain_escrow.settlement_tx_hash
                              ? ` · Settlement Tx: ${job.blockchain_escrow.settlement_tx_hash.slice(0, 22)}...`
                              : ""}
                          </p>
                        </div>

                        {job.blockchain_escrow.status === "locked" && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busyJobId === job.id}
                              onClick={() => void handlePolygonQaOracle(job.id, "pass")}
                              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap"
                            >
                              QA Oracle Confirm Pass → Disburse USDC
                            </button>
                            <button
                              type="button"
                              disabled={busyJobId === job.id}
                              onClick={() => void handlePolygonQaOracle(job.id, "fail")}
                              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 whitespace-nowrap"
                            >
                              QA Failed → Refund 100% USDC
                            </button>
                          </div>
                        )}
                      </div>
                      {job.blockchain_escrow.qa_oracle_report_hash && (
                        <p className="font-mono text-[11px] text-indigo-900 border-t border-indigo-200/70 pt-2">
                          QA Oracle Digest: {job.blockchain_escrow.qa_oracle_report_hash.slice(0, 26)}... ·{" "}
                          {job.blockchain_escrow.status === "refunded"
                            ? `Refunded $${job.blockchain_escrow.amount_usd.toLocaleString()} USDC to Client`
                            : `Settled $${(job.blockchain_escrow.freelancer_payout_usdc ?? 0).toLocaleString()} USDC (85%) / $${(job.blockchain_escrow.platform_fee_usdc ?? 0).toLocaleString()} USDC (15%)`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Escrow Deliverable Submission & Automated 85/15 Split */}
                  {job.status === "in_progress" && !job.blockchain_escrow && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                      <div className="text-xs text-slate-700 space-y-0.5">
                        <p className="font-semibold text-slate-950 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          <span>
                            Escrow Funded for {acceptedBid?.freelancer_name || "Freelancer"} ({job.kora_escrow_ref})
                          </span>
                        </p>
                        {job.last_qa_summary && (
                          <p className="font-mono text-slate-600">{job.last_qa_summary}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busyJobId === job.id}
                          onClick={() => void handleSubmitWorkForQa(job.id, "pass")}
                          className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
                        >
                          Submit Clean Work (Pass QA → Release 85/15)
                        </button>
                        <button
                          type="button"
                          disabled={busyJobId === job.id}
                          onClick={() => void handleSubmitWorkForQa(job.id, "fail")}
                          className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 whitespace-nowrap"
                        >
                          Test QA Rejection (Lock Escrow)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Completed 85/15 Split Receipt */}
                  {job.status === "completed" && job.freelancer_payout_85pct !== null && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                      <p className="font-medium text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{job.last_qa_summary}</span>
                      </p>
                      <p className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                        85% Freelancer: ${job.freelancer_payout_85pct.toFixed(2)} · 15% Platform: $
                        {(job.platform_fee_15pct ?? 0).toFixed(2)} · Ref: {job.kora_disbursement_ref}
                      </p>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
