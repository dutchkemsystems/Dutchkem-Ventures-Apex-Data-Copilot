import type { Metadata } from "next";
import Link from "next/link";
import { GlobalFooter } from "@/components/GlobalFooter";

export const metadata: Metadata = {
  title: "Refund Policy (7-Day Pro Guarantee) | Dutchkem Ventures",
  description:
    "Transparent subscription refund terms including a 7-day money-back guarantee for first-time Pro ($49/mo) subscribers.",
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <main className="flex-1 mx-auto max-w-4xl w-full px-6 py-16 space-y-8">
        <header className="border-b border-slate-200 pb-6 space-y-2">
          <p className="text-xs font-mono text-amber-700">
            Billing Transparency · Effective November 15, 2026
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            Refund Policy
          </h1>
          <p className="text-sm text-slate-600">
            Clear, fair refund and cancellation rules for Starter Trials, Pro subscriptions, and Agency operations.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">1. 7-Day Money-Back Guarantee for First-Time Pro Users</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            First-time Pro tier ($49/month or NGN equivalent via Kora Pay) subscribers are covered by an unconditional 7-day money-back guarantee from the timestamp of initial checkout settlement. If the Audio QA, Whisper WER, YOLOv8 IoU, or Auto-Bidder tools do not fit your agency workflow within your first 7 calendar days, request a full refund via the Customer Billing Portal or by emailing dutchkemsystems@gmail.com with your payment reference.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">2. 14-Day Free Trial & Self-Serve Cancellations</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Starter Free Trial workspaces ($0/mo, 3 tasks/month for 14 days) carry zero obligation and incur no automatic charge until you deliberately authorize a Pro or Agency upgrade checkout. Active subscribers can cancel at any moment from the Customer Billing Portal; upon cancellation, recurring renewals cease immediately and the workspace downgrades to restricted status at cycle end or upon immediate voluntary cancellation.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">3. Agency Tier & Settled Contractor Escrow Milestones</h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Agency subscriptions ($199/month) qualify for pro-rata review within 72 hours if zero production synthetic dataset exports or QA batches have been executed during the cycle. Funds that have already cleared the QA gate and been disbursed to independent contractors through the 80/20 Escrow Ledger are final and non-refundable once contractor settlement has completed. Approved refunds settle back to the original Kora Pay local (NGN) or international (USD/GBP) payment rail within 5–10 business days.
          </p>
        </section>

        <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-medium">
          <Link href="/legal/terms" className="text-amber-700 hover:underline">
            Terms of Service
          </Link>
          <Link href="/legal/privacy" className="text-amber-700 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/pricing" className="text-amber-700 hover:underline">
            View Pricing Tiers
          </Link>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
