import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  CreditCard,
  Database,
  Download,
  Lock,
  PlusCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  CertificationCurrency,
  DatasetCategory,
  DatasetPurchaseRecord,
  MarketplaceDataset,
} from "../types/tenant";

interface DataMarketplaceViewProps {
  standalone?: boolean;
  embeddedInHomepage?: boolean;
  isAuthenticated?: boolean;
  orgId?: string;
  orgName?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  onReturnHomepage?: () => void;
  onOpenLogin?: () => void;
  onOpenDashboard?: () => void;
}

interface CatalogMetrics {
  listedDatasetsCount: number;
  totalSamplesCount: number;
  totalGrossSalesUsd: number;
  platformCommissionPct: number;
  sellerPayoutPct: number;
}

interface SellerSalesSummary {
  listedDatasets: MarketplaceDataset[];
  settledSales: DatasetPurchaseRecord[];
  totalGrossSalesUsd: number;
  totalPlatformCommission10PctUsd: number;
  totalSellerNet90PctUsd: number;
}

const CATEGORY_LABELS: Record<"all" | DatasetCategory, string> = {
  all: "All Datasets",
  audio_speech: "Audio & Speech",
  vision_bbox: "Vision BBox",
  multilingual_text: "Multilingual Text",
  red_team_eval: "Red-Team Evals",
};

