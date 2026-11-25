import React, { useEffect } from "react";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { GlobalFooter, type LegalDocSlug } from "./GlobalFooter";

interface LegalComplianceViewProps {
  activeDoc: LegalDocSlug;
  isAuthenticated?: boolean;
  onSelectDoc: (slug: LegalDocSlug) => void;
  onOpenPricing: () => void;
  onReturnHomepage: () => void;
  onGoToDashboard: () => void;
  onSignIn?: () => void;
}

const LEGAL_METADATA: Record<
  LegalDocSlug,
  { title: string; metaDescription: string; subtitle: string; effectiveDate: string }
> = {
  terms: {
    title: "Terms of Service | Dutchkem Ventures Apex Data Copilot",
    metaDescription:
      "Terms of Service covering independent contractor status, 80/20 escrow payment settlement via Kora Pay (home NGN & global USD/GBP), and multi-tenant usage boundaries.",
    subtitle:
      "Independent contractor classification, automated 80/20 Kora Pay escrow payout rules, and tenant security governance.",
    effectiveDate: "Effective November 15, 2026",
  },
  privacy: {
    title: "Privacy Policy (NDPA & GDPR Compliant) | Dutchkem Ventures",
    metaDescription:
      "NDPA 2023 & GDPR compliant Privacy Policy detailing Neon PostgreSQL RLS isolation, encrypted WAV audio storage, and data subject rights.",
    subtitle:
      "Nigeria Data Protection Act (NDPA 2023) & GDPR framework governing account credentials, studio WAV recordings, and annotation files in Neon PostgreSQL.",
    effectiveDate: "Updated November 15, 2026",
  },
  refund: {
    title: "Refund Policy (7-Day Pro Guarantee) | Dutchkem Ventures",
    metaDescription:
      "7-day money-back guarantee for first-time Pro ($49/mo) subscribers, 14-day free trial terms, and escrow milestone finality.",
    subtitle:
      "7-day money-back guarantee for first-time Pro subscribers, trial billing protection, and Kora Pay local & international settlement timelines.",
    effectiveDate: "Effective November 15, 2026",
  },
};

