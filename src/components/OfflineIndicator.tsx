import React from "react";
import { BookOpen, WifiOff } from "lucide-react";
import { useOnlineStatus } from "../pwa/usePWAInstall";

interface OfflineIndicatorProps {
  onOpenOfflinePage: () => void;
}

export function OfflineIndicator({ onOpenOfflinePage }: OfflineIndicatorProps) {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-md z-50 rounded-2xl border border-amber-300/80 bg-[#0B1F3A] text-white p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center justify-center shrink-0">
          <WifiOff className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">You are offline</p>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your assigned recording scripts and Job Board briefs remain available offline.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenOfflinePage}
        className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 text-[#0B1F3A] text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
      >
        <BookOpen className="w-4 h-4 shrink-0" />
        <span>Read Offline Scripts</span>
      </button>
    </div>
  );
}