export function DataMarketplaceView({
  standalone = false,
  embeddedInHomepage = false,
  isAuthenticated = false,
  orgId = "",
  orgName = "",
  userId = "",
  userName = "",
  userEmail = "",
  onReturnHomepage,
  onOpenLogin,
  onOpenDashboard,
}: DataMarketplaceViewProps) {
  const [datasets, setDatasets] = useState<MarketplaceDataset[]>([]);
  const [metrics, setMetrics] = useState<CatalogMetrics>({
    listedDatasetsCount: 0,
    totalSamplesCount: 0,
    totalGrossSalesUsd: 0,
    platformCommissionPct: 10,
    sellerPayoutPct: 90,
  });
  const [koraPublicKey, setKoraPublicKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<"all" | DatasetCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);

  // Seller listing form state
  const [showListForm, setShowListForm] = useState(false);
  const [listTitle, setListTitle] = useState("West African Pidgin ASR Evaluation Pack");
  const [listDesc, setListDesc] = useState(
    "Verified 24kHz mono studio recordings across urban Lagos accents with deterministic SNR > 38 dB and scrubbed speaker identifiers."
  );
  const [listCategory, setListCategory] = useState<DatasetCategory>("audio_speech");
  const [listSamples, setListSamples] = useState("500");
  const [listPrice, setListPrice] = useState("1100");
  const [listSourceRef, setListSourceRef] = useState("jb-1503-yoruba-tts");
  const [listLocale, setListLocale] = useState("pcm-NG / en-NG");
  const [listQaScore, setListQaScore] = useState("96.5");
  const [listQaValidated, setListQaValidated] = useState(true);
  const [listAnonymized, setListAnonymized] = useState(true);
  const [listPreviewSample, setListPreviewSample] = useState(
    '{"sample_id":"pcm_001","speaker":"[ANON_SPK_09]","snr_db":41.2,"pii_redacted":true}'
  );
  const [submittingListing, setSubmittingListing] = useState(false);

  // Buyer checkout state
  const [checkoutDataset, setCheckoutDataset] = useState<MarketplaceDataset | null>(null);
  const [buyerOrgName, setBuyerOrgName] = useState("SynthLab AI Research");
  const [buyerEmail, setBuyerEmail] = useState(userEmail || "procurement@synthlab.ai");
  const [currency, setCurrency] = useState<CertificationCurrency>("USD");
  const [initializingPurchase, setInitializingPurchase] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<DatasetPurchaseRecord | null>(null);
  const [completedPurchases, setCompletedPurchases] = useState<DatasetPurchaseRecord[]>([]);
  const [verifyingPurchase, setVerifyingPurchase] = useState(false);

  // Seller sales summary (when authenticated)
  const [sellerSummary, setSellerSummary] = useState<SellerSalesSummary | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const res = await fetch(`/api/data-marketplace?${params.toString()}`);
      if (!res.ok) throw new Error("Unable to load Data Marketplace catalog.");
      const data = await res.json();
      setDatasets(data.datasets ?? []);
      if (data.metrics) setMetrics(data.metrics);
      if (data.koraPublicKey) setKoraPublicKey(data.koraPublicKey);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load Data Marketplace.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, searchQuery]);

  const loadSellerSales = useCallback(async () => {
    if (!isAuthenticated || !orgId || !userId) return;
    try {
      const res = await fetch("/api/data-marketplace/seller/sales", {
        credentials: "include",
        headers: { "x-org-id": orgId, "x-user-id": userId },
      });
      if (res.ok) {
        const data = (await res.json()) as SellerSalesSummary;
        setSellerSummary(data);
      }
    } catch {
      // Ignore silent seller summary refresh errors
    }
  }, [isAuthenticated, orgId, userId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadSellerSales();
  }, [loadSellerSales]);

  async function handlePublishDataset(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated || !orgId || !userId) {
      onOpenLogin?.();
      return;
    }
    setErrorMsg(null);
    setNotice(null);
    setSubmittingListing(true);
    try {
      const res = await fetch("/api/data-marketplace/datasets", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          title: listTitle.trim(),
          description: listDesc.trim(),
          category: listCategory,
          sampleCount: Number(listSamples),
          priceUsd: Number(listPrice),
          anonymized: listAnonymized,
          qaValidated: listQaValidated,
          qaScore: Number(listQaScore),
          qaReportSummary: `Automated QA PASSED (${Number(listQaScore).toFixed(1)}%) · Source ${listSourceRef.trim()}`,
          sourceRef: listSourceRef.trim(),
          locale: listLocale.trim(),
          previewSamples: [listPreviewSample.trim()].filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Dataset failed QA / NDPA anonymization validation gate.");
      }
      setShowListForm(false);
      setNotice(
        `Listed "${data.dataset.title}" on the AI Lab Data Marketplace ($${data.dataset.price.toLocaleString()} · 90% creator split / 10% Kora Pay commission).`
      );
      await loadCatalog();
      await loadSellerSales();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to list dataset.");
    } finally {
      setSubmittingListing(false);
    }
  }

  async function handleVerifyPurchase(reference: string, gatewayStatus = "success") {
    setErrorMsg(null);
    setVerifyingPurchase(true);
    try {
      const res = await fetch("/api/data-marketplace/purchase/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, gatewayStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to verify Kora Pay dataset purchase.");
      }
      setPendingPurchase(null);
      setCheckoutDataset(null);
      setCompletedPurchases((prev) => [data.purchase, ...prev]);
      setNotice(
        `Settled $${Number(data.purchase.gross_price_usd).toLocaleString()} via Kora Pay Split (${data.purchase.kora_split_reference}): $${Number(data.purchase.seller_payout_90pct).toLocaleString()} (90%) to seller & $${Number(data.purchase.platform_commission_10pct).toLocaleString()} (10%) commission. Dataset download unlocked.`
      );
      await loadCatalog();
      await loadSellerSales();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to verify purchase.");
    } finally {
      setVerifyingPurchase(false);
    }
  }

  async function handleInitializePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!checkoutDataset) return;
    setErrorMsg(null);
    setNotice(null);
    setInitializingPurchase(true);
    try {
      const res = await fetch("/api/data-marketplace/purchase/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: checkoutDataset.id,
          buyerOrgName: buyerOrgName.trim(),
          buyerEmail: buyerEmail.trim(),
          currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to initialize Kora Pay dataset purchase.");
      }

      setPendingPurchase(data.purchase);

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
          narration: `Dataset License (${checkoutDataset.title}) · 10% Split`,
          customer: { name: buyerOrgName.trim(), email: buyerEmail.trim() },
          onSuccess: () => {
            void handleVerifyPurchase(data.reference, "success");
          },
        });
      }

      setNotice(
        `Initialized Kora Pay checkout (${data.currency} ${Number(data.chargeAmount).toLocaleString()}) with 90% creator / 10% platform split. Confirm settlement below to unlock dataset download.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Purchase initialization failed.");
    } finally {
      setInitializingPurchase(false);
    }
  }

  async function handleDownloadDatasetBundle(purchase: DatasetPurchaseRecord) {
    if (!purchase.download_token) return;
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/data-marketplace/purchases/${encodeURIComponent(
          purchase.id
        )}/download?token=${encodeURIComponent(purchase.download_token)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Download failed.");
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${purchase.dataset_id}.jsonl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to download dataset bundle.");
    }
  }

  const containerClass = embeddedInHomepage
    ? "space-y-8"
    : standalone
      ? "mx-auto max-w-7xl px-6 py-10 space-y-8"
      : "space-y-8";

  return (
    <div
      className={
        standalone && !embeddedInHomepage
          ? "min-h-screen bg-[#F8FAFF] text-[#0F172A]"
          : "space-y-8"
      }
    >
      {standalone && !embeddedInHomepage && (
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
              {onReturnHomepage && (
                <button
                  type="button"
                  onClick={onReturnHomepage}
                  className="inline-flex items-center gap-1.5 hover:text-blue-700 whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Overview</span>
                </button>
              )}
              <span className="font-semibold text-blue-700 whitespace-nowrap">
                Marketplace
              </span>
              {isAuthenticated && onOpenDashboard ? (
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="font-semibold text-slate-900 hover:text-blue-700 whitespace-nowrap"
                >
                  Go to Dashboard
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
                >
                  Sign In
                </button>
              )}
            </nav>

            <div className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    onOpenLogin?.();
                    return;
                  }
                  setShowListForm((prev) => !prev);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap"
              >
                {showListForm ? "Browse Datasets" : "List Completed Dataset"}
              </button>
            </div>
          </div>
        </header>
      )}

      <div className={containerClass}>
        {/* Hero Header */}
        <section className="rounded-2xl border border-blue-200/80 bg-white p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-700">
              Phase 21F · Verified AI Training Corpus Storefront &amp; 10% Kora Pay Split
            </p>
            <h1 className="mt-1.5 text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
              AI Data Marketplace (QA-Validated &amp; Anonymized)
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Freelancers and data agencies list completed QA-passed datasets with verified NDPA anonymization. AI Labs license corpora via instant Kora Pay settlement with an automated{" "}
              <span className="font-mono font-semibold text-emerald-700">90% Creator / 10% Platform</span> commission split.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  onOpenLogin?.();
                  return;
                }
                setShowListForm((prev) => !prev);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white hover:brightness-105 transition-all whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4" />
              <span>
                {showListForm
                  ? "Close Dataset Form"
                  : isAuthenticated
                    ? "List Completed Dataset"
                    : "Sign In to Sell Dataset"}
              </span>
            </button>
          </div>
        </section>

        {errorMsg && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm font-medium flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 text-sm font-medium flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 4-Card KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">QA-Validated Datasets</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
              {metrics.listedDatasetsCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">100% NDPA anonymized</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Licensed Samples Available</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-700">
              {metrics.totalSamplesCount.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">Utterances, frames &amp; eval pairs</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Settled Sales Volume</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
              ${metrics.totalGrossSalesUsd.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">Instant Kora Pay checkout</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Kora Pay Split Rule</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {metrics.sellerPayoutPct}% / {metrics.platformCommissionPct}%
            </p>
            <p className="mt-1 text-xs text-slate-500">Seller payout · Platform fee</p>
          </div>
        </section>

        {/* Completed Dataset Purchases Unlock Banner */}
        {completedPurchases.length > 0 && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-6 space-y-3">
            <h2 className="text-base font-bold text-slate-950 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Unlocked AI Lab Dataset Downloads</span>
            </h2>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {completedPurchases.map((p) => (
                <div
                  key={p.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{p.dataset_title}</p>
                    <p className="text-slate-600 font-mono tabular-nums mt-0.5">
                      Ref: {p.kora_reference} · Split: {p.kora_split_reference} · Paid:{" "}
                      {p.currency} {p.charge_amount.toLocaleString()} ($
                      {p.seller_payout_90pct.toLocaleString()} seller / $
                      {p.platform_commission_10pct.toLocaleString()} 10% fee)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDownloadDatasetBundle(p)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold rounded-lg bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download JSONL Bundle</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Buyer Kora Pay Checkout Drawer */}
        {checkoutDataset && (
          <section className="rounded-2xl border border-blue-200 bg-white p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-blue-700">
                  AI Lab Purchase · Kora Pay 10% Commission Split
                </p>
                <h2 className="text-lg font-bold text-slate-950 mt-0.5">
                  {checkoutDataset.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCheckoutDataset(null);
                  setPendingPurchase(null);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 shrink-0"
              >
                Cancel Checkout
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs">
              <div>
                <p className="text-slate-500">Gross Dataset License</p>
                <p className="mt-1 text-base font-bold font-mono tabular-nums text-slate-950">
                  ${checkoutDataset.price.toLocaleString()} USD
                </p>
              </div>
              <div>
                <p className="text-slate-500">Creator Payout (90%)</p>
                <p className="mt-1 text-base font-bold font-mono tabular-nums text-emerald-700">
                  ${(Math.round(checkoutDataset.price * 0.9 * 100) / 100).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Kora Pay Platform Split (10%)</p>
                <p className="mt-1 text-base font-bold font-mono tabular-nums text-blue-700">
                  ${(Math.round(checkoutDataset.price * 0.1 * 100) / 100).toLocaleString()}
                </p>
              </div>
            </div>

            {pendingPurchase && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-amber-950">
                    Kora Pay Checkout Initialized · Ref:{" "}
                    <span className="font-mono">{pendingPurchase.kora_reference}</span>
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5 font-mono tabular-nums">
                    Amount: {pendingPurchase.currency}{" "}
                    {pendingPurchase.charge_amount.toLocaleString()} · Split ID:{" "}
                    {pendingPurchase.kora_split_reference}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={verifyingPurchase}
                  onClick={() =>
                    void handleVerifyPurchase(pendingPurchase.kora_reference, "success")
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {verifyingPurchase
                      ? "Settling 90/10 Split..."
                      : "Confirm Kora Pay Payment & Unlock Download"}
                  </span>
                </button>
              </div>
            )}

            {!pendingPurchase && (
              <form
                onSubmit={(e) => void handleInitializePurchase(e)}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Buyer AI Lab / Organization
                  </label>
                  <input
                    value={buyerOrgName}
                    onChange={(e) => setBuyerOrgName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dataset Delivery Email
                  </label>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kora Pay Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CertificationCurrency)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-950"
                  >
                    <option value="USD">USD (${checkoutDataset.price.toLocaleString()})</option>
                    <option value="NGN">
                      NGN (₦{Math.round(checkoutDataset.price * 1530).toLocaleString()})
                    </option>
                    <option value="GBP">
                      GBP (£{(Math.round(checkoutDataset.price * 0.79 * 100) / 100).toLocaleString()})
                    </option>
                  </select>
                </div>

                <div className="md:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={initializingPurchase}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span>
                      {initializingPurchase
                        ? "Initializing Kora Pay Split..."
                        : `Pay via Kora Pay (${currency})`}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* Seller: List Completed Dataset Form */}
        {showListForm && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-6 space-y-5">
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  List Completed Dataset for Sale (QA + NDPA Anonymization Gate)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Seller: {userName || "Verified Creator"} ({orgName || "Workspace"}) · Fail-closed check blocks unvalidated (&lt; 85%) or non-anonymized datasets.
                </p>
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold text-emerald-700">
                You keep 90% · Platform fee 10%
              </span>
            </div>

            <form
              onSubmit={(e) => void handlePublishDataset(e)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dataset Title
                </label>
                <input
                  value={listTitle}
                  onChange={(e) => setListTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={listCategory}
                  onChange={(e) => setListCategory(e.target.value as DatasetCategory)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-950"
                >
                  <option value="audio_speech">Audio &amp; Speech</option>
                  <option value="vision_bbox">Vision BBox</option>
                  <option value="multilingual_text">Multilingual Text</option>
                  <option value="red_team_eval">Red-Team Evals</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sample Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={listSamples}
                    onChange={(e) => setListSamples(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Price (USD)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Completed Source Job / Batch ID
                </label>
                <input
                  value={listSourceRef}
                  onChange={(e) => setListSourceRef(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Locale
                  </label>
                  <input
                    value={listLocale}
                    onChange={(e) => setListLocale(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    QA Score (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={listQaScore}
                    onChange={(e) => setListQaScore(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Technical Specification &amp; QA Rubric Summary
                </label>
                <textarea
                  rows={2}
                  value={listDesc}
                  onChange={(e) => setListDesc(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sanitized JSONL Preview Line
                </label>
                <input
                  value={listPreviewSample}
                  onChange={(e) => setListPreviewSample(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap items-center gap-6 pt-1 text-xs">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={listQaValidated}
                    onChange={(e) => setListQaValidated(e.target.checked)}
                  />
                  <span>Automated QA Gate Passed (score &ge; 85%)</span>
                </label>
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={listAnonymized}
                    onChange={(e) => setListAnonymized(e.target.checked)}
                  />
                  <span>PII Anonymized (NDPA 2023 Compliant)</span>
                </label>
              </div>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingListing}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>
                    {submittingListing
                      ? "Running Fail-Closed QA & PII Checks..."
                      : "Publish Dataset to Marketplace"}
                  </span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(Object.keys(CATEGORY_LABELS) as Array<"all" | DatasetCategory>).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  categoryFilter === cat
                    ? "bg-white text-slate-950 shadow-xs"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search datasets"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search locale, audio, vision, red-team..."
              className="pl-8 pr-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-950 w-full md:w-64"
            />
          </div>
        </div>

        {/* Dataset Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading && datasets.length === 0 ? (
            <div className="lg:col-span-2 p-8 text-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
              Loading QA-validated datasets...
            </div>
          ) : datasets.length === 0 ? (
            <div className="lg:col-span-2 p-10 text-center rounded-2xl border border-slate-200 bg-white space-y-2">
              <Sparkles className="w-6 h-6 text-blue-600 mx-auto" />
              <p className="text-sm font-bold text-slate-950">No datasets matched your filter</p>
              <p className="text-xs text-slate-600">
                Clear the search or select another dataset modality above.
              </p>
            </div>
          ) : (
            datasets.map((ds) => {
              const splitCreator = Math.round(ds.price * 0.9 * 100) / 100;
              const splitFee = Math.round((ds.price - splitCreator) * 100) / 100;
              const isPreviewOpen = expandedPreviewId === ds.id;

              return (
                <article
                  key={ds.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between gap-5"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-blue-700">
                        {CATEGORY_LABELS[ds.category]} · {ds.locale}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono tabular-nums font-semibold text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          QA {ds.qa_score}% · Anonymized
                        </span>
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-950 leading-snug">{ds.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{ds.description}</p>

                    <div className="grid grid-cols-3 gap-3 pt-1 border-t border-slate-100 text-xs">
                      <div>
                        <p className="text-slate-500">Samples</p>
                        <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-950">
                          {ds.sample_count.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Format</p>
                        <p className="mt-0.5 font-medium text-slate-800 truncate" title={ds.format_spec}>
                          {ds.format_spec}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Licenses Sold</p>
                        <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-950">
                          {ds.purchases_count}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">
                      Creator: <span className="font-medium text-slate-800">{ds.seller_name}</span>
                    </p>
                    <p className="text-xs font-mono text-slate-500">{ds.qa_report_summary}</p>

                    {isPreviewOpen && ds.preview_samples.length > 0 && (
                      <pre className="p-3 rounded-xl bg-slate-950 text-emerald-300 text-[11px] font-mono overflow-x-auto leading-relaxed">
                        {ds.preview_samples.join("\n")}
                      </pre>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                        ${ds.price.toLocaleString()}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-500">
                        ${splitCreator.toLocaleString()} (90% seller) · ${splitFee.toLocaleString()} (10% fee)
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setExpandedPreviewId(isPreviewOpen ? null : ds.id)}
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {isPreviewOpen ? "Hide Sample" : "Inspect Sample"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutDataset(ds);
                          setPendingPurchase(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Lock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Purchase Dataset</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Authenticated Seller Payout Ledger */}
        {isAuthenticated && sellerSummary && sellerSummary.settledSales.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-950">
                Your Organization Dataset Revenue (90% Net / 10% Kora Pay Split)
              </h2>
              <p className="text-xs font-mono tabular-nums font-semibold text-emerald-700">
                Net Credited: ${sellerSummary.totalSellerNet90PctUsd.toLocaleString()} (Gross: $
                {sellerSummary.totalGrossSalesUsd.toLocaleString()})
              </p>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {sellerSummary.settledSales.map((sale) => (
                <div
                  key={sale.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{sale.dataset_title}</p>
                    <p className="text-slate-500">
                      Buyer: {sale.buyer_org_name} ({sale.buyer_email})
                    </p>
                  </div>
                  <p className="font-mono tabular-nums font-semibold text-slate-900">
                    +${sale.seller_payout_90pct.toLocaleString()} net (10% fee: $
                    {sale.platform_commission_10pct.toLocaleString()}) · {sale.kora_split_reference}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
