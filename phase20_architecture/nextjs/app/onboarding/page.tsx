"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, FileAudio, Landmark, ShieldCheck } from "lucide-react";

type OnboardingPlanTier = "trial" | "pro" | "agency";

interface OnboardingStatusPayload {
  onboarding_completed: boolean;
  onboarding_step: number;
  kora_recipient_id: string | null;
  subscription_tier: OnboardingPlanTier | string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Connect Kora Pay
  const [bankCode, setBankCode] = useState("058");
  const [accountNumber, setAccountNumber] = useState("0123456789");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [koraRecipientId, setKoraRecipientId] = useState<string | null>(null);

  // Step 2: Choose Subscription Plan (Starts Free Trial)
  const [selectedPlan, setSelectedPlan] = useState<OnboardingPlanTier>("trial");

  // Step 3: Upload First File (Test the QA Agent)
  const [samplePreset, setSamplePreset] = useState<"pass" | "fail">("pass");
  const [qaPassed, setQaPassed] = useState<boolean | null>(null);
  const [qaSummary, setQaSummary] = useState<string | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch("/api/onboarding/status", { credentials: "include" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as OnboardingStatusPayload;
          if (data.onboarding_completed) {
            router.replace("/dashboard");
            return;
          }
          setKoraRecipientId(data.kora_recipient_id);
          if (data.onboarding_step === 2) setStep(2);
          else if (data.onboarding_step >= 3) setStep(3);
        }
      } finally {
        setLoading(false);
      }
    }
    void loadStatus();
  }, [router]);

  async function handleConnectKoraPay(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/kora-connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode, accountNumber, currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to connect Kora Pay payout account.");
      setKoraRecipientId(data.kora_recipient_id);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Kora Pay.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChoosePlan(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/choose-plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unable to activate subscription plan.");
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save subscription plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestFirstFile(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: samplePreset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "QA Agent pre-flight check failed.");
      setQaPassed(Boolean(data.qaPassed));
      setQaSummary(data.summary || "First WAV evaluated and onboarding_completed = true.");
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete QA test.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F8FAFF] flex items-center justify-center p-6 text-sm text-slate-600">
        Checking workspace onboarding progress...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFF] py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-blue-700 font-semibold">
            Dutchkem Apex Copilot · Workspace Setup
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
            Activate Your Automated Data Operations
          </h1>
          <p className="text-sm text-slate-600">
            Complete these three steps to unlock Kora Pay escrow payouts and live QA evaluation.
          </p>
        </header>

        {/* 3-Step Progress Header */}
        <ol className="grid grid-cols-3 gap-3 text-xs">
          {[
            { num: 1 as const, label: "1. Connect Kora Pay" },
            { num: 2 as const, label: "2. Subscription Plan" },
            { num: 3 as const, label: "3. First QA Upload" },
          ].map((item) => {
            const done = step > item.num;
            const current = step === item.num;
            return (
              <li
                key={item.num}
                className={`p-3 rounded-xl border font-semibold flex items-center gap-2 ${
                  current
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : done
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {done ? <Check className="w-4 h-4 shrink-0" /> : null}
                <span>{item.label}</span>
              </li>
            );
          })}
        </ol>

        {error && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs font-medium">
            {error}
          </div>
        )}

        {step === 1 && (
          <form
            onSubmit={handleConnectKoraPay}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 text-slate-950 font-semibold">
              <Landmark className="w-5 h-5 text-blue-600" />
              <h2>Step 1 · Connect Kora Pay Payout Account</h2>
            </div>
            <p className="text-xs text-slate-600">
              Bind your domestic NGN bank account or global USD settlement rail so automated QA approvals trigger 85/15 escrow payouts immediately.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="NGN">NGN (Local Nigeria)</option>
                  <option value="USD">USD (Global Rail)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Code</label>
                <input
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl"
                />
              </div>
            </div>
            {koraRecipientId && (
              <p className="text-xs font-mono text-emerald-700">Connected: {koraRecipientId}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-slate-950 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Connecting Kora Pay..." : "Save Payout Rail & Continue"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form
            onSubmit={handleChoosePlan}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 text-slate-950 font-semibold">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2>Step 2 · Choose Subscription Plan</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: "trial", title: "Starter Free Trial", price: "$0 / 14d", desc: "3 tasks + Full QA Suite" },
                  { id: "pro", title: "Pro Copilot", price: "$49 / mo", desc: "50 QA runs/hr + Auto-Bidder" },
                  { id: "agency", title: "Agency White-Label", price: "$199 / mo", desc: "Unlimited tasks + 250/hr QA" },
                ] as const
              ).map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`p-4 rounded-xl border text-left space-y-1 transition-colors ${
                    selectedPlan === plan.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-bold text-slate-950">{plan.title}</p>
                  <p className="text-xs font-mono font-semibold text-blue-700">{plan.price}</p>
                  <p className="text-xs text-slate-600">{plan.desc}</p>
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting
                ? "Activating Plan..."
                : selectedPlan === "trial"
                  ? "Start 14-Day Free Trial & Continue"
                  : `Select ${selectedPlan.toUpperCase()} & Continue`}
            </button>
          </form>
        )}

        {step === 3 && (
          <form
            onSubmit={handleTestFirstFile}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 text-slate-950 font-semibold">
              <FileAudio className="w-5 h-5 text-emerald-600" />
              <h2>Step 3 · Upload First File (Test the QA Agent)</h2>
            </div>
            <p className="text-xs text-slate-600">
              Run your first pre-moderated 24kHz Mono WAV inspection against the automated librosa DSP engine to finish onboarding.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSamplePreset("pass")}
                className={`flex-1 p-3 rounded-xl border text-xs font-semibold ${
                  samplePreset === "pass"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 text-slate-700"
                }`}
              >
                Sample 24kHz Mono Clean WAV
              </button>
            </div>
            {qaSummary && (
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {qaPassed ? "QA Passed" : "Evaluated"}: {qaSummary}
                </span>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Running QA Agent..." : "Test QA Agent & Enter Dashboard"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
