import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  Landmark,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react";
import type {
  KoraEscrowCurrency,
  KoraEscrowSetupOverview,
  KoraFundEscrowResponse,
  UserRole,
} from "../types/tenant";

const AdminEscrowControls = lazy(() => import("../planes/admin/AdminEscrowControls"));
const AdminDisputeReviewPanel = lazy(() => import("../planes/admin/AdminDisputeReviewPanel"));

interface KoraPayoutStatusViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  userRole: UserRole;
}

export function KoraPayoutStatusView({
  orgId,
  orgName,
  userId,
  userName,
  userRole,
}: KoraPayoutStatusViewProps) {
  const [data, setData] = useState<KoraEscrowSetupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Recipient onboarding state
  const [recipientIdInput, setRecipientIdInput] = useState("");
  const [payoutCurrency, setPayoutCurrency] = useState<KoraEscrowCurrency>("NGN");
  const [bankAccountLabel, setBankAccountLabel] = useState("Providus / Access NGN Settlement");
  const [onboardingSaving, setOnboardingSaving] = useState(false);

  // Admin split-rule state
  const [platformSettlementAccount, setPlatformSettlementAccount] = useState(
    "kp_acct_dutchkem_main_001"
  );
  const [vatRatePct, setVatRatePct] = useState(7.5);
  const [ruleSaving, setRuleSaving] = useState(false);

  // Phase 18B: Client Funds the Escrow (Kora Pay-In)
  const [fundTaskTitle, setFundTaskTitle] = useState(
    "Lagos Yoruba & Pidgin 24kHz Corpus Batch (Phase 18B)"
  );
  const [fundAmount, setFundAmount] = useState("1500");
  const [fundCurrency, setFundCurrency] = useState<KoraEscrowCurrency>("USD");
  const [fundFreelancerId, setFundFreelancerId] = useState("");
  const [fundingSubmitting, setFundingSubmitting] = useState(false);
  const [latestCheckout, setLatestCheckout] = useState<KoraFundEscrowResponse | null>(null);
  const [confirmingRef, setConfirmingRef] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null);
  const [partialSplitPctMap, setPartialSplitPctMap] = useState<Record<string, number>>({});
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kora-escrow/config", {
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to load Kora Pay 85/15 escrow configuration.");
      }
      const payload = body as KoraEscrowSetupOverview;
      setData(payload);
      setRecipientIdInput(
        payload.currentUserRecipientId ||
          `kp_rcpt_${userName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}_01`
      );
      setPlatformSettlementAccount(payload.splitRule.platformSettlementAccount);
      setVatRatePct(payload.splitRule.vatRateOnPlatformFeePct);
      if (payload.freelancers.length > 0) {
        setFundFreelancerId((prev) => {
          if (prev && payload.freelancers.some((f) => f.id === prev)) {
            return prev;
          }
          const annotator =
            payload.freelancers.find((f) => f.role === "annotator") || payload.freelancers[0];
          return annotator.id;
        });
      } else {
        setFundFreelancerId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Kora Pay escrow config.");
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, userName]);

  useEffect(() => {
    setLatestCheckout(null);
    setError(null);
    setNotice(null);
  }, [orgId, userId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleOnboardRecipient(e: React.FormEvent) {
    e.preventDefault();
    setOnboardingSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/kora-escrow/recipient/onboard", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          kora_recipient_id: recipientIdInput.trim(),
          currency: payoutCurrency,
          settlement_bank_label: bankAccountLabel.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to bind Kora Pay recipient ID.");
      }
      setNotice(
        `Kora recipient ID ${body.kora_recipient_id} bound for ${payoutCurrency} 85/15 split payouts.`
      );
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipient onboarding.");
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function handleUpdateSplitRule(e: React.FormEvent) {
    e.preventDefault();
    setRuleSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/kora-escrow/split-rule", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          name: "apex-marketplace-split",
          freelancerSharePct: 85,
          platformSharePct: 15,
          platformSettlementAccount: platformSettlementAccount.trim(),
          supportedCurrencies: ["NGN", "USD"],
          vatRateOnPlatformFeePct: vatRatePct,
          active: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to update apex-marketplace-split rule.");
      }
      setNotice(
        `Reusable split rule "${body.splitRule.name}" verified: 85% Freelancer / 15% Platform across NGN & USD.`
      );
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save split rule.");
    } finally {
      setRuleSaving(false);
    }
  }

  async function handleFundEscrow(e: React.FormEvent) {
    e.preventDefault();
    setFundingSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const taskId = `task-18b-${Date.now().toString(36)}`;
      const res = await fetch("/api/escrow/fund", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          task_id: taskId,
          task_title: fundTaskTitle.trim(),
          amount: Number(fundAmount),
          currency: fundCurrency,
          freelancer_id: fundFreelancerId || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to initialize Kora Pay escrow funding.");
      }
      const fundResult = body as KoraFundEscrowResponse;
      setLatestCheckout(fundResult);
      setNotice(
        `Kora Pay escrow initialized (${fundResult.currency} ${fundResult.amount.toLocaleString()}) · Ref ${fundResult.reference}. Funds will sit in platform balance until QA passes (no split triggered yet).`
      );
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Escrow pay-in initialization failed.");
    } finally {
      setFundingSubmitting(false);
    }
  }

  async function handleConfirmChargeSuccess(reference: string, escrowId?: string) {
    setConfirmingRef(reference);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/escrow/fund/simulate-charge-success", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({ reference, escrow_id: escrowId }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to verify charge.success webhook.");
      }
      setLatestCheckout(null);
      setNotice(
        `HMAC-verified charge.success confirmed for ${reference}. Escrow status is now "funded" in platform Kora balance (85/15 split held until QA passes).`
      );
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Webhook confirmation failed.");
    } finally {
      setConfirmingRef(null);
    }
  }

  async function handleReleaseEscrow(escrowId: string, qaPassed: boolean) {
    setReleasingId(escrowId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/escrow/release", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          escrow_id: escrowId,
          qa_passed: qaPassed,
          qa_report_summary: qaPassed
            ? "Python QA Worker Verified: 24kHz Mono · 43.8 dB SNR · Zero Clipping · Mean IoU 0.91."
            : "Python QA Worker Failed (16.2% > 10% threshold): Excessive Noise Floor (-50.4 dBFS) detected in batch utterances.",
          failure_rate_pct: qaPassed ? 0 : 16.2,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to execute QA escrow release.");
      }
      if (qaPassed) {
        setNotice(
          `QA Passed -> 85/15 Split Released (${body.kora_split_reference})! Tax receipt ${body.tax_receipt?.receipt_number} generated. T+2 settlement started.`
        );
      } else {
        setNotice(
          `QA Failed -> Escrow ${escrowId} flagged DISPUTED (no split triggered). Failed QA report surfaced for Admin review.`
        );
      }
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Escrow QA release failed.");
    } finally {
      setReleasingId(null);
    }
  }

  async function handleSimulateTransferCompleted(escrowId: string, splitRef: string | null) {
    setSettlingId(escrowId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/escrow/settlement/simulate-transfer-completed", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({ escrow_id: escrowId, reference: splitRef || escrowId }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to process transfer.completed settlement.");
      }
      setNotice(
        `HMAC-verified transfer.completed confirmed! Freelancer payout settled at ${new Date(
          body.settled_at
        ).toLocaleString()} (15% platform fee retained in merchant balance).`
      );
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement confirmation failed.");
    } finally {
      setSettlingId(null);
    }
  }

  async function handleResolveDispute(
    escrowId: string,
    action: "release_full" | "refund_client" | "partial_release",
    freelancerPct?: number
  ) {
    setResolvingDisputeId(escrowId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/escrow/disputes/${escrowId}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          action,
          freelancer_pct: action === "partial_release" ? freelancerPct ?? 50 : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to execute dispute resolution.");
      }
      if (action === "refund_client") {
        setNotice(
          `Kora Refund API executed (${body.kora_refund_reference}): ${body.currency} ${Number(
            body.refunded_amount
          ).toLocaleString()} refunded to client.`
        );
      } else if (action === "partial_release") {
        setNotice(
          `Partial Release (${body.freelancer_pct}/${body.platform_pct} split) executed -> ${body.kora_split_reference}. Tax receipt ${body.tax_receipt?.receipt_number} generated.`
        );
      } else {
        setNotice(
          `Release Full (85/15 split) executed -> ${body.kora_split_reference}. Tax receipt ${body.tax_receipt?.receipt_number} generated.`
        );
      }
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispute resolution failed.");
    } finally {
      setResolvingDisputeId(null);
    }
  }

  async function handleAcknowledgeAlert(alertId: string) {
    setAcknowledgingAlertId(alertId);
    setError(null);
    try {
      const res = await fetch(`/api/escrow/alerts/${alertId}/acknowledge`, {
        method: "POST",
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to acknowledge webhook alert.");
      }
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge webhook alert.");
    } finally {
      setAcknowledgingAlertId(null);
    }
  }

  async function handleDownloadReceiptPdf(receiptId: string, receiptNumber: string) {
    setDownloadingId(receiptId);
    setError(null);
    try {
      const res = await fetch(`/api/kora-escrow/tax-receipts/${receiptId}/pdf`, {
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to generate tax receipt PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${receiptNumber.toLowerCase()}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  function formatMoney(amount: number, currency: KoraEscrowCurrency) {
    return currency === "NGN"
      ? `₦${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-28 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        <div className="h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const envEntries = Object.entries(data.envReadiness) as Array<[string, boolean]>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            Phase 18A–18F · Kora Pay Multi-Currency Escrow, Settlement &amp; Webhook Idempotency
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Kora Pay 85/15 Split Rule &amp; Payout Status
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
            {orgName} runs 100% on Kora Pay across NGN and USD. Funds stay in the platform
            merchant balance until QA approval triggers{" "}
            <span className="font-mono font-semibold text-slate-900">
              {data.splitRule.name}
            </span>{" "}
            (85% freelancer / 15% platform), T+2 payout tracking, and VAT-compliant PDF tax receipts.
          </p>
        </div>

        <div className="text-left lg:text-right shrink-0">
          <p className="text-xs font-medium text-slate-500">Indicative FX Settlement Rate</p>
          <p className="text-lg font-bold font-mono tabular-nums text-slate-950">
            $1.00 USD = ₦{data.usdToNgnRate.toLocaleString()} NGN
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-900">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-900">
          {notice}
        </div>
      )}

      {/* Phase 18F: Admin Alert Banner for transfer.failed webhooks */}
      {isAdmin && data.adminWebhookAlerts.some((a) => !a.acknowledged) && (
        <section className="p-5 bg-red-50 border border-red-200 rounded-2xl space-y-3">
          <div className="flex items-center gap-2.5 text-red-950">
            <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
            <h2 className="text-sm font-bold">
              Admin Alert: Kora Pay transfer.failed Webhook Notifications
            </h2>
          </div>
          <div className="space-y-2">
            {data.adminWebhookAlerts
              .filter((a) => !a.acknowledged)
              .map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 bg-white border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-semibold text-slate-950">
                      {alert.freelancer_name} ·{" "}
                      <span className="font-mono text-red-700">
                        {formatMoney(alert.amount, alert.currency)}
                      </span>{" "}
                      · Ref <span className="font-mono">{alert.reference}</span>
                    </p>
                    <p className="text-red-800">{alert.reason}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      X-Event-ID: {alert.event_id} · {new Date(alert.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={acknowledgingAlertId === alert.id}
                    onClick={() => void handleAcknowledgeAlert(alert.id)}
                    className="min-h-[44px] px-3.5 py-2 font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {acknowledgingAlertId === alert.id ? "Acknowledging..." : "Acknowledge Alert"}
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Split Rule + Environment Variables Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 p-6 bg-white border border-slate-200 rounded-2xl space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Reusable Split Rule: <span className="font-mono">{data.splitRule.name}</span>
                </h2>
                <p className="text-xs text-slate-600">
                  Dynamically settles in NGN or USD per transaction currency on QA release.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold font-mono text-emerald-700 whitespace-nowrap shrink-0">
              {data.splitRule.active ? "Active Rule" : "Paused"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <p className="text-xs font-medium text-slate-500">Freelancer Split</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {data.splitRule.freelancerSharePct}%
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Platform Fee</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-blue-700">
                {data.splitRule.platformSharePct}%
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Settlement SLA</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-950">
                T+{data.splitRule.settlementWindowDays}
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdateSplitRule} className="pt-4 border-t border-slate-100 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Platform Default Settlement Account
                </label>
                <input
                  type="text"
                  value={platformSettlementAccount}
                  onChange={(e) => setPlatformSettlementAccount(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full min-h-[44px] px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  VAT Rate on 15% Platform Fee (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={25}
                  value={vatRatePct}
                  onChange={(e) => setVatRatePct(Number(e.target.value))}
                  disabled={!isAdmin}
                  className="w-full min-h-[44px] px-3 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-70"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Currencies: <span className="font-mono font-semibold text-slate-800">NGN, USD</span> ·
                Last verified {new Date(data.splitRule.updatedAt).toLocaleDateString()}
              </p>
              {isAdmin ? (
                <button
                  type="submit"
                  disabled={ruleSaving}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold bg-slate-950 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {ruleSaving ? "Saving Rule..." : "Save 85/15 Split Rule"}
                </button>
              ) : (
                <span className="text-xs text-slate-500">Admin role required to edit rule</span>
              )}
            </div>
          </form>
        </section>

        {/* Kora Env Readiness & Recipient Onboarding */}
        <section className="lg:col-span-5 p-4 sm:p-6 bg-white border border-slate-200 rounded-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">
                Kora Pay Keys &amp; Recipient Onboarding
              </h2>
              <p className="text-xs text-slate-600">
                Environment status and freelancer <span className="font-mono">kora_recipient_id</span> binding.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {envEntries.map(([envName, configured]) => (
              <div
                key={envName}
                className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2"
              >
                <span className="font-mono text-[11px] text-slate-800 truncate">{envName}</span>
                <span
                  className={`font-semibold whitespace-nowrap shrink-0 ${
                    configured ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {configured ? "Set" : "Env Ready"}
                </span>
              </div>
            ))}
          </div>

          <form onSubmit={handleOnboardRecipient} className="pt-3 border-t border-slate-100 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Active User Kora Recipient ID ({userName})
              </label>
              <input
                type="text"
                required
                value={recipientIdInput}
                onChange={(e) => setRecipientIdInput(e.target.value)}
                placeholder="kp_rcpt_..."
                className="w-full min-h-[44px] px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Settlement Currency
                </label>
                <select
                  value={payoutCurrency}
                  onChange={(e) => setPayoutCurrency(e.target.value as KoraEscrowCurrency)}
                  className="w-full min-h-[44px] px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="NGN">NGN (Nigerian Naira)</option>
                  <option value="USD">USD (US Dollar)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bank / Rail Label
                </label>
                <input
                  type="text"
                  value={bankAccountLabel}
                  onChange={(e) => setBankAccountLabel(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={onboardingSaving}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-emerald-600 text-white rounded-lg hover:opacity-95 transition-opacity whitespace-nowrap disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              <span>
                {onboardingSaving
                  ? "Registering Kora Recipient..."
                  : data.currentUserRecipientId
                    ? "Update Kora Recipient ID"
                    : "Bind Kora Recipient ID"}
              </span>
            </button>
          </form>
        </section>
      </div>

      {/* Phase 18B: Admin/Finance Escrow Funding (Code-Split Admin Chunk) */}
      {isAdmin && (
        <Suspense fallback={null}>
          <AdminEscrowControls
            freelancers={data.freelancers}
            fundTaskTitle={fundTaskTitle}
            fundFreelancerId={fundFreelancerId}
            fundAmount={fundAmount}
            fundCurrency={fundCurrency}
            fundingSubmitting={fundingSubmitting}
            onChangeTitle={setFundTaskTitle}
            onChangeFreelancerId={setFundFreelancerId}
            onChangeAmount={setFundAmount}
            onChangeCurrency={setFundCurrency}
            onSubmitFundEscrow={handleFundEscrow}
          />
        </Suspense>
      )}
      {latestCheckout && (
        <section className="p-6 bg-white border border-slate-200 rounded-2xl space-y-5">
          <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="space-y-1 min-w-0">
              <p className="font-bold text-blue-950">
                Checkout Initialized ({latestCheckout.provider_mode === "korapay_live" ? "Live Kora Pay" : "Kora Pay Sandbox"})
              </p>
              <p className="font-mono text-blue-800 truncate">
                Ref: {latestCheckout.reference} · {latestCheckout.currency}{" "}
                {latestCheckout.amount.toLocaleString()} · Status: {latestCheckout.status}
              </p>
              <p className="font-mono text-[11px] text-slate-600 truncate">
                checkout_url: {latestCheckout.checkout_url}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {latestCheckout.provider_mode === "korapay_live" && (
                <a
                  href={latestCheckout.checkout_url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] inline-flex items-center px-3 py-2 font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 whitespace-nowrap"
                >
                  Open Kora Checkout
                </a>
              )}
              <button
                type="button"
                onClick={() => void handleConfirmChargeSuccess(latestCheckout.reference)}
                disabled={confirmingRef === latestCheckout.reference}
                className="min-h-[44px] px-3 py-2 font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 whitespace-nowrap disabled:opacity-50"
              >
                {confirmingRef === latestCheckout.reference
                  ? "Verifying HMAC..."
                  : "Simulate charge.success Webhook"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Admin Dispute Review Card (Lazy-loaded isolated admin chunk) */}
      {isAdmin && (
        <Suspense fallback={null}>
          <AdminDisputeReviewPanel
            disputedEntries={data.escrowLedger.filter(
              (entry) =>
                entry.status === "disputed" ||
                (entry.status === "funded" && entry.qa_passed === false)
            )}
            partialSplitPctMap={partialSplitPctMap}
            resolvingDisputeId={resolvingDisputeId}
            onChangePartialPct={(entryId, pct) =>
              setPartialSplitPctMap((prev) => ({ ...prev, [entryId]: pct }))
            }
            onResolveDispute={(id, action, pct) => void handleResolveDispute(id, action, pct)}
            formatMoney={formatMoney}
          />
        </Suspense>
      )}

      {/* Freelancer Payout Status & T+2 Timeline */}
      <section className="p-6 bg-white border border-slate-200 rounded-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Freelancer Payout Status &amp; T+2 Settlement Tracker
              </h2>
              <p className="text-xs text-slate-600">
                Multi-currency 85/15 escrow ledger entries, T+2 settlement countdown, and PDF tax receipts.
              </p>
            </div>
          </div>
          <p className="text-xs font-mono text-slate-500">
            Your Recipient ID:{" "}
            <span className="font-semibold text-slate-900">
              {data.currentUserRecipientId || "Not onboarded yet"}
            </span>
          </p>
        </div>

        {/* Phase 18D T+2 Settlement & USD->NGN Conversion Callout */}
        {data.escrowLedger.some((e) => e.status === "released") && (
          <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <p className="font-bold text-blue-950">
                Your payout is being processed. Expected settlement: 2 business days (T+2).
              </p>
              <p className="text-blue-800">
                USD payouts settling to Nigerian NGN accounts convert at{" "}
                <span className="font-mono font-semibold tabular-nums">
                  $1.00 = ₦{data.usdToNgnRate.toLocaleString()}
                </span>
                . Platform 15% fee stays settled in merchant balance; VAT-compliant PDF receipts are ready below.
              </p>
            </div>
            <span className="font-mono font-semibold text-blue-800 whitespace-nowrap shrink-0">
              {data.escrowLedger.filter((e) => e.status === "released").length} in T+2 Clearing
            </span>
          </div>
        )}

        {/* Mobile Stacked Cards (< md) */}
        <div className="md:hidden space-y-3">
          {data.escrowLedger.map((entry) => {
            const receipt = data.taxReceipts.find((r) => r.id === entry.tax_receipt_id);
            const isProcessingT2 = entry.status === "released";
            const isSettled = entry.status === "settled";
            const ngnConversion =
              entry.currency === "USD"
                ? Math.round(entry.freelancer_payout * data.usdToNgnRate)
                : null;

            return (
              <div
                key={entry.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950 leading-snug">
                      {entry.task_title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {entry.client_name} → {entry.freelancer_name}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500 break-all">
                      Tx: {entry.kora_transaction_reference}
                      {entry.kora_split_reference ? ` · Split: ${entry.kora_split_reference}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-800 shrink-0">
                    {entry.currency}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-xs">
                  <div>
                    <p className="text-[11px] text-slate-500">Gross</p>
                    <p className="font-mono tabular-nums font-semibold text-slate-900">
                      {formatMoney(entry.gross_amount, entry.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Fee (15%)</p>
                    <p className="font-mono tabular-nums font-semibold text-blue-700">
                      {formatMoney(entry.platform_fee, entry.currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Net (85%)</p>
                    <p className="font-mono tabular-nums font-bold text-emerald-700">
                      {formatMoney(entry.freelancer_payout, entry.currency)}
                    </p>
                    {ngnConversion !== null && (
                      <p className="text-[10px] font-mono text-slate-500">
                        ≈ ₦{ngnConversion.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/80 space-y-2 text-xs">
                  {isProcessingT2 ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Released (T+2 Processing)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleSimulateTransferCompleted(entry.id, entry.kora_split_reference)
                        }
                        disabled={settlingId === entry.id}
                        className="w-full min-h-[44px] px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {settlingId === entry.id ? "Settling..." : "Simulate transfer.completed"}
                      </button>
                    </>
                  ) : isSettled ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Settled via Kora Pay</span>
                      </span>
                      {entry.settled_at && (
                        <span className="font-mono text-[11px] text-slate-500">
                          {new Date(entry.settled_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ) : entry.status === "pending_funding" ? (
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Pending Kora Pay-In</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleConfirmChargeSuccess(entry.kora_transaction_reference, entry.id)
                        }
                        disabled={confirmingRef === entry.kora_transaction_reference}
                        className="w-full min-h-[44px] px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {confirmingRef === entry.kora_transaction_reference
                          ? "Verifying HMAC..."
                          : "Verify charge.success"}
                      </button>
                    </div>
                  ) : entry.status === "refunded" ? (
                    <div className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-slate-600" />
                      <span>Refunded to Client</span>
                    </div>
                  ) : entry.status === "failed" ||
                    entry.status === "disputed" ||
                    (entry.status === "funded" && entry.qa_passed === false) ? (
                    <div className="space-y-1 text-red-900">
                      <div className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {entry.status === "failed"
                            ? "Transfer Failed"
                            : entry.status === "disputed"
                              ? "Disputed"
                              : "Funded Hold (QA Failed >10%)"}
                        </span>
                      </div>
                      <p className="text-[11px] text-red-800">
                        {entry.failure_reason ||
                          entry.qa_report_summary ||
                          "Awaiting admin dispute review."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span className="capitalize">{entry.status} in Platform Balance</span>
                      </div>
                      {entry.status === "funded" && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={() => void handleReleaseEscrow(entry.id, true)}
                            disabled={releasingId === entry.id}
                            className="flex-1 min-h-[44px] px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {releasingId === entry.id ? "Releasing..." : "QA Pass → 85/15 Split"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReleaseEscrow(entry.id, false)}
                            disabled={releasingId === entry.id}
                            className="flex-1 min-h-[44px] px-3 py-2 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50"
                          >
                            QA Fail → Dispute
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {receipt && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadReceiptPdf(receipt.id, receipt.receipt_number)
                      }
                      disabled={downloadingId === receipt.id}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-blue-50 text-slate-900 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-700" />
                      <span>{downloadingId === receipt.id ? "Generating..." : "Download PDF Receipt"}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-4">Task &amp; Parties</th>
                <th className="py-3 px-4">Currency</th>
                <th className="py-3 px-4 text-right">Gross Escrow</th>
                <th className="py-3 px-4 text-right">Platform Fee (15%)</th>
                <th className="py-3 px-4 text-right">Freelancer Net (85%)</th>
                <th className="py-3 px-4">Status &amp; T+2 Timeline</th>
                <th className="py-3 pl-4 text-right">Tax Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.escrowLedger.map((entry) => {
                const receipt = data.taxReceipts.find((r) => r.id === entry.tax_receipt_id);
                const isProcessingT2 = entry.status === "released";
                const isSettled = entry.status === "settled";
                const ngnConversion =
                  entry.currency === "USD"
                    ? Math.round(entry.freelancer_payout * data.usdToNgnRate)
                    : null;

                return (
                  <tr key={entry.id} className="align-top">
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-slate-950">{entry.task_title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {entry.client_name} → {entry.freelancer_name}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        Tx: {entry.kora_transaction_reference}
                        {entry.kora_split_reference ? ` · Split: ${entry.kora_split_reference}` : ""}
                      </p>
                    </td>
                    <td className="py-4 px-4 font-mono font-semibold text-slate-800">
                      {entry.currency}
                    </td>
                    <td className="py-4 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatMoney(entry.gross_amount, entry.currency)}
                    </td>
                    <td className="py-4 px-4 text-right font-mono tabular-nums text-blue-700">
                      <div>{formatMoney(entry.platform_fee, entry.currency)}</div>
                      {typeof entry.partial_split_pct === "number" && (
                        <div className="text-[11px] font-normal text-amber-700">
                          {100 - entry.partial_split_pct}% Partial Fee
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                      <div>{formatMoney(entry.freelancer_payout, entry.currency)}</div>
                      {typeof entry.partial_split_pct === "number" && (
                        <div className="text-[11px] font-normal text-amber-700">
                          {entry.partial_split_pct}% Partial Split
                        </div>
                      )}
                      {ngnConversion !== null && (
                        <div className="text-[11px] font-normal text-slate-500">
                          ≈ ₦{ngnConversion.toLocaleString()} NGN
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-xs">
                      {isProcessingT2 ? (
                        <div className="space-y-2 text-blue-900 max-w-xs">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>Released (T+2 Processing)</span>
                          </div>
                          <p className="text-slate-700 leading-relaxed">
                            Your payout is being processed. Expected settlement: 2 business days (T+2).
                          </p>
                          {entry.currency === "USD" && (
                            <p className="font-mono tabular-nums text-[11px] text-blue-800">
                              FX NGN Settlement: $1 = ₦{data.usdToNgnRate.toLocaleString()} (≈ ₦
                              {Math.round(entry.freelancer_payout * data.usdToNgnRate).toLocaleString()})
                            </p>
                          )}
                          {entry.expected_settlement_at && (
                            <p className="font-mono text-[11px] text-slate-500">
                              ETA: {new Date(entry.expected_settlement_at).toLocaleDateString()}
                            </p>
                          )}
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleSimulateTransferCompleted(
                                  entry.id,
                                  entry.kora_split_reference
                                )
                              }
                              disabled={settlingId === entry.id}
                              className="min-h-[44px] px-3 py-1.5 text-[11px] font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 whitespace-nowrap disabled:opacity-50"
                            >
                              {settlingId === entry.id
                                ? "Settling..."
                                : "Simulate transfer.completed"}
                            </button>
                          </div>
                        </div>
                      ) : isSettled ? (
                        <div className="space-y-1 text-emerald-800">
                          <div className="inline-flex items-center gap-1.5 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Settled via Kora Pay</span>
                          </div>
                          {entry.settled_at && (
                            <p className="font-mono text-[11px] text-slate-500">
                              {new Date(entry.settled_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ) : entry.status === "pending_funding" ? (
                        <div className="space-y-2 text-slate-700">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>Pending Kora Pay-In</span>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleConfirmChargeSuccess(
                                  entry.kora_transaction_reference,
                                  entry.id
                                )
                              }
                              disabled={confirmingRef === entry.kora_transaction_reference}
                              className="min-h-[44px] px-3 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 whitespace-nowrap disabled:opacity-50"
                            >
                              {confirmingRef === entry.kora_transaction_reference
                                ? "Verifying HMAC..."
                                : "Verify charge.success"}
                            </button>
                          </div>
                        </div>
                      ) : entry.status === "refunded" ? (
                        <div className="space-y-1 text-slate-700 max-w-xs">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-slate-600" />
                            <span>Refunded to Client</span>
                          </div>
                          {entry.kora_refund_reference && (
                            <p className="font-mono text-[11px] text-slate-500">
                              Refund Ref: {entry.kora_refund_reference}
                            </p>
                          )}
                        </div>
                      ) : entry.status === "failed" ? (
                        <div className="space-y-1 text-red-900 max-w-xs">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Transfer Failed (Admin Alerted)</span>
                          </div>
                          <p className="text-[11px] text-red-800 leading-relaxed">
                            {entry.failure_reason ||
                              entry.qa_report_summary ||
                              "Kora Pay transfer.failed webhook recorded."}
                          </p>
                        </div>
                      ) : entry.status === "disputed" ? (
                        <div className="space-y-1.5 text-red-900 max-w-xs">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Disputed (No Split Triggered)</span>
                          </div>
                          <p className="text-[11px] text-red-800 leading-relaxed">
                            {entry.qa_report_summary || "QA failed — awaiting Release Partial or Refund Client."}
                          </p>
                        </div>
                      ) : entry.status === "funded" && entry.qa_passed === false ? (
                        <div className="space-y-1.5 text-red-900 max-w-xs">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Funded Hold (QA Failed &gt;10%)</span>
                          </div>
                          <p className="text-[11px] text-red-800 leading-relaxed">
                            {entry.qa_report_summary ||
                              "Held in platform balance — awaiting Admin Dispute Review."}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 text-slate-700">
                          <div className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span className="capitalize">{entry.status} in Platform Balance</span>
                          </div>
                          {entry.status === "funded" && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleReleaseEscrow(entry.id, true)}
                                disabled={releasingId === entry.id}
                                className="min-h-[44px] px-3 py-1.5 text-[11px] font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 whitespace-nowrap disabled:opacity-50"
                              >
                                {releasingId === entry.id ? "Releasing..." : "QA Pass → 85/15 Split"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReleaseEscrow(entry.id, false)}
                                disabled={releasingId === entry.id}
                                className="min-h-[44px] px-3 py-1.5 text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700 rounded-md hover:bg-red-100 whitespace-nowrap disabled:opacity-50"
                              >
                                QA Fail → Dispute
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 pl-4 text-right">
                      {receipt ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadReceiptPdf(receipt.id, receipt.receipt_number)
                          }
                          disabled={downloadingId === receipt.id}
                          className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5 text-blue-700" />
                          <span>
                            {downloadingId === receipt.id ? "Generating..." : "Download PDF"}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">On QA Release</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Onboarded Freelancers & Generated Tax Receipts Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4">
          <h3 className="text-base font-bold text-slate-950">
            Workspace Kora Pay Recipients
          </h3>
          <div className="divide-y divide-slate-100 text-sm">
            {data.freelancers.map((member) => (
              <div key={member.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{member.full_name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {member.email} · {member.role}
                  </p>
                </div>
                <span
                  className={`font-mono text-xs whitespace-nowrap shrink-0 ${
                    member.kora_recipient_id ? "text-emerald-700 font-semibold" : "text-amber-700"
                  }`}
                >
                  {member.kora_recipient_id || "Pending Onboarding"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4">
          <h3 className="text-base font-bold text-slate-950">
            Generated Tax-Compliant Receipts (pdf-lib)
          </h3>
          <div className="divide-y divide-slate-100 text-sm">
            {data.taxReceipts.map((rcpt) => (
              <div key={rcpt.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-slate-950">
                    {rcpt.receipt_number} · {rcpt.freelancer_name}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-slate-600 mt-0.5">
                    Gross {formatMoney(rcpt.gross_amount, rcpt.currency)} · Fee{" "}
                    {formatMoney(rcpt.platform_fee, rcpt.currency)} · VAT{" "}
                    {formatMoney(rcpt.vat_on_fee, rcpt.currency)} · Net{" "}
                    {formatMoney(rcpt.net_payout, rcpt.currency)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownloadReceiptPdf(rcpt.id, rcpt.receipt_number)}
                  disabled={downloadingId === rcpt.id}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-blue-200 bg-blue-50/70 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Phase 18F: Webhook Idempotency Table (webhook_events · X-Event-ID) */}
      <section className="p-4 sm:p-6 bg-white border border-slate-200 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950">
                Kora Pay Webhook Idempotency Log (webhook_events · X-Event-ID)
              </h3>
              <p className="text-xs text-slate-600">
                Raw-body HMAC-SHA256 verified deliveries deduplicated by X-Event-ID across
                charge.success, transfer.completed, transfer.failed, and transfer.refunded.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
            {data.webhookEvents.length} Deduplicated Events
          </span>
        </div>

        {/* Mobile Stacked Cards (< md) */}
        <div className="md:hidden space-y-2.5 text-xs">
          {data.webhookEvents.map((evt) => (
            <div key={evt.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-blue-700">{evt.event_type}</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {evt.signature_valid ? "HMAC Verified" : "Rejected"}
                </span>
              </div>
              <p className="font-mono text-[11px] font-semibold text-slate-900 break-all">
                {evt.event_id}
              </p>
              <p className="text-slate-700">{evt.raw_summary}</p>
              <p className="font-mono text-[11px] text-slate-500">
                {new Date(evt.processed_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        {/* Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2.5 pr-4">X-Event-ID</th>
                <th className="py-2.5 px-4">Event Type</th>
                <th className="py-2.5 px-4">HMAC-SHA256</th>
                <th className="py-2.5 px-4">Summary &amp; Payload Digest</th>
                <th className="py-2.5 pl-4 text-right">Processed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.webhookEvents.map((evt) => (
                <tr key={evt.id} className="align-top">
                  <td className="py-3 pr-4 font-mono font-semibold text-slate-900">
                    {evt.event_id}
                  </td>
                  <td className="py-3 px-4 font-mono text-blue-700 font-semibold">
                    {evt.event_type}
                  </td>
                  <td className="py-3 px-4 font-mono text-emerald-700 font-semibold whitespace-nowrap">
                    {evt.signature_valid ? "Verified" : "Rejected"}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    <p>{evt.raw_summary}</p>
                    <p className="font-mono text-[11px] text-slate-400 mt-0.5">
                      sha256:{evt.payload_sha256.slice(0, 24)}...
                    </p>
                  </td>
                  <td className="py-3 pl-4 text-right font-mono text-slate-500 whitespace-nowrap">
                    {new Date(evt.processed_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
