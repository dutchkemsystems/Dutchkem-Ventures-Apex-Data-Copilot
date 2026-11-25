import React from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { usePWAInstall } from "../pwa/usePWAInstall";

interface PWAInstallButtonProps {
  compact?: boolean;
  onOpenOfflineScripts?: () => void;
}

export function PWAInstallButton({
  compact = false,
  onOpenOfflineScripts,
}: PWAInstallButtonProps) {
  const {
    canInstall,
    isInstalled,
    isIOS,
    showIOSInstructions,
    setShowIOSInstructions,
    promptInstall,
  } = usePWAInstall();

  if (isInstalled) {
    return null;
  }

  return (
    <>
      {canInstall ? (
        <button
          type="button"
          onClick={() => void promptInstall()}
          className={
            compact
              ? "inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-[#0B1F3A] hover:border-blue-400 hover:bg-blue-50/70 transition-colors whitespace-nowrap shrink-0"
              : "w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2.5 text-xs font-semibold rounded-xl bg-[#0B1F3A] text-white hover:bg-slate-900 transition-colors shadow-xs whitespace-nowrap"
          }
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{compact ? "Install App" : "Install ApexData App"}</span>
        </button>
      ) : onOpenOfflineScripts ? (
        <button
          type="button"
          onClick={onOpenOfflineScripts}
          className={
            compact
              ? "inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
              : "w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap"
          }
        >
          <Smartphone className="w-4 h-4 shrink-0 text-[#0B1F3A]" />
          <span>Offline Scripts</span>
        </button>
      ) : null}

      {isIOS && showIOSInstructions && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install ApexData on iPhone or iPad"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  iOS Home Screen Install
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  Install Dutchkem Apex Data Copilot
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close install instructions"
                onClick={() => setShowIOSInstructions(false)}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#0B1F3A] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Tap the <Share className="inline w-4 h-4 text-blue-600 mx-0.5" />{" "}
                  <strong>Share</strong> button in the Safari browser bar.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#0B1F3A] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#0B1F3A] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top right to launch <strong>ApexData</strong> in
                  standalone app mode with offline Job Board scripts.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSInstructions(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#0B1F3A] text-white text-sm font-semibold hover:bg-slate-900 transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
