"use client";

import React from "react";
import { AlertTriangle, Gauge } from "lucide-react";

export interface CostControlBannerProps {
  circuitOpen: boolean;
  highTrafficMessage?: string | null;
  tier?: string;
  qaHourlyLimit?: number;
  qaRemaining?: number;
  b2bHourlyLimit?: number;
}

export function HighTrafficCircuitBanner({
  circuitOpen,
  highTrafficMessage,
  tier = "pro",
  qaHourlyLimit = 50,
  qaRemaining = 50,
  b2bHourlyLimit = 1000,
}: CostControlBannerProps) {
  return (
    <div className="space-y-3">
      {circuitOpen && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">High Traffic · Automated QA Agents Temporarily Paused</p>
            <p className="text-xs text-amber-900">
              {highTrafficMessage ||
                "Our AI QA Agents are experiencing unusually high traffic right now and are temporarily paused to protect system stability. Please retry in a few minutes."}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-slate-700" />
          <span>
            Hourly QA Quota ({tier.toUpperCase()}):{" "}
            <strong className="font-mono text-slate-900 tabular-nums">
              {qaRemaining} / {qaHourlyLimit} uploads remaining
            </strong>
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">
          B2B Gateway Limit: {b2bHourlyLimit.toLocaleString()} req/hr per API key
        </span>
      </div>
    </div>
  );
}