export function LegalComplianceView({
  activeDoc,
  isAuthenticated = false,
  onSelectDoc,
  onOpenPricing,
  onReturnHomepage,
  onGoToDashboard,
  onSignIn,
}: LegalComplianceViewProps) {
  const meta = LEGAL_METADATA[activeDoc];

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = meta.title;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute("content", meta.metaDescription);
  }, [meta]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-6">
          <button
            type="button"
            onClick={onReturnHomepage}
            className="text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Dutchkem Ventures
          </button>

          <nav
            aria-label="Legal navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => onSelectDoc("terms")}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                activeDoc === "terms" ? "text-slate-900 font-semibold" : "hover:text-slate-900"
              }`}
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => onSelectDoc("privacy")}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                activeDoc === "privacy" ? "text-slate-900 font-semibold" : "hover:text-slate-900"
              }`}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onSelectDoc("refund")}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                activeDoc === "refund" ? "text-slate-900 font-semibold" : "hover:text-slate-900"
              }`}
            >
              Refund Policy
            </button>
            <button
              type="button"
              onClick={onOpenPricing}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </button>
          </nav>

          <button
            type="button"
            onClick={onOpenPricing}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 whitespace-nowrap shrink-0"
          >
            Start Your Free Trial
          </button>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-4xl w-full px-6 py-14 space-y-8">
        <div className="space-y-4 border-b border-slate-200 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Homepage</span>
            </button>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => onSelectDoc("terms")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  activeDoc === "terms"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => onSelectDoc("privacy")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  activeDoc === "privacy"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Privacy (NDPA)
              </button>
              <button
                type="button"
                onClick={() => onSelectDoc("refund")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  activeDoc === "refund"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Refunds
              </button>
            </div>
          </div>

          <p className="text-xs font-mono text-amber-700">
            Dutchkem Ventures · Legal & Trust · {meta.effectiveDate}
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            {activeDoc === "terms"
              ? "Terms of Service"
              : activeDoc === "privacy"
                ? "Privacy Policy (NDPA & GDPR)"
                : "Refund Policy"}
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">{meta.subtitle}</p>
        </div>

        {activeDoc === "terms" && (
          <div className="space-y-8 text-[15px] text-slate-700 leading-[1.7]">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                1. Independent Contractor Classification
              </h2>
              <p>
                All freelance voice artists, linguistic raters, bounding-box annotators, and domain reviewers executing deliverables inside Dutchkem Ventures Apex Data Copilot operate strictly as independent contractors. Neither use of the platform nor receipt of milestone payouts via Kora Pay (Domestic NGN or Global USD/GBP rails) establishes an employment contract, partnership, or statutory employee benefit entitlement. Contractors determine their own schedules and remain independently responsible for tax reporting within their jurisdiction.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                2. Subscription Billing & Automated 80/20 Escrow Settlement
              </h2>
              <p>
                Starter accounts receive a 14-day free trial limited to 3 tasks/month. Paid tiers bill monthly via Kora Pay across local (NGN) and international (USD/GBP) channels ($49/month Pro · 50 tasks/month; $199/month Agency · unlimited tasks). When an Agency or Enterprise buyer commits task funds to the Escrow Ledger, payout settlement splits 80% directly to the verified annotator and 20% to the managing agency platform fee, unlocked strictly upon passing automated QA rubrics (24kHz Mono SNR &gt; 35 dB, Whisper WER &lt;= 5%, or YOLOv8 IoU &gt;= 0.70) and admin verification.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                3. Platform Usage Rules & Zero-Trust Enforcement
              </h2>
              <p>
                Users must respect multi-tenant Row-Level Security boundaries and refrain from cross-tenant probing, unauthorized scraping, automated prompt-vault extraction, uploading non-consensual voice likenesses, or falsifying WAV DSP/bounding-box payloads. Violations trigger immediate session revocation, cryptographic audit logging, and termination of access.
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Key Contractual Commitments</h3>
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Full IP assignment of verified deliverables transfers upon escrow settlement.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Governing notices and formal disputes are administered via dutchkemsystems@gmail.com.</span>
                </li>
              </ul>
            </section>
          </div>
        )}

        {activeDoc === "privacy" && (
          <div className="space-y-8 text-[15px] text-slate-700 leading-[1.7]">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                1. NDPA 2023 & GDPR Compliance Framework
              </h2>
              <p>
                Dutchkem Ventures collects and processes personal data in strict accordance with the Nigeria Data Protection Act (NDPA 2023) and the EU/UK General Data Protection Regulation (GDPR). We process only the minimum identity, billing, and QA telemetry attributes needed to deliver multi-tenant workforce orchestration, enforce 2FA security, and execute payouts.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                2. Storage & Encryption of Audio WAV & Vision Annotation Files
              </h2>
              <p>
                Uploaded studio speech WAV recordings, synthetic voice tracks, and video/image annotation metadata are stored inside tenant-isolated Neon PostgreSQL encrypted media tables over SSL/TLS 1.3 with channel binding. PostgreSQL Row-Level Security guarantees that no external organization can query your project prompts, transcripts, or audio URIs. Temporary Audio QA inspection buffers uploaded outside paid client deliverables auto-purge within 30 days.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                3. Account Security, Payment Processors & Cookies
              </h2>
              <p>
                Passwords are salted and hashed with cryptographic key-derivation; optional TOTP 2FA secrets remain encrypted and never leave server boundaries. Card and bank payment credentials are tokenized directly by Kora Pay (PCI-DSS Level 1) for both home and international transactions and never touch Dutchkem Ventures storage. Essential `HttpOnly`, `SameSite=Lax` cookies are used strictly for authenticated session integrity and permanent logout revocation.
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Data Subject Rights (NDPA / GDPR)
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Users may request data portability exports, rectification, consent withdrawal for voice datasets, or permanent account and audio erasure within 72 hours by contacting dutchkemsystems@gmail.com.
              </p>
            </section>
          </div>
        )}

        {activeDoc === "refund" && (
          <div className="space-y-8 text-[15px] text-slate-700 leading-[1.7]">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                1. 7-Day Money-Back Guarantee for First-Time Pro Users
              </h2>
              <p>
                First-time subscribers upgrading to the Pro tier ($49/month or NGN equivalent via Kora Pay) are backed by an unconditional 7-day money-back guarantee measured from initial payment confirmation. If our Audio QA, Whisper WER, YOLOv8 IoU, or Auto-Bidder tools do not deliver measurable workflow value within 7 calendar days, you may request a full 100% refund with zero cancellation penalty.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                2. Trial Billing Protection & Instant Self-Serve Cancellation
              </h2>
              <p>
                Starter workspaces enjoy a 14-day free trial (up to 3 monthly QA tasks) with zero upfront charges. Once on a paid plan, you may cancel anytime directly inside the Customer Billing Portal on the Pricing page. Canceling halts future recurring charges immediately and transitions the workspace back to restricted access.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                3. Agency Subscriptions & Escrow Payout Finality
              </h2>
              <p>
                Agency plan ($199/month) refunds are eligible within 72 hours of first activation provided no large-scale 10,000-sample synthetic dataset batch exports have been consumed. Client milestone deposits that have passed automated QA verification and settled to contractor accounts via the 80/20 Escrow Ledger are final. Approved subscription refunds settle back to the original Kora Pay payment instrument (local NGN bank/card or international USD/GBP card) within 5–10 business days.
              </p>
            </section>

            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Need Billing Support or a First-Time Pro Refund?
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Send your Kora Pay transaction reference to dutchkemsystems@gmail.com or open Billing Portal.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenPricing}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Open Billing & Pricing
              </button>
            </section>
          </div>
        )}
      </main>

      <GlobalFooter
        onOpenLegal={onSelectDoc}
        onOpenPricing={onOpenPricing}
        isAuthenticated={isAuthenticated}
        onGoToDashboard={isAuthenticated ? onGoToDashboard : undefined}
        onSignIn={!isAuthenticated ? onSignIn : undefined}
      />
    </div>
  );
}
