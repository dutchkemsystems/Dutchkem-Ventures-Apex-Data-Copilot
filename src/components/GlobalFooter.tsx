import React from "react";

export type LegalDocSlug = "terms" | "privacy" | "refund";

interface GlobalFooterProps {
  onOpenLegal: (slug: LegalDocSlug) => void;
  onOpenPricing: () => void;
  isAuthenticated?: boolean;
  onGoToDashboard?: () => void;
  onSignIn?: () => void;
  compact?: boolean;
}

export function GlobalFooter({
  onOpenLegal,
  onOpenPricing,
  isAuthenticated = false,
  onGoToDashboard,
  onSignIn,
  compact = false,
}: GlobalFooterProps) {
  return (
    <footer className="border-t border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <div
        className={`mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-6 text-xs text-slate-600 ${
          compact ? "py-5 max-w-[1440px] 2xl:max-w-[1840px]" : "py-8 max-w-7xl"
        }`}
      >
        <div className="space-y-1 text-center sm:text-left">
          <p className="font-semibold text-slate-900">
            Dutchkem Ventures · Apex Data Copilot
          </p>
          <p className="text-slate-500">
            NDPA & GDPR compliant multi-tenant AI workforce orchestration & automated QA.
          </p>
        </div>

        <nav
          aria-label="Global legal and platform footer"
          className="flex flex-wrap items-center justify-center gap-6"
        >
          <button
            type="button"
            onClick={() => onOpenLegal("terms")}
            className="hover:text-blue-700 transition-colors whitespace-nowrap"
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => onOpenLegal("privacy")}
            className="hover:text-blue-700 transition-colors whitespace-nowrap"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => onOpenLegal("refund")}
            className="hover:text-blue-700 transition-colors whitespace-nowrap"
          >
            Refund Policy
          </button>
          <button
            type="button"
            onClick={onOpenPricing}
            className="hover:text-blue-700 transition-colors whitespace-nowrap"
          >
            Pricing
          </button>
          {isAuthenticated && onGoToDashboard ? (
            <button
              type="button"
              onClick={onGoToDashboard}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-sm hover:brightness-105 transition-all whitespace-nowrap shrink-0"
            >
              Go to Dashboard
            </button>
          ) : (
            onSignIn && (
              <button
                type="button"
                onClick={onSignIn}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )
          )}
        </nav>
      </div>
    </footer>
  );
}
