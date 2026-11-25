import React, { useEffect, useState } from "react";
import {
  Check,
  CreditCard,
  FileAudio,
  Landmark,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import type { SubscriptionTier } from "../types/tenant";

interface OnboardingWizardViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  userEmail: string;
  initialKoraRecipientId: string | null;
  initialTier: SubscriptionTier;
  initialStep?: number;
  onCompleted: () => Promise<void>;
}

export function OnboardingWizardView({
  orgId,
  orgName,
  userId,
  userName,
  userEmail,
  initialKoraRecipientId,
  initialTier,
  initialStep = 1,
  onCompleted,
}: OnboardingWizardViewProps) {
  const [step, setStep] = useState<1 | 2 | 3>(() =>
    initialStep >= 3 ? 3 : initialStep === 2 ? 2 : 1
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Connect Kora Pay
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [bankCode, setBankCode] = useState("058");
  const [accountNumber, setAccountNumber] = useState("0123456789");
  const [koraRecipientId, setKoraRecipientId] = useState<string | null>(initialKoraRecipientId);

  // Step 2: Choose Subscription Plan (Starts Free Trial)
  const [selectedPlan, setSelectedPlan] = useState<"trial" | "pro" | "agency">(
    initialTier === "pro" || initialTier === "agency" ? initialTier : "trial"
  );

  // Step 3: Upload First File (Test the QA Agent)
  const [wavFileName, setWavFileName] = useState("sample_24khz_mono_onboarding.wav");
  const [wavBase64, setWavBase64] = useState<string | null>(null);
  const [qaSummary, setQaSummary] = useState<string | null>(null);

  useEffect(() => {
    setKoraRecipientId(initialKoraRecipientId);
  }, [initialKoraRecipientId]);

  function handleLocalFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const b64 = res.includes(",") ? res.split(",")[1] : res;
      setWavFileName(file.name);
      setWavBase64(b64 || null);
    };
    reader.readAsDataURL(file);
  }

  async function handleConnectKoraPay(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/onboarding/kora-connect", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          currency,
          bankCode: bankCode.trim(),
          accountNumber: accountNumber.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to connect Kora Pay payout account.");
      }
      setKoraRecipientId(data.kora_recipient_id);
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to connect Kora Pay.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChoosePlan(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/onboarding/choose-plan", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({ tier: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to activate subscription plan.");
      }
      setStep(3);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to choose plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteFirstFileQa(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          preset: "pass",
          fileName: wavFileName,
          wavBase64: wavBase64 || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "First QA Agent verification failed.");
      }
      setQaSummary(data.summary || "QA inspection passed. Workspace unlocked.");
      await onCompleted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to complete QA test.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-[#0F172A] py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider font-semibold text-blue-700">
            Phase 20D · Workspace Onboarding Gate (/onboarding)
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            Welcome to {orgName}, {userName}
          </h1>
          <p className="text-sm text-slate-600">
            Complete all 3 onboarding steps below to unlock your dashboard (<span className="font-mono text-slate-800">{userEmail}</span>).
          </p>
        </header>

        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { num: 1 as const, label: "Step 1: Connect Kora Pay" },
            { num: 2 as const, label: "Step 2: Choose Plan" },
            { num: 3 as const, label: "Step 3: First File QA" },
          ].map((item) => {
            const done = step > item.num;
            const current = step === item.num;
            return (
              <li
                key={item.num}
                className={`p-3.5 rounded-xl border font-semibold flex items-center gap-2 ${
                  current
                    ? "border-blue-600 bg-blue-50 text-blue-950"
                    : done
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                      : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {done && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                <span>{item.label}</span>
              </li>
            );
          })}
        </ol>

        {errorMsg && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {step === 1 && (
          <form
            onSubmit={handleConnectKoraPay}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 text-slate-950 font-bold">
              <Landmark className="w-5 h-5 text-blue-600" />
              <h2>Step 1 · Connect Kora Pay (for Payouts)</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bind your domestic NGN bank or USD global settlement account. Recipient IDs are sealed via AES-256-GCM (<span className="font-mono">KEK_USER</span>) before saving.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="onb-currency" className="block text-xs font-semibold text-slate-700 mb-1">
                  Settlement Rail
                </label>
                <select
                  id="onb-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="NGN">NGN (Local Bank)</option>
                  <option value="USD">USD (Global Rail)</option>
                </select>
              </div>
              <div>
                <label htmlFor="onb-bank" className="block text-xs font-semibold text-slate-700 mb-1">
                  Bank / Routing Code
                </label>
                <input
                  id="onb-bank"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label htmlFor="onb-acct" className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Number
                </label>
                <input
                  id="onb-acct"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            {koraRecipientId && (
              <p className="text-xs font-mono text-emerald-700">
                Verified Kora Recipient: {koraRecipientId}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-slate-950 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Linking Kora Pay..." : "Connect Kora Pay & Continue"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form
            onSubmit={handleChoosePlan}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 text-slate-950 font-bold">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2>Step 2 · Choose Subscription Plan (Starts Free Trial)</h2>
            </div>
            <p className="text-xs text-slate-600">
              Start immediately with a 14-day Free Trial or pre-select your growth tier with Upstash rate allowances.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: "trial", title: "Starter Free Trial", price: "$0 / 14 days", meta: "3 tasks · 10 QA runs/hr" },
                  { id: "pro", title: "Pro Copilot", price: "$49 / mo", meta: "50 tasks · 50 QA runs/hr" },
                  { id: "agency", title: "Agency Plan", price: "$199 / mo", meta: "Unlimited · 250 QA runs/hr" },
                ] as const
              ).map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedPlan(tier.id)}
                  className={`p-4 rounded-xl border text-left space-y-1 transition-colors ${
                    selectedPlan === tier.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-bold text-slate-950">{tier.title}</p>
                  <p className="text-xs font-mono font-semibold text-blue-700">{tier.price}</p>
                  <p className="text-xs text-slate-600">{tier.meta}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting
                  ? "Configuring Plan..."
                  : selectedPlan === "trial"
                    ? "Start 14-Day Free Trial & Continue"
                    : `Select ${selectedPlan.toUpperCase()} Plan & Continue`}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form
            onSubmit={handleCompleteFirstFileQa}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 text-slate-950 font-bold">
              <FileAudio className="w-5 h-5 text-emerald-600" />
              <h2>Step 3 · Upload First File (Test the QA Agent)</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Upload your own <span className="font-mono">.wav</span> asset or run the pre-loaded 24kHz Mono WAV reference sample through Content Moderation + Audio QA to unlock your dashboard.
            </p>

            <label className="flex items-center justify-center gap-2 px-4 py-4 border border-dashed border-slate-300 rounded-xl text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>{wavBase64 ? `Loaded: ${wavFileName}` : "Upload custom .wav file (or use clean 24kHz Mono sample)"}</span>
              <input
                type="file"
                accept=".wav,audio/wav"
                onChange={handleLocalFileSelect}
                className="hidden"
              />
            </label>

            {qaSummary && (
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{qaSummary}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{submitting ? "Verifying First QA File..." : "Run QA Test & Unlock Dashboard"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default OnboardingWizardView;
