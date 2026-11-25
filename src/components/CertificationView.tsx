import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Bell,
  CheckCircle2,
  Compass,
  CreditCard,
  Download,
  FileJson,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  CertificationAttempt,
  CertificationCurrency,
  CertificationExamQuestionPublic,
  FreelancerCertification,
  PriorityJobNotification,
} from "../types/tenant";

interface CertificationViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  userEmail: string;
  standalone?: boolean;
  isAuthenticated?: boolean;
  onReturnHomepage?: () => void;
  onOpenJobBoard?: () => void;
  onOpenLogin?: () => void;
  onCertified?: (cert: FreelancerCertification) => void;
}

interface ExamFeedbackItem {
  questionId: string;
  correct: boolean;
  explanation: string;
}

interface CertificationStatusResponse {
  feeUsd: number;
  passingScoreExclusive: number;
  currencyAmounts: Record<CertificationCurrency, number>;
  certification: FreelancerCertification | null;
  questions: CertificationExamQuestionPublic[];
  attempts: CertificationAttempt[];
  priorityNotifications: PriorityJobNotification[];
  koraPublicKey: string;
}

export function CertificationView({
  orgId,
  orgName,
  userId,
  userName,
  userEmail,
  standalone = false,
  isAuthenticated = true,
  onReturnHomepage,
  onOpenJobBoard,
  onOpenLogin,
  onCertified,
}: CertificationViewProps) {
  const [statusData, setStatusData] = useState<CertificationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<CertificationCurrency>("NGN");
  const [specialty, setSpecialty] = useState("Audio DSP QA, Vision IoU & Localization");
  const [locale, setLocale] = useState("en-NG / Yoruba / Global");

  const [pendingAttempt, setPendingAttempt] = useState<CertificationAttempt | null>(null);
  const [paidAttempt, setPaidAttempt] = useState<CertificationAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [examResult, setExamResult] = useState<{
    passed: boolean;
    score: number;
    correctCount: number;
    totalQuestions: number;
    feedback: ExamFeedbackItem[];
  } | null>(null);
  const [showCredentialJson, setShowCredentialJson] = useState(false);

  const [busyAction, setBusyAction] = useState<
    "checkout" | "verify" | "submit" | "notify" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const authHeaders = useCallback(
    (): Record<string, string> => ({
      "Content-Type": "application/json",
      ...(orgId ? { "x-org-id": orgId } : {}),
      ...(userId ? { "x-user-id": userId } : {}),
    }),
    [orgId, userId]
  );

  const loadStatus = useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/certification/status?userId=${encodeURIComponent(userId)}&orgId=${encodeURIComponent(orgId)}`,
        {
          credentials: "include",
          headers: {
            "x-org-id": orgId,
            "x-user-id": userId,
          },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Unable to load QA certification status.");
      }
      const data = (await res.json()) as CertificationStatusResponse;
      setStatusData(data);

      const latestPaid = (data.attempts || []).find(
        (a) => a.payment_status === "paid" && a.passed !== true
      );
      const latestPending = (data.attempts || []).find((a) => a.payment_status === "pending");
      if (latestPaid) {
        setPaidAttempt(latestPaid);
        setPendingAttempt(null);
      } else if (latestPending) {
        setPendingAttempt(latestPending);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load QA certification workspace."
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleVerifyCheckout(reference: string, gatewayStatus = "success") {
    setErrorMsg(null);
    setBusyAction("verify");
    try {
      const res = await fetch("/api/certification/checkout/verify", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ reference, gatewayStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to verify $99 Kora Pay exam payment.");
      }
      if (!data.verified) {
        throw new Error("Payment is still pending confirmation at Kora Pay.");
      }
      setPendingAttempt(null);
      setPaidAttempt(data.attempt);
      setExamResult(null);
      setNotice(
        `Verified $99 Kora Pay fee (${reference}). Your 10-question QA certification exam is unlocked.`
      );
      await loadStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Payment verification failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleInitializeCheckout() {
    if (!isAuthenticated || !userId || !orgId) {
      onOpenLogin?.();
      return;
    }
    setErrorMsg(null);
    setNotice(null);
    setBusyAction("checkout");
    try {
      const res = await fetch("/api/certification/checkout/initialize", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({
          currency,
          userId,
          orgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to initialize $99 Kora Pay checkout.");
      }

      setPendingAttempt(data.attempt);

      const korapayGlobal = (
        window as unknown as {
          Korapay?: { initialize: (opts: Record<string, unknown>) => void };
        }
      ).Korapay;

      if (korapayGlobal && (data.publicKey || statusData?.koraPublicKey)) {
        korapayGlobal.initialize({
          key: data.publicKey || statusData?.koraPublicKey,
          reference: data.reference,
          amount: data.chargeAmount,
          currency: data.currency,
          narration: "Dutchkem Verified QA Freelancer Certification ($99)",
          customer: { name: userName, email: userEmail },
          onSuccess: () => {
            void handleVerifyCheckout(data.reference, "success");
          },
        });
      }

      setNotice(
        `Initialized $99 Kora Pay exam fee (${data.currency} ${Number(data.chargeAmount).toLocaleString()}). Confirm payment below to unlock the exam.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Checkout initialization failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitExam(e: React.FormEvent) {
    e.preventDefault();
    if (!paidAttempt) {
      setErrorMsg("Pay the $99 Kora Pay exam fee before submitting certification answers.");
      return;
    }
    const questions = statusData?.questions || [];
    if (questions.length > 0 && Object.keys(answers).length < questions.length) {
      setErrorMsg(
        `Please answer all ${questions.length} QA questions (${Object.keys(answers).length}/${questions.length} selected).`
      );
      return;
    }

    setErrorMsg(null);
    setNotice(null);
    setBusyAction("submit");
    try {
      const res = await fetch("/api/certification/exam/submit", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({
          attemptId: paidAttempt.id,
          userId,
          orgId,
          specialty,
          locale,
          answers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Certification exam grading failed.");
      }

      setExamResult({
        passed: Boolean(data.passed),
        score: Number(data.score),
        correctCount: Number(data.correctCount),
        totalQuestions: Number(data.totalQuestions),
        feedback: data.feedback || [],
      });

      if (data.passed && data.certification) {
        setPaidAttempt(null);
        setNotice(
          `Passed with ${data.score}% (> 90% required). "${data.certification.tier.toUpperCase()}" badge & signed credential issued and synced to the Job Board.`
        );
        onCertified?.(data.certification);
      } else {
        setErrorMsg(
          `Score ${data.score}% did not exceed the mandatory > 90% threshold. Review explanations below and retry without paying again.`
        );
      }
      await loadStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to grade exam.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    setBusyAction("notify");
    try {
      await fetch(`/api/certification/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ userId, orgId }),
      });
      await loadStatus();
    } catch {
      // Ignore silent read update failure
    } finally {
      setBusyAction(null);
    }
  }

  function downloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const cert = statusData?.certification || null;
  const questions = statusData?.questions || [];
  const notifications = statusData?.priorityNotifications || [];
  const currencyMap = statusData?.currencyAmounts ?? {
    USD: 99,
    NGN: 151470,
    GBP: 78.21,
  };
  const formattedLocalFee =
    currency === "NGN"
      ? `₦${currencyMap.NGN.toLocaleString()}`
      : currency === "GBP"
        ? `£${currencyMap.GBP.toFixed(2)}`
        : `$${currencyMap.USD}`;

  const canTakeExam = Boolean(paidAttempt && paidAttempt.payment_status === "paid");

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

            <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
              {onReturnHomepage && (
                <button
                  type="button"
                  onClick={onReturnHomepage}
                  className="inline-flex items-center gap-1.5 hover:text-blue-700 whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Homepage</span>
                </button>
              )}
              {onOpenJobBoard && (
                <button
                  type="button"
                  onClick={onOpenJobBoard}
                  className="font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
                >
                  Open Job Board
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <div className={standalone ? "mx-auto max-w-6xl px-6 py-10 space-y-8" : "space-y-8"}>
        {/* Top Overview Card */}
        <section className="rounded-2xl border border-blue-200/80 bg-white p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-700">
              Phase 21E · Freelancer QA Certification &amp; Priority Marketplace Ranking
            </p>
            <h1 className="mt-1.5 text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
              Verified AI Data QA Specialist Certification
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Pay the <span className="font-mono tabular-nums font-semibold text-slate-950">$99</span> assessment fee via Kora Pay and score strictly{" "}
              <span className="font-mono tabular-nums font-semibold text-emerald-700">&gt; 90%</span>{" "}
              on our 10-question DSP Audio, YOLOv8 Vision, Localization &amp; PromptGuard exam to unlock your cryptographically signed badge, rank first in Job Board search, and receive{" "}
              <span className="font-mono tabular-nums font-semibold text-slate-950">30–45 min</span> early priority job alerts.
            </p>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {onOpenJobBoard && (
              <button
                type="button"
                onClick={onOpenJobBoard}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-400 hover:text-blue-700 whitespace-nowrap"
              >
                <BadgeCheck className="w-4 h-4 text-emerald-600" />
                <span>View Job Board Ranking</span>
              </button>
            )}
          </div>
        </section>

        {errorMsg && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm font-medium flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
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
            <div className="flex items-center gap-2.5">
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

        {/* 4-Metric KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Certification Status</p>
            <p className="mt-2 text-lg font-bold text-slate-950 flex items-center gap-2">
              {cert ? (
                <>
                  <BadgeCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 capitalize">
                    Verified · {cert.tier}
                  </span>
                </>
              ) : (
                <span className="text-slate-700">Uncertified</span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {cert ? "Priority Job Board placement active" : "Score > 90% required to verify"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Exam Fee (Kora Pay)</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
              $99
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {formattedLocalFee} ({currency})
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Passing Threshold</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-700">
              &gt; 90%
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              91–95% Verified · &ge; 96% Expert
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Priority Job Alerts</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
              {notifications.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {cert ? "Early cohort dispatch enabled" : "Unlocked immediately on pass"}
            </p>
          </div>
        </section>

        {/* Active Credential & Badge Viewer */}
        {cert && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <Award className="w-4 h-4" />
                  <span>
                    Digital Credential Issued · Tier: {cert.tier.toUpperCase()} ({cert.score}%)
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-950">
                  {cert.full_name} — {cert.specialty}
                </h2>
                <p className="text-xs font-mono tabular-nums text-slate-600">
                  Credential ID: {cert.id} · Org: {orgName} · SHA-256 HMAC:{" "}
                  {cert.credential_sha256.slice(0, 18)}...
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  You are marked as <strong className="text-emerald-700">Verified</strong> across
                  the Two-Sided Job Board, sorted first in client bid queues and verified directory searches, and subscribed to early-access client cohort alerts.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(`${cert.id}-badge.svg`, cert.badge_svg, "image/svg+xml")
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Badge SVG</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(
                        `${cert.id}-credential.json`,
                        JSON.stringify(cert.credential_json, null, 2),
                        "application/json"
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <FileJson className="w-3.5 h-3.5 text-blue-600" />
                    <span>Download Credential JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCredentialJson((prev) => !prev)}
                    className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                  >
                    {showCredentialJson ? "Hide Verifiable JSON" : "Inspect Signed JSON"}
                  </button>
                </div>
              </div>

              <div className="shrink-0">
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(cert.badge_svg)}`}
                  alt={`${cert.tier} QA Certification Badge for ${cert.full_name}`}
                  className="w-full max-w-[440px] rounded-xl border border-slate-200 shadow-xs"
                />
              </div>
            </div>

            {showCredentialJson && (
              <pre className="p-4 rounded-xl bg-slate-950 text-emerald-300 text-xs font-mono overflow-x-auto leading-relaxed">
                {JSON.stringify(cert.credential_json, null, 2)}
              </pre>
            )}
          </section>
        )}

        {/* Step 1: Kora Pay $99 Checkout Gate (shown when unpaid or before taking another exam) */}
        {!canTakeExam && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Step 1 · Pay $99 Certification Fee via Kora Pay
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Fail-closed enforcement: grading and digital credential issuance remain locked until Kora Pay settles the $99 exam attempt fee.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Lock className="w-4 h-4 text-blue-600" />
                <span className="font-mono tabular-nums text-xs font-semibold text-slate-900">
                  $99 USD / {formattedLocalFee}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="cert-currency-select"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Kora Pay Settlement Currency
                </label>
                <select
                  id="cert-currency-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CertificationCurrency)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-950"
                >
                  <option value="NGN">NGN (₦{currencyMap.NGN.toLocaleString()})</option>
                  <option value="USD">USD ($99.00)</option>
                  <option value="GBP">GBP (£{currencyMap.GBP.toFixed(2)})</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="cert-specialty-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Primary QA Specialty
                </label>
                <input
                  id="cert-specialty-input"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>

              <div>
                <label
                  htmlFor="cert-locale-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Target Languages / Locales
                </label>
                <input
                  id="cert-locale-input"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950"
                />
              </div>
            </div>

            {pendingAttempt && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-amber-950">
                    Kora Pay Checkout Pending · Reference:{" "}
                    <span className="font-mono">{pendingAttempt.payment_reference}</span>
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5 font-mono tabular-nums">
                    Amount: {pendingAttempt.payment_currency}{" "}
                    {pendingAttempt.charge_amount.toLocaleString()} ($99 USD)
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyAction === "verify"}
                  onClick={() => void handleVerifyCheckout(pendingAttempt.payment_reference, "success")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {busyAction === "verify"
                      ? "Verifying..."
                      : "Confirm $99 Kora Pay Settlement & Unlock Exam"}
                  </span>
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busyAction === "checkout"}
                onClick={() => void handleInitializeCheckout()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white hover:brightness-105 disabled:opacity-50 whitespace-nowrap"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {busyAction === "checkout"
                    ? "Initializing Kora Pay..."
                    : cert
                      ? `Take Upgrade Exam ($99 / ${formattedLocalFee})`
                      : `Pay $99 via Kora Pay (${formattedLocalFee})`}
                </span>
              </button>
            </div>
          </section>
        )}

        {/* Step 2: 10-Question QA Certification Exam */}
        {canTakeExam && paidAttempt && (
          <section className="rounded-2xl border border-blue-200 bg-white p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  Kora Pay Verified ({paidAttempt.payment_reference}) · Attempt {paidAttempt.id}
                </p>
                <h2 className="text-lg font-bold text-slate-950 mt-0.5">
                  Step 2 · Apex QA Certification Exam ({questions.length} Questions · Pass &gt; 90%)
                </h2>
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold text-slate-600">
                Answered: {Object.keys(answers).length} / {questions.length}
              </span>
            </div>

            <form onSubmit={(e) => void handleSubmitExam(e)} className="space-y-6">
              {questions.map((q, idx) => (
                <fieldset
                  key={q.id}
                  className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono tabular-nums text-xs font-bold text-blue-700">
                      Q{String(idx + 1).padStart(2, "0")} · {q.category}
                    </span>
                  </div>
                  <legend className="text-sm font-semibold text-slate-950 leading-snug">
                    {q.prompt}
                  </legend>
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {q.options.map((optionText, optIndex) => {
                      const selected = answers[q.id] === optIndex;
                      return (
                        <label
                          key={optIndex}
                          className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                            selected
                              ? "border-blue-600 bg-blue-50 text-slate-950 font-semibold"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={optIndex}
                            checked={selected}
                            onChange={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: optIndex,
                              }))
                            }
                            className="mt-0.5 shrink-0"
                          />
                          <span>{optionText}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-600">
                  Minimum score strictly &gt; <span className="font-mono font-semibold">90.0%</span>{" "}
                  (all 10/10 = Expert, 9/10 = rejected fail closed because 90% is not &gt; 90%!).
                </p>
                <button
                  type="submit"
                  disabled={busyAction === "submit"}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    {busyAction === "submit" ? "Grading Exam..." : "Submit QA Certification Exam"}
                  </span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Exam Grading Breakdown */}
        {examResult && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  Latest Exam Grading Report
                </h3>
                <p className="text-xs text-slate-600">
                  Correct: {examResult.correctCount} / {examResult.totalQuestions}
                </p>
              </div>
              <span
                className={`font-mono tabular-nums text-lg font-bold ${
                  examResult.passed ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {examResult.score}% · {examResult.passed ? "PASSED" : "FAIL CLOSED (<= 90%)"}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {examResult.feedback.map((item, idx) => (
                <div key={item.questionId} className="py-2.5 flex items-start gap-3 text-xs">
                  {item.correct ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-mono font-semibold text-slate-900">
                      Q{String(idx + 1).padStart(2, "0")}:
                    </span>{" "}
                    <span className="text-slate-700">{item.explanation}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Priority Job Notifications Feed */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-950">
                Priority Early-Access Job Notifications
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void loadStatus()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Alerts</span>
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/70 text-center space-y-1.5">
              <Sparkles className="w-5 h-5 text-blue-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">
                No priority alerts dispatched yet
              </p>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Certified Verified &amp; Expert freelancers automatically receive priority notifications as soon as AI Labs publish $500 verified cohorts on the Job Board.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-emerald-700 capitalize">
                        {notif.tier} Priority ({notif.priority_window_minutes}m early access)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-blue-700">{notif.client_org_name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-bold text-slate-950">
                        ${notif.budget_usd.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-950">{notif.job_title}</p>
                    <p className="text-slate-500 font-mono tabular-nums">
                      Dispatched: {notif.created_at.replace("T", " ").slice(0, 19)} UTC
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {!notif.read_at ? (
                      <button
                        type="button"
                        disabled={busyAction === "notify"}
                        onClick={() => void handleMarkNotificationRead(notif.id)}
                        className="px-3 py-1.5 font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Mark Read
                      </button>
                    ) : (
                      <span className="text-slate-400 font-medium">Read</span>
                    )}
                    {onOpenJobBoard && (
                      <button
                        type="button"
                        onClick={onOpenJobBoard}
                        className="px-3.5 py-1.5 font-semibold rounded-lg bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap"
                      >
                        Bid First
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
