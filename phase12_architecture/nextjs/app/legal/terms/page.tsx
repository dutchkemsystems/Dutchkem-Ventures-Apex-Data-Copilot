import type { Metadata } from "next";
import Link from "next/link";
import { GlobalFooter } from "@/components/GlobalFooter";

export const metadata: Metadata = {
  title: "Terms of Service | Dutchkem Ventures Apex Data Copilot",
  description:
    "Terms of Service covering independent contractor status, 80/20 escrow payment settlement via Kora Pay (home NGN & global USD/GBP), and acceptable platform usage rules.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <main className="flex-1 mx-auto max-w-4xl w-full px-6 py-16 space-y-8">
        <header className="border-b border-slate-200 pb-6 space-y-2">
          <p className="text-xs font-mono text-amber-700">
            Dutchkem Ventures · Legal & Governance · Effective November 15, 2026
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            Terms of Service
          </h1>
          <p className="text-sm text-slate-600">
            Governing access to the Dutchkem Ventures Apex Data Copilot multi-tenant workspace, automated QA pipelines, and contractor escrow marketplace.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">1. Independent Contractor Status</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Freelancers, annotators, audio engineers, and boutique agency specialists performing data labeling, voice recording, red-teaming, or QA tasks through the Dutchkem Ventures Apex Data Copilot operate strictly as independent contractors. Nothing in these Terms creates an employment, partnership, joint venture, or agency fiduciary relationship between Dutchkem Ventures and any annotator or agency subscriber. Contractors remain solely responsible for their own taxes, equipment, internet connectivity, and statutory filings in their jurisdiction.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">2. Subscription & Escrow Payment Terms</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Paid workspaces are billed monthly via Kora Pay across local (NGN) and international (USD/GBP) channels ($49/month for Pro with 50 tasks/month; $199/month for Agency with unlimited tasks). When an Agency or Enterprise buyer funds an annotation project into the Apex Escrow Ledger, payouts follow an automated 80% contractor / 20% agency platform fee split released only after deterministic QA checks (24kHz Mono SNR &gt; 35 dB, Whisper WER &lt;= 5%, or YOLOv8 IoU &gt;= 0.70) and admin signoff succeed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">3. Platform Usage Rules & Security Boundaries</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Subscribers and annotators must maintain single-tenant boundaries enforced via PostgreSQL Row-Level Security (RLS). Attempting cross-tenant queries, automating credential scraping, attempting prompt injection or system-prompt extraction against sealed prompt vaults, uploading stolen or non-consensual biometric voice recordings, or falsifying acoustic/bounding-box telemetry will result in immediate account termination and forfeiture of pending dispute balances.
          </p>
        </section>

        <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-medium">
          <Link href="/legal/privacy" className="text-amber-700 hover:underline">
            Read Privacy Policy (NDPA / GDPR)
          </Link>
          <Link href="/legal/refund" className="text-amber-700 hover:underline">
            Read Refund Policy
          </Link>
          <Link href="/" className="text-slate-600 hover:text-slate-900">
            Return to Homepage
          </Link>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
