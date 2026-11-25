"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, CreditCard, ShieldCheck } from "lucide-react";

type PlanId = "trial" | "pro" | "agency";

interface PlanSpec {
  id: PlanId;
  name: string;
  audience: string;
  priceMonthly: number;
  cadenceNote: string;
  taskLimitLabel: string;
  popular?: boolean;
  features: string[];
  ctaLabel: string;
}

const PLANS: PlanSpec[] = [
  {
    id: "trial",
    name: "Starter (Free Trial)",
    audience: "For solo annotators evaluating QA automation",
    priceMonthly: 0,
    cadenceNote: "14-day free trial · No card required",
    taskLimitLabel: "3 tasks / month",
    features: [
      "3 monthly Audio, Vision, or Text QA tasks",
      "PostgreSQL RLS tenant workspace",
      "Real-time Telemetry & Mock Interview Coach",
      "Automatic trial expiration redirect after 14 days",
    ],
    ctaLabel: "Current 14-Day Trial",
  },
  {
    id: "pro",
    name: "Pro",
    audience: "For high-output AI data freelancers",
    priceMonthly: 49,
    cadenceNote: "Billed monthly via Kora Pay",
    taskLimitLabel: "50 tasks / month",
    popular: true,
    features: [
      "50 tasks / month across all QA engines",
      "Auto-Bidder AI Sales Agent (Upwork, Mercor, TELUS)",
      "Audio QA Engine (librosa 24kHz SNR + Whisper WER)",
      "YOLOv8 IoU Vision Gate & LLM Rubric Grader",
    ],
    ctaLabel: "Upgrade to Pro",
  },
  {
    id: "agency",
    name: "Agency",
    audience: "For scaling white-label data operations",
    priceMonthly: 199,
    cadenceNote: "Billed monthly via Kora Pay",
    taskLimitLabel: "Unlimited tasks",
    features: [
      "Unlimited tasks across all projects & annotators",
      "Custom White-Label agency branding & client portal",
      "80% / 20% Escrow Ledger & Expert Marketplace",
      "10,000-sample Synthetic Factory & Red-Teaming",
    ],
    ctaLabel: "Upgrade to Agency",
  },
];

export default function PricingPage() {
  const [upgradingTier, setUpgradingTier] = useState<"pro" | "agency" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleKoraUpgrade(tier: "pro" | "agency") {
    setUpgradingTier(tier);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/billing/korapay/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to initialize Kora Pay checkout.");
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setStatusMessage(
        `Kora Pay checkout session ${data.reference} initialized (${process.env.NEXT_PUBLIC_KORA_PUBLIC_KEY ? "live public key active" : "checkout ready"}).`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Payment initialization failed.");
    } finally {
      setUpgradingTier(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A] py-16 px-6">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-mono text-amber-700">
              Dutchkem Ventures · Kora Pay Subscriptions
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 text-balance">
              Scale from solo 14-day trial to unlimited white-label agency throughput.
            </h1>
            <p className="text-sm text-slate-600">
              Every paid subscription activates immediately upon Kora Pay webhook verification.
            </p>
          </div>
          <Link
            href="/"
            className="text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
          >
            Return to Homepage
          </Link>
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {PLANS.map((plan, idx) => (
            <motion.section
              key={plan.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.06 }}
              className={`rounded-xl bg-white p-7 flex flex-col justify-between transition-shadow ${
                plan.popular
                  ? "border-2 border-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.22)]"
                  : "border border-slate-200"
              }`}
            >
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
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
                    ${plan.priceMonthly}
                    <span className="text-sm font-normal text-slate-500">/mo</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {plan.taskLimitLabel} · {plan.cadenceNote}
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
                  <Link
                    href="/login"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                  >
                    <span>{plan.ctaLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={upgradingTier !== null}
                    onClick={() => handleKoraUpgrade(plan.id as "pro" | "agency")}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold transition-all whitespace-nowrap ${
                      plan.popular
                        ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 shadow-[0_8px_24px_rgba(245,158,11,0.28)] hover:brightness-105"
                        : "bg-[#0F172A] text-white hover:bg-slate-800"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>
                      {upgradingTier === plan.id
                        ? "Connecting Kora Pay..."
                        : `${plan.ctaLabel} via Kora Pay`}
                    </span>
                  </button>
                )}
              </div>
            </motion.section>
          ))}
        </div>

        <footer className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Secured by Kora Pay Checkout & signed webhook tier synchronization.</span>
        </footer>
      </div>
    </main>
  );
}
