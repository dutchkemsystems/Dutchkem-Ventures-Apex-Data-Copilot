import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CreditCard,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { SubscriptionTier } from "../types/tenant";

interface KorapayGlobal {
  initialize: (options: {
    key: string;
    reference: string;
    amount: number;
    currency: "USD" | "NGN" | "GBP";
    customer: { name: string; email: string };
    notification_url?: string;
    metadata?: Record<string, unknown>;
    onSuccess?: (data: { reference?: string; status?: string }) => void;
    onFailed?: (data: { reference?: string; message?: string }) => void;
    onClose?: () => void;
  }) => void;
}

declare global {
  interface Window {
    Korapay?: KorapayGlobal;
  }
}

const KORAPAY_INLINE_CDN =
  "https://korablobstorage.blob.core.windows.net/modal-bucket/korapay-collections.min.js";

function loadKorapayInlineScript(): Promise<KorapayGlobal> {
  if (typeof window !== "undefined" && window.Korapay) {
    return Promise.resolve(window.Korapay);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${KORAPAY_INLINE_CDN}"]`
    );
    if (existing) {
      if (window.Korapay) {
        resolve(window.Korapay);
        return;
      }
      existing.addEventListener("load", () => {
        if (window.Korapay) resolve(window.Korapay);
        else reject(new Error("Kora Pay Inline SDK failed to initialize."));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Unable to load Kora Pay Inline Checkout script."))
      );
      return;
    }

    const script = document.createElement("script");
    script.src = KORAPAY_INLINE_CDN;
    script.async = true;
    script.onload = () => {
      if (window.Korapay) resolve(window.Korapay);
      else reject(new Error("Kora Pay Inline SDK did not expose Korapay object."));
    };
    script.onerror = () => {
      reject(new Error("Unable to reach Kora Pay Inline Checkout CDN."));
    };
    document.head.appendChild(script);
  });
}

interface BillingStatusPayload {
  subscription_tier: SubscriptionTier;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  subscription_locked: boolean;
  subscriptionExpired: boolean;
  monthly_task_count: number;
  monthly_task_limit: number | null;
  trialExpired: boolean;
  quotaExceeded: boolean;
  requiresUpgrade: boolean;
  reason: string | null;
  orgId: string;
  orgName: string;
  koraPublicKey: string;
  webhookConfigured: boolean;
  checkouts: Array<{
    reference: string;
    target_tier: "pro" | "agency";
    amount_usd: number;
    currency?: "USD" | "NGN" | "GBP";
    status: "pending" | "paid" | "failed";
    provider_mode: "korapay_live" | "korapay_sandbox";
    checkout_url: string | null;
    created_at: string;
    paid_at: string | null;
  }>;
}

interface BillingPortalState {
  mode: "korapay_self_serve_portal";
  portalUrl: string;
  invoices: BillingStatusPayload["checkouts"];
}

interface PricingViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  userName: string;
  upgradeToast: string | null;
  onDismissToast: () => void;
  onSubscriptionChanged: () => Promise<void>;
  onBackToHomepage?: () => void;
}

interface ActiveKoraCheckout {
  reference: string;
  target_tier: "pro" | "agency";
  amount_usd: number;
  chargeAmount: number;
  currency: "USD" | "NGN" | "GBP";
  checkout_url: string | null;
  notificationUrl: string;
  provider_mode: "korapay_live" | "korapay_sandbox";
  publicKey: string;
  providerMessage: string | null;
}

const PRICING_PLANS: Array<{
  id: "trial" | "pro" | "agency";
  title: string;
  audience: string;
  priceUsd: number;
  priceNgn: number;
  priceGbp: number;
  taskQuota: string;
  cadence: string;
  popular?: boolean;
  features: string[];
}> = [
  {
    id: "trial",
    title: "Starter (Free Trial)",
    audience: "For solo annotators evaluating automated QA",
    priceUsd: 0,
    priceNgn: 0,
    priceGbp: 0,
    taskQuota: "3 tasks / month",
    cadence: "14-day free trial",
    features: [
      "3 monthly Audio, Vision, or Text QA tasks",
      "PostgreSQL RLS tenant isolation",
      "Real-time Telemetry & Mock Interview Coach",
      "Automatic trial expiration gate after 14 days",
    ],
  },
  {
    id: "pro",
    title: "Pro",
    audience: "For high-output freelancers & boutique leads",
    priceUsd: 49,
    priceNgn: 75000,
    priceGbp: 39,
    taskQuota: "50 tasks / month",
    cadence: "Billed monthly via Kora Pay (Local & Global)",
    popular: true,
    features: [
      "50 tasks / month across Audio, Vision, and Text",
      "Auto-Bidder AI Sales Agent (Upwork, Mercor, TELUS)",
      "Audio QA (librosa 24kHz, SNR > 35 dB, Whisper WER)",
      "YOLOv8 IoU >= 0.70 vision verification gate",
    ],
  },
  {
    id: "agency",
    title: "Agency",
    audience: "For scaling white-label AI data operations",
    priceUsd: 199,
    priceNgn: 305000,
    priceGbp: 158,
    taskQuota: "Unlimited tasks",
    cadence: "Billed monthly via Kora Pay",
    features: [
      "Unlimited monthly tasks & projects",
      "Full White-Label organization branding",
      "80% / 20% Escrow Ledger & Expert Marketplace",
      "10,000-sample Synthetic Factory & Red-Teaming",
    ],
  },
];

