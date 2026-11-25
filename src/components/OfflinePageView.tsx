import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Copy,
  RefreshCw,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  hydrateCachedOfflineScripts,
  type OfflineAssignedScript,
} from "../pwa/offlineScriptStore";
import { useOnlineStatus } from "../pwa/usePWAInstall";
import { PWAInstallButton } from "./PWAInstallButton";

interface OfflinePageViewProps {
  isAuthenticated?: boolean;
  onReturnDashboard?: () => void;
  onOpenJobBoard?: () => void;
  onReturnHomepage?: () => void;
}

export function OfflinePageView({
  isAuthenticated = false,
  onReturnDashboard,
  onOpenJobBoard,
  onReturnHomepage,
}: OfflinePageViewProps) {
  const isOnline = useOnlineStatus();
  const [scripts, setScripts] = useState<OfflineAssignedScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hydrateCachedOfflineScripts()
      .then((items) => {
        if (active) {
          setScripts(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredScripts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.orgOrClient.toLowerCase().includes(q) ||
        item.scriptBody.toLowerCase().includes(q) ||
        item.qaType.toLowerCase().includes(q)
    );
  }, [scripts, query]);

  async function handleCopyScript(script: OfflineAssignedScript) {
    try {
      await navigator.clipboard.writeText(`${script.title}\n\n${script.scriptBody}`);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = `${script.title}\n\n${script.scriptBody}`;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedId(script.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  function handleRetryConnection() {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      setRetryFeedback("Connection restored. Returning to live workspace...");
      if (isAuthenticated && onReturnDashboard) {
        onReturnDashboard();
      } else if (onReturnHomepage) {
        onReturnHomepage();
      } else {
        window.location.href = "/";
      }
      return;
    }
    setRetryFeedback(
      "Still offline. Cached recording scripts and QA rubrics stay available below."
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-[#0F172A] flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0B1F3A] text-white border-b border-slate-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-emerald-300" />
              ) : (
                <WifiOff className="w-5 h-5 text-amber-300" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sky-300 truncate">
                Dutchkem Apex Data Copilot · PWA Offline Vault
              </p>
              <h1 className="text-base sm:text-lg font-bold text-white truncate">
                Offline Assigned Scripts &amp; Job Briefs
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={handleRetryConnection}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-sky-400 transition-colors"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 sm:py-8 space-y-6 flex-1">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-xs font-semibold">
                {isOnline ? (
                  <span className="text-emerald-700 inline-flex items-center gap-1.5">
                    <Wifi className="w-4 h-4" />
                    Online · Synced scripts ready for airplane or booth mode
                  </span>
                ) : (
                  <span className="text-amber-700 inline-flex items-center gap-1.5">
                    <WifiOff className="w-4 h-4" />
                    Offline Mode · Reading from on-device cache
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600">
                Review your assigned Job Board scripts and QA thresholds anywhere without mobile data.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isOnline && onOpenJobBoard && (
                <button
                  type="button"
                  onClick={onOpenJobBoard}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:border-blue-400 hover:text-blue-700 inline-flex items-center gap-2 transition-colors"
                >
                  <BriefcaseBusiness className="w-4 h-4" />
                  <span>Browse Job Board</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isAuthenticated && onReturnDashboard) onReturnDashboard();
                  else if (onReturnHomepage) onReturnHomepage();
                  else window.location.href = "/";
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 hover:bg-slate-100 inline-flex items-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{isAuthenticated ? "Back to Dashboard" : "Back to Home"}</span>
              </button>
            </div>
          </div>

          {retryFeedback && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-900">
              {retryFeedback}
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cached scripts by title, language, client, or QA type..."
              aria-label="Search cached scripts"
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
        </section>

        {loading ? (
          <div className="space-y-3">
            <div className="h-32 rounded-2xl border border-slate-200 bg-white animate-pulse" />
            <div className="h-32 rounded-2xl border border-slate-200 bg-white animate-pulse" />
          </div>
        ) : filteredScripts.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-[#0B1F3A] mx-auto" />
            <h2 className="text-base font-bold text-slate-900">
              No Offline Scripts Cached Yet
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Visit your Dashboard or the Job Board while online once and your assigned prompts,
              audio recording scripts, and QA checklists will sync here automatically.
            </p>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredScripts.map((script) => (
              <article
                key={script.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="uppercase text-blue-700">{script.qaType} QA</span>
                      <span aria-hidden="true">·</span>
                      <span>{script.orgOrClient}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{script.status.replace("_", " ")}</span>
                    </div>
                    <h2 className="text-base font-bold text-slate-950">{script.title}</h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopyScript(script)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {copiedId === script.id ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Script</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line rounded-xl bg-slate-50 border border-slate-100 p-3.5">
                  {script.scriptBody}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
                  <span className="font-mono text-slate-700">{script.qaRubric}</span>
                  <span className="font-semibold text-emerald-700">
                    Escrow Budget: ${script.payoutUsd.toLocaleString()}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
