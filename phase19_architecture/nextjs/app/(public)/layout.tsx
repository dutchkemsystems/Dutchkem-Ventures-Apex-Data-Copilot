import React from "react";

/**
 * Public Plane Root Layout (/, /pricing, /blog/*, /legal/*)
 * Contains zero User or Admin React Context Providers and zero authenticated bundle code.
 */
export default function PublicPlaneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="h-16 px-6 lg:px-8 border-b border-slate-200 bg-white flex items-center justify-between gap-8">
        <a
          href="/"
          className="text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0"
        >
          Dutchkem Apex Copilot
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href="/pricing" className="hover:text-slate-950 whitespace-nowrap shrink-0">
            Pricing
          </a>
          <a href="/blog/ai-qa-economics" className="hover:text-slate-950 whitespace-nowrap shrink-0">
            Insights
          </a>
          <a href="/legal/privacy" className="hover:text-slate-950 whitespace-nowrap shrink-0">
            Privacy &amp; NDPA
          </a>
          <a href="/legal/terms" className="hover:text-slate-950 whitespace-nowrap shrink-0">
            Terms
          </a>
        </nav>
        <a
          href="/login"
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-950 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
        >
          Sign In
        </a>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
