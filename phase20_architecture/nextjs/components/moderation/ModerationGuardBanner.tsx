"use client";

import React from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export interface ModerationStatusSnapshot {
  strikes: number;
  maxStrikes: number;
  isSuspended: boolean;
  suspensionReason: string | null;
  lastScanVerdict?: "approved" | "blocked" | null;
  lastScanner?: string | null;
}

export function ModerationGuardBanner({ status }: { status: ModerationStatusSnapshot }) {
  if (status.isSuspended) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Account Suspended (3 / {status.maxStrikes} Strikes Reached)</p>
          <p className="text-xs text-red-800">
            {status.suspensionReason ||
              "Your account has been automatically suspended after 3 blocked uploads. Platform administrators have been notified."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-slate-700">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          <strong>Pre-Upload Moderation Active:</strong> NSFW Image/Video, Audio STT Speech Gate &amp; Text Toxicity Filters run before every QA Agent dispatch.
        </span>
      </div>
      <div className="font-mono font-semibold text-slate-900 tabular-nums">
        Strikes: {status.strikes} / {status.maxStrikes}
      </div>
    </div>
  );
}
