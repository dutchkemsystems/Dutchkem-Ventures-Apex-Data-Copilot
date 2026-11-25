import React, { useEffect, useState } from "react";
import { ArrowRight, Pause, Play, RotateCcw, Sparkles, Video } from "lucide-react";

interface AutoBidderTutorialEmptyStateProps {
  onOpenAutoBidder?: () => void;
  onCreateFirstTask?: () => void;
}

const CHAPTERS = [
  {
    time: "00:00",
    title: "1. Connect Upwork, Mercor & AfterQuery Feeds",
    caption: "Filter verified AI evaluation & localization contracts matching your team's acoustic or vision SLAs.",
  },
  {
    time: "00:52",
    title: "2. Auto-Extract QA Thresholds & Bid Proposal",
    caption: "The Copilot reads 24kHz WAV / SNR > 35dB / YOLOv8 IoU >= 0.70 constraints and drafts a tailored 3-paragraph pitch.",
  },
  {
    time: "01:48",
    title: "3. Submit Bid & Lock 85/15 Kora Pay Escrow",
    caption: "Once accepted, deliverables pass automated pre-flight QA before funds disburse on NGN or USD rails.",
  },
];

export function AutoBidderTutorialEmptyState({
  onOpenAutoBidder,
  onCreateFirstTask,
}: AutoBidderTutorialEmptyStateProps) {
  const [playing, setPlaying] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [progressPct, setProgressPct] = useState(12);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setProgressPct((prev) => {
        if (prev >= 100) {
          setPlaying(false);
          return 100;
        }
        const next = prev + 4;
        if (next >= 66) setChapterIndex(2);
        else if (next >= 33) setChapterIndex(1);
        else setChapterIndex(0);
        return next;
      });
    }, 350);
    return () => window.clearInterval(timer);
  }, [playing]);

  const activeChapter = CHAPTERS[chapterIndex] ?? CHAPTERS[0];

  return (
    <section className="rounded-2xl border border-blue-200/80 bg-white overflow-hidden shadow-xs">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-white via-blue-50/40 to-emerald-50/30">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-950 text-white flex items-center justify-center shrink-0">
            <Video className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <p className="text-xs font-mono font-semibold text-blue-700">
              Empty Task Queue Walkthrough · 0 Tasks Yet
            </p>
            <h2 className="text-lg font-bold text-slate-950">
              Video Tutorial: How to use the Auto-Bidder
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Watch this 2m 45s interactive walkthrough to source contracts, auto-generate bids, and fill your task queue.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenAutoBidder && (
            <button
              type="button"
              onClick={onOpenAutoBidder}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Launch Auto-Bidder</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {onCreateFirstTask && (
            <button
              type="button"
              onClick={onCreateFirstTask}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Provision Task Manually
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Interactive Walkthrough Video Viewport */}
        <div className="lg:col-span-7 bg-slate-950 text-white p-6 flex flex-col justify-between min-h-[260px]">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>TUTORIAL // HOW TO USE THE AUTO-BIDDER</span>
            <span>{activeChapter.time} / 02:45</span>
          </div>

          <div className="my-6 space-y-2.5">
            <p className="text-xs font-mono text-sky-400 uppercase tracking-wider">
              Chapter {chapterIndex + 1} of {CHAPTERS.length}
            </p>
            <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
              {activeChapter.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              {activeChapter.caption}
            </p>
          </div>

          <div className="space-y-3">
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (progressPct >= 100) {
                      setProgressPct(0);
                      setChapterIndex(0);
                    }
                    setPlaying((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{playing ? "Pause Tutorial" : progressPct >= 100 ? "Replay Tutorial" : "Play Video"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setChapterIndex(0);
                    setProgressPct(12);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {progressPct}% watched
              </span>
            </div>
          </div>
        </div>

        {/* Clickable Video Chapters */}
        <div className="lg:col-span-5 divide-y divide-slate-100 bg-white">
          {CHAPTERS.map((chap, idx) => {
            const active = idx === chapterIndex;
            return (
              <button
                key={chap.time}
                type="button"
                onClick={() => {
                  setChapterIndex(idx);
                  setProgressPct(idx === 0 ? 12 : idx === 1 ? 45 : 78);
                }}
                className={`w-full text-left p-5 transition-colors space-y-1 ${
                  active ? "bg-blue-50/70" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className={active ? "text-blue-700 font-semibold" : "text-slate-500"}>
                    {chap.time}
                  </span>
                  {active && <span className="text-blue-700 font-semibold">Playing</span>}
                </div>
                <p className="text-sm font-bold text-slate-900">{chap.title}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{chap.caption}</p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
