import Link from "next/link";

export function GlobalFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500">
        <div className="space-y-1 text-center sm:text-left">
          <p className="font-semibold text-slate-900">
            Dutchkem Ventures · Apex Data Copilot
          </p>
          <p>NDPA & GDPR Compliant Multi-Tenant AI Data Operations Platform.</p>
        </div>

        <nav
          aria-label="Global footer links"
          className="flex flex-wrap items-center justify-center gap-6"
        >
          <Link href="/legal/terms" className="hover:text-slate-900 transition-colors whitespace-nowrap">
            Terms of Service
          </Link>
          <Link href="/legal/privacy" className="hover:text-slate-900 transition-colors whitespace-nowrap">
            Privacy Policy (NDPA)
          </Link>
          <Link href="/legal/refund" className="hover:text-slate-900 transition-colors whitespace-nowrap">
            Refund Policy
          </Link>
          <Link href="/pricing" className="hover:text-slate-900 transition-colors whitespace-nowrap">
            Pricing
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-xs font-medium rounded-md bg-[#0F172A] text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Go to Dashboard
          </Link>
        </nav>
      </div>
    </footer>
  );
}