export function PricingView({
  orgId,
  orgName,
  userId,
  userEmail,
  userName,
  upgradeToast,
  onDismissToast,
  onSubscriptionChanged,
  onBackToHomepage,
}: PricingViewProps) {
  const [status, setStatus] = useState<BillingStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<"USD" | "NGN" | "GBP">("NGN");
  const [initializingTier, setInitializingTier] = useState<"pro" | "agency" | null>(null);
  const [activeCheckout, setActiveCheckout] = useState<ActiveKoraCheckout | null>(null);
  const [verifyingRef, setVerifyingRef] = useState(false);
  const [launchingInline, setLaunchingInline] = useState(false);
  const [portalBusy, setPortalBusy] = useState<"manage" | "cancel" | null>(null);
  const [portalPanel, setPortalPanel] = useState<BillingPortalState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveUserId = useCallback(
    () => userId || window.localStorage.getItem("apex_user_id") || "",
    [userId]
  );

  const loadBillingStatus = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing/status", {
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": resolveUserId(),
        },
      });
      if (res.ok) {
        const data: BillingStatusPayload = await res.json();
        setStatus(data);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, resolveUserId]);

  const verifyKoraTransaction = useCallback(
    async (reference: string, gatewayStatus?: string) => {
      setVerifyingRef(true);
      setError(null);
      try {
        const res = await fetch("/api/billing/korapay/verify", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
            "x-user-id": resolveUserId(),
          },
          body: JSON.stringify({ reference, gatewayStatus }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 202) {
          setError(
            data.detail ||
              "Transaction is still pending. Please complete checkout in the Kora Pay gateway window first."
          );
          return false;
        }
        if (!res.ok || !data.verified) {
          throw new Error(data.detail || "Kora Pay transaction verification failed.");
        }
        setNotice(
          data.detail ||
            `Payment verified (${reference}). ${orgName} is now upgraded.`
        );
        setActiveCheckout(null);
        onDismissToast();
        await onSubscriptionChanged();
        await loadBillingStatus();
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Transaction verification failed."
        );
        return false;
      } finally {
        setVerifyingRef(false);
      }
    },
    [
      loadBillingStatus,
      onDismissToast,
      onSubscriptionChanged,
      orgId,
      orgName,
      resolveUserId,
    ]
  );

  useEffect(() => {
    void loadBillingStatus();
  }, [loadBillingStatus]);

  // Verify redirect return from Kora Pay hosted gateway
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get("reference");
    const statusParam = params.get("status");
    const portalParam = params.get("portal");
    if (refParam && orgId) {
      window.history.replaceState({}, "", "/pricing");
      void verifyKoraTransaction(refParam);
    } else if (statusParam === "success") {
      window.history.replaceState({}, "", "/pricing");
      setNotice("Checkout session completed. Syncing active subscription entitlement...");
      void onSubscriptionChanged().then(() => loadBillingStatus());
    } else if (statusParam === "canceled") {
      window.history.replaceState({}, "", "/pricing");
      setError("Checkout canceled before payment confirmation.");
    } else if (portalParam === "manage") {
      window.history.replaceState({}, "", "/pricing");
      setNotice("Customer Billing Portal active below.");
    }
  }, [loadBillingStatus, onSubscriptionChanged, orgId, verifyKoraTransaction]);

  async function launchKorapayInline(checkout: ActiveKoraCheckout) {
    if (!checkout.publicKey) {
      setError(
        "Kora Pay public key (NEXT_PUBLIC_KORA_PUBLIC_KEY) is missing from environment configuration."
      );
      return;
    }
    setLaunchingInline(true);
    setError(null);
    try {
      const korapay = await loadKorapayInlineScript();
      korapay.initialize({
        key: checkout.publicKey,
        reference: checkout.reference,
        amount: checkout.chargeAmount,
        currency: checkout.currency,
        customer: {
          name: userName || "Agency Admin",
          email: userEmail || "admin@agency.io",
        },
        notification_url: checkout.notificationUrl,
        metadata: {
          org_id: orgId,
          user_id: resolveUserId(),
          target_tier: checkout.target_tier,
        },
        onSuccess: (payload) => {
          void verifyKoraTransaction(
            payload?.reference || checkout.reference,
            payload?.status || "success"
          );
        },
        onFailed: (payload) => {
          setError(
            payload?.message ||
              `Kora Pay reported a declined or failed payment for ${checkout.reference}.`
          );
        },
        onClose: () => {
          setLaunchingInline(false);
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to open Kora Pay Inline Checkout."
      );
    } finally {
      setLaunchingInline(false);
    }
  }

  async function handleStartKoraUpgrade(tier: "pro" | "agency") {
    setInitializingTier(tier);
    setError(null);
    setNotice(null);
    const priceId = tier === "pro" ? "price_pro_monthly" : "price_agency_monthly";
    try {
      const res = await fetch("/api/payments/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": resolveUserId(),
        },
        body: JSON.stringify({
          price_id: priceId,
          tier,
          currency,
          customerEmail: userEmail,
          customerName: userName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (!data.checkout && !data.checkoutUrl)) {
        throw new Error(data.detail || "Unable to initialize checkout session.");
      }

      const nextCheckout: ActiveKoraCheckout = {
        reference: data.checkout.reference,
        target_tier: data.checkout.target_tier,
        amount_usd: data.checkout.amount_usd,
        chargeAmount: data.chargeAmount ?? data.checkout.amount_usd,
        currency: data.currency ?? currency,
        checkout_url: data.checkoutUrl ?? null,
        notificationUrl: data.notificationUrl ?? "",
        provider_mode: data.checkout.provider_mode,
        publicKey: data.publicKey || "",
        providerMessage: data.providerMessage ?? null,
      };
      setActiveCheckout(nextCheckout);
      await loadBillingStatus();

      if (data.inlineReady && nextCheckout.publicKey) {
        await launchKorapayInline(nextCheckout);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment checkout failed.");
    } finally {
      setInitializingTier(null);
    }
  }

  async function handleBillingPortal(action: "manage" | "cancel") {
    setPortalBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/payments/portal", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": resolveUserId(),
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Unable to open Customer Billing Portal.");
      }

      if (action === "cancel") {
        setPortalPanel(null);
        await onSubscriptionChanged();
        await loadBillingStatus();
        setNotice(
          `Subscription canceled via Billing Portal. ${orgName} has been downgraded to Trial (3 tasks/month) and workspace access is locked.`
        );
        return;
      }

      setPortalPanel({
        mode: data.mode || "korapay_self_serve_portal",
        portalUrl: data.portalUrl || "/pricing?portal=manage",
        invoices: Array.isArray(data.invoices) ? data.invoices : status?.checkouts || [],
      });
      setNotice("Customer Billing Portal opened below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing portal request failed.");
    } finally {
      setPortalBusy(null);
    }
  }

  async function handleSimulateTrial(
    scenario: "reset_trial" | "expire_trial" | "exceed_quota"
  ) {
    setError(null);
    try {
      const res = await fetch("/api/billing/trial-simulate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": resolveUserId(),
        },
        body: JSON.stringify({ scenario }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || "Unable to update trial simulation state.");
      }
      await onSubscriptionChanged();
      await loadBillingStatus();
      setNotice(
        scenario === "reset_trial"
          ? "14-day Starter Trial active (2 / 3 tasks used)."
          : "Trial gate triggered: Upgrade to continue using the Apex Copilot."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trial update failed.");
    }
  }

  const currentTier = status?.subscription_tier ?? "trial";
  const isCurrentPlan = (planId: "trial" | "pro" | "agency") =>
    planId === currentTier ||
    (planId === "agency" && currentTier === "enterprise_whitelabel") ||
    (planId === "pro" && currentTier === "growth");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-amber-700">
            {orgName} · Subscriptions & Live Kora Pay Checkout
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Pricing & Trial Plan Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Start with a 14-day free trial (3 tasks/month), then upgrade live via Kora Pay Inline Checkout.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setCurrency("NGN")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                currency === "NGN"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              NGN (₦ · Home)
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                currency === "USD"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              USD ($ · Abroad)
            </button>
            <button
              type="button"
              onClick={() => setCurrency("GBP")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                currency === "GBP"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              GBP (£ · Abroad)
            </button>
          </div>

          {onBackToHomepage && (
            <button
              type="button"
              onClick={onBackToHomepage}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Homepage</span>
            </button>
          )}
        </div>
      </div>

      {/* Trial Gating Toast Message */}
      {(upgradeToast || status?.requiresUpgrade) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-medium">
              {upgradeToast || "Upgrade to continue using the Apex Copilot."}
            </span>
          </div>
          {upgradeToast && (
            <button
              type="button"
              onClick={onDismissToast}
              aria-label="Dismiss upgrade toast"
              className="text-amber-700 hover:text-amber-950 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Active Subscription & Quota Telemetry Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4 border border-slate-200 bg-white rounded-lg p-5">
        <div>
          <p className="text-xs font-medium text-slate-500">Current Tier</p>
          <p className="mt-1 text-lg font-semibold capitalize text-slate-900">
            {loading ? "..." : currentTier.replace("_", " ")}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Monthly Task Quota</p>
          <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
            {loading
              ? "..."
              : `${status?.monthly_task_count ?? 0} / ${
                  status?.monthly_task_limit === null
                    ? "Unlimited"
                    : status?.monthly_task_limit ?? 3
                }`}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Billing Window</p>
          <p className="mt-1 text-sm font-mono tabular-nums text-slate-800">
            {status?.subscription_locked
              ? "Locked (Downgraded)"
              : status?.subscription_ends_at
                ? status.subscriptionExpired
                  ? "Cycle Expired"
                  : `Renews ${new Date(status.subscription_ends_at).toLocaleDateString()}`
                : status?.trial_ends_at
                  ? status.trialExpired
                    ? "Trial Expired"
                    : `Trial ends ${new Date(status.trial_ends_at).toLocaleDateString()}`
                  : "Active Paid Subscription"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Payment Gateway</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            Kora Pay {status?.koraPublicKey ? `(${status.koraPublicKey.slice(0, 12)}...)` : ""}
          </p>
        </div>
      </section>

      {/* 3-Column Pricing Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {PRICING_PLANS.map((plan, idx) => {
          const current = isCurrentPlan(plan.id);
          const displayPrice =
            currency === "NGN"
              ? `₦${plan.priceNgn.toLocaleString()}`
              : currency === "GBP"
                ? `£${plan.priceGbp}`
                : `$${plan.priceUsd}`;
          return (
            <motion.section
              key={plan.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className={`rounded-xl bg-white p-7 flex flex-col justify-between transition-all ${
                plan.popular
                  ? "border-2 border-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.24)]"
                  : "border border-slate-200"
              }`}
            >
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{plan.title}</h2>
                    {plan.popular && (
                      <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">
                        Most Popular
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{plan.audience}</p>
                </div>

                <div className="border-y border-slate-100 py-4">
                  <p className="text-3xl font-semibold font-mono tabular-nums text-slate-900">
                    {displayPrice}
                    <span className="text-sm font-normal text-slate-500">/mo</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {plan.taskQuota} · {plan.cadence}
                  </p>
                </div>

                <ul className="space-y-3 text-sm text-slate-700">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-8">
                {plan.id === "trial" ? (
                  <button
                    type="button"
                    onClick={() => void handleSimulateTrial("reset_trial")}
                    className="w-full px-4 py-2.5 text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap"
                  >
                    {current ? "Active 14-Day Free Trial" : "Test 14-Day Trial Mode"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={initializingTier !== null || current}
                    onClick={() => void handleStartKoraUpgrade(plan.id as "pro" | "agency")}
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap disabled:opacity-60 ${
                      plan.popular
                        ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 shadow-[0_6px_22px_rgba(245,158,11,0.3)] hover:brightness-105"
                        : "bg-[#0F172A] text-white hover:bg-slate-800"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>
                      {current
                        ? `Current Plan (${plan.title})`
                        : initializingTier === plan.id
                          ? "Launching Kora Pay..."
                          : `Upgrade to ${plan.title} · ${displayPrice}/mo`}
                    </span>
                  </button>
                )}
              </div>
            </motion.section>
          );
        })}
      </div>

      {/* Customer Billing Portal & Subscription Lifecycle */}
      <section className="border border-slate-200 bg-white rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Customer Billing Portal
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage active invoices, billing renewal cycles, or cancel your paid subscription via Kora Pay Customer Portal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={portalBusy !== null}
              onClick={() => void handleBillingPortal("manage")}
              className="px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white rounded-md text-slate-800 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {portalBusy === "manage" ? "Loading Portal..." : "Open Customer Billing Portal"}
            </button>
            {(currentTier === "pro" || currentTier === "agency") && (
              <button
                type="button"
                disabled={portalBusy !== null}
                onClick={() => void handleBillingPortal("cancel")}
                className="px-3.5 py-2 text-xs font-medium border border-red-200 bg-red-50 rounded-md text-red-700 hover:bg-red-100 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {portalBusy === "cancel" ? "Canceling..." : "Cancel Subscription"}
              </button>
            )}
          </div>
        </div>

        {portalPanel && (
          <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-900">Portal Mode:</span>{" "}
              <span className="font-mono">{portalPanel.mode}</span> ·{" "}
              <span className="font-mono tabular-nums">
                {portalPanel.invoices.length} invoice record(s)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPortalPanel(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 underline self-start sm:self-auto whitespace-nowrap"
            >
              Close Portal Summary
            </button>
          </div>
        )}
      </section>

      {/* Trial Gating Verification Controls */}
      <section className="border border-slate-200 bg-white rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Trial Enforcement Controls
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Verify 14-day expiration or 3-task limit enforcement on {orgName} prior to Kora Pay settlement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSimulateTrial("exceed_quota")}
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Simulate 3/3 Task Limit
          </button>
          <button
            type="button"
            onClick={() => void handleSimulateTrial("expire_trial")}
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Simulate 14-Day Expiry
          </button>
          <button
            type="button"
            onClick={() => void handleSimulateTrial("reset_trial")}
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Reset Active Trial
          </button>
        </div>
      </section>

      {/* Recent Kora Pay Billing Transactions */}
      {status && status.checkouts.length > 0 && (
        <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Kora Pay Billing Ledger
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-medium">Reference</th>
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Mode</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {status.checkouts.map((c) => (
                  <tr key={c.reference} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3 font-mono text-slate-800">{c.reference}</td>
                    <td className="px-6 py-3 capitalize text-slate-700">{c.target_tier}</td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums text-slate-900">
                      ${c.amount_usd.toFixed(2)} ({c.currency ?? "USD"})
                    </td>
                    <td
                      className={`px-6 py-3 capitalize font-medium ${
                        c.status === "paid"
                          ? "text-emerald-700"
                          : c.status === "failed"
                            ? "text-red-700"
                            : "text-amber-700"
                      }`}
                    >
                      {c.status}
                    </td>
                    <td className="px-6 py-3 font-mono text-slate-500">{c.provider_mode}</td>
                    <td className="px-6 py-3 text-right">
                      {c.status === "pending" ? (
                        <button
                          type="button"
                          disabled={verifyingRef}
                          onClick={() => void verifyKoraTransaction(c.reference)}
                          className="text-xs font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
                        >
                          Verify Status
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Kora Pay Checkout Session Panel */}
      {activeCheckout && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-base font-semibold text-slate-900">
                  Kora Pay Live Checkout
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveCheckout(null)}
                aria-label="Close Kora Pay modal"
                className="p-1 text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Organization</span>
                <span className="font-medium text-slate-900">{orgName}</span>
              </div>
              <div className="flex justify-between">
                <span>Target Tier</span>
                <span className="font-semibold uppercase text-amber-700">
                  {activeCheckout.target_tier}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Monthly Charge</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {activeCheckout.currency === "NGN"
                    ? `₦${activeCheckout.chargeAmount.toLocaleString()} NGN`
                    : activeCheckout.currency === "GBP"
                      ? `£${activeCheckout.chargeAmount.toFixed(2)} GBP`
                      : `$${activeCheckout.chargeAmount.toFixed(2)} USD`}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Reference</span>
                <span className="font-mono text-slate-700">{activeCheckout.reference}</span>
              </div>
              {activeCheckout.publicKey && (
                <div className="flex justify-between text-xs">
                  <span>Merchant Public Key</span>
                  <span className="font-mono text-slate-500">
                    {activeCheckout.publicKey.slice(0, 16)}...
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-2">
              {activeCheckout.publicKey && (
                <button
                  type="button"
                  disabled={launchingInline}
                  onClick={() => void launchKorapayInline(activeCheckout)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 hover:brightness-105 disabled:opacity-60 whitespace-nowrap"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {launchingInline
                      ? "Opening Kora Pay Gateway..."
                      : "Launch Kora Pay Payment Modal"}
                  </span>
                </button>
              )}

              {activeCheckout.checkout_url && (
                <a
                  href={activeCheckout.checkout_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-md border border-slate-200 text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  <span>Open Hosted Kora Pay Gateway</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <button
                type="button"
                disabled={verifyingRef}
                onClick={() => void verifyKoraTransaction(activeCheckout.reference)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${verifyingRef ? "animate-spin" : ""}`} />
                <span>
                  {verifyingRef
                    ? "Verifying with Kora Pay..."
                    : "Verify Transaction Status"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
