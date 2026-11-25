import type { Metadata } from "next";
import Link from "next/link";
import { GlobalFooter } from "@/components/GlobalFooter";

export const metadata: Metadata = {
  title: "Privacy Policy (NDPA & GDPR Compliant) | Dutchkem Ventures",
  description:
    "NDPA and GDPR compliant Privacy Policy detailing how user accounts, tenant metadata, and studio audio WAV / vision files are encrypted and stored.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <main className="flex-1 mx-auto max-w-4xl w-full px-6 py-16 space-y-8">
        <header className="border-b border-slate-200 pb-6 space-y-2">
          <p className="text-xs font-mono text-amber-700">
            NDPA (Nigeria Data Protection Act 2023) & GDPR Compliant · Updated November 15, 2026
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-600">
            How Dutchkem Ventures collects, encrypts, isolates, and retains workspace credentials, acoustic WAV files, and annotation telemetry.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">1. Regulatory Scope & Lawful Basis</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Dutchkem Ventures processes personal data in full compliance with the Nigeria Data Protection Act (NDPA 2023) and the EU/UK General Data Protection Regulation (GDPR). Processing is strictly grounded in contractual necessity (delivering workspace QA, payouts, and 2FA authentication), legal tax compliance, and explicit consent for voice synthesis or interview practice recordings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">2. User Account Data & Multi-Tenant Isolation</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            We store account names, business emails, scrypt/PBKDF2 password hashes, TOTP 2FA secrets (encrypted at rest), and subscription state in Neon PostgreSQL protected by strict Row-Level Security (app.current_org_id). Payment card and bank details are never stored on Dutchkem Ventures servers; all local and international card and bank transfers run exclusively through Kora Pay (PCI-DSS Level 1).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">3. Storage & Retention of Audio WAV & Annotation Files</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Uploaded 24kHz WAV speech clips, synthetic voice generations, and video bounding-box metadata are stored inside tenant-isolated Neon PostgreSQL encrypted media tables over SSL/TLS 1.3 with channel binding. Acoustic files uploaded for one-off Audio QA verification without an active client milestone are automatically purged within 30 days, and tenant admins may trigger immediate permanent deletion via Settings or by contacting our Data Protection Officer at dutchkemsystems@gmail.com.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">4. Data Subject Rights (NDPA & GDPR)</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Every user and contractor retains the right to access, rectify, export (machine-readable JSON/CSV), restrict processing of, or erase their personal records and biometric speech samples. Verified deletion requests are executed across primary storage and webhook logs within 72 business hours.
          </p>
        </section>

        <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-medium">
          <Link href="/legal/terms" className="text-amber-700 hover:underline">
            Terms of Service
          </Link>
          <Link href="/legal/refund" className="text-amber-700 hover:underline">
            Refund Policy
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
