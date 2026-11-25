import React, { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  AudioWaveform,
  Bot,
  Compass,
  Eye,
  LogIn,
  Menu,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { GlobalFooter, type LegalDocSlug } from "./GlobalFooter";
import { DataMarketplaceView } from "./DataMarketplaceView";
import { HeroNeuralCanvas } from "./HeroNeuralCanvas";
import { PWAInstallButton } from "./PWAInstallButton";
import heroArtworkUrl from "../assets/images/hero_studio_prism_1794784987701.jpg";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import type { WorkspaceSection } from "./Sidebar";

interface LandingHomepageViewProps {
  isAuthenticated: boolean;
  orgId?: string;
  orgName?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  initialTab?: "overview" | "marketplace";
  onNavigateDashboard: (section?: WorkspaceSection) => void;
  onOpenLogin: () => void;
  onOpenPricing: () => void;
  onOpenJobBoard?: () => void;
  onOpenDataMarketplace?: () => void;
  onOpenJobPage?: (slug: string) => void;
  onOpenBlogPage?: (slug: string) => void;
  onOpenLegalPage?: (slug: LegalDocSlug) => void;
  onOpenOfflinePage?: () => void;
}

const HERO_ARTWORK_URL = heroArtworkUrl;

const FEATURE_CARDS: Array<{
  title: string;
  metric: string;
  description: string;
  targetSection: WorkspaceSection;
  icon: React.ComponentType<{ className?: string }>;
  accentText: string;
  iconShell: string;
  hoverBorder: string;
}> = [
  {
    title: "Auto-Bidder AI",
    metric: "Upwork · Mercor · AfterQuery · TELUS Digital",
    description:
      "Continuously scans high-ticket annotation listings, extracts acoustic and rubric constraints, and dispatches tailored agency proposals automatically.",
    targetSection: "sales-agent",
    icon: Bot,
    accentText: "text-blue-700",
    iconShell: "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm",
    hoverBorder: "hover:border-blue-400 hover:shadow-[0_18px_45px_rgba(37,99,235,0.14)]",
  },
  {
    title: "Audio QA (librosa)",
    metric: "Mono · 24kHz · Peak -6 to -3 dBFS · > 35 dB SNR",
    description:
      "Validates WAV containers, noise floor (< -70 dBFS), and Whisper STT Word Error Rate before any escrow payout leaves your agency account.",
    targetSection: "qa-engines",
    icon: AudioWaveform,
    accentText: "text-sky-700",
    iconShell: "bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm",
    hoverBorder: "hover:border-sky-400 hover:shadow-[0_18px_45px_rgba(14,165,233,0.14)]",
  },
  {
    title: "Synthetic Data Factory",
    metric: "10,000+ Multilingual Utterances & Red-Team Audits",
    description:
      "Produces multi-accent speech datasets via ElevenLabs, Coqui XTTS, and Gemini TTS alongside automated adversarial jailbreak safety reports.",
    targetSection: "factory",
    icon: Sparkles,
    accentText: "text-amber-700",
    iconShell: "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm",
    hoverBorder: "hover:border-amber-400 hover:shadow-[0_18px_45px_rgba(245,158,11,0.15)]",
  },
  {
    title: "Vision Annotation (YOLO)",
    metric: "IoU >= 0.70 Threshold Verification Gate",
    description:
      "Evaluates annotator bounding boxes against YOLOv8 detections and flags geometry drift or label mismatches prior to client delivery.",
    targetSection: "qa-engines",
    icon: Eye,
    accentText: "text-emerald-700",
    iconShell: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm",
    hoverBorder: "hover:border-emerald-400 hover:shadow-[0_18px_45px_rgba(16,185,129,0.14)]",
  },
];

function VisionMissionSection() {
  const visionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: visionRef,
    offset: ["start end", "end start"],
  });
  const parallaxY = useTransform(scrollYProgress, [0, 1], [28, -28]);

  return (
    <section id="vision" ref={visionRef} className="mx-auto max-w-7xl 2xl:max-w-[1680px] px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <p className="text-xs font-mono font-semibold text-blue-700">Vision & Mission</p>
        <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
          Autonomous data operations built for zero-defect global AI supply chains.
        </h2>
      </div>

      <motion.div
        style={{ y: parallaxY }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-white via-blue-50/40 to-sky-50/70 p-8 sm:p-10 space-y-4 shadow-[0_12px_36px_rgba(37,99,235,0.06)]">
          <p className="text-xs font-mono font-semibold text-blue-700">01. Our Vision</p>
          <h3 className="text-2xl font-bold tracking-tight text-slate-950">
            Turn boutique data agencies into automated AI evaluation powerhouses.
          </h3>
          <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
            Every model lab demands studio-grade speech, precision vision geometry, and verifiable safety testing. Our vision empowers specialized agencies worldwide to deliver institutional throughput without compromising human craft or acoustic rigor.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/40 to-amber-50/60 p-8 sm:p-10 space-y-4 shadow-[0_12px_36px_rgba(16,185,129,0.06)]">
          <p className="text-xs font-mono font-semibold text-emerald-700">02. Our Mission</p>
          <h3 className="text-2xl font-bold tracking-tight text-slate-950">
            Automate bidding, deterministic QA, and instant human-in-the-loop payouts.
          </h3>
          <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
            Dutchkem Ventures connects Neon PostgreSQL Row-Level Security multi-tenancy with an Auto-Bidder Sales Agent, Audio/Vision/Text QA verifiers, a 10,000-utterance Synthetic Data Factory, and automated Kora Pay domestic & international settlement.
          </p>
        </div>
      </motion.div>
    </section>
  );
}

export function LandingHomepageView({
  isAuthenticated,
  orgId = "",
  orgName = "",
  userId = "",
  userName = "",
  userEmail = "",
  initialTab = "overview",
  onNavigateDashboard,
  onOpenLogin,
  onOpenPricing,
  onOpenJobBoard,
  onOpenDataMarketplace,
  onOpenJobPage,
  onOpenBlogPage,
  onOpenLegalPage,
  onOpenOfflinePage,
}: LandingHomepageViewProps) {
  const [heroImgError, setHeroImgError] = useState(false);
  const [activeHomeTab, setActiveHomeTab] = useState<"overview" | "marketplace">(initialTab);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function switchHomeTab(tab: "overview" | "marketplace") {
    setActiveHomeTab(tab);
    setMobileNavOpen(false);
    if (tab === "marketplace") {
      onOpenDataMarketplace?.();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-[#0F172A] selection:bg-sky-200/60 overflow-x-clip">
      {/* Top Bar Contract: Single row, 3 zones separated by clean spacing */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl 2xl:max-w-[1680px] items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open menu"
                  className="md:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shrink-0"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 md:hidden">
                <SheetHeader className="px-5 pb-3 border-b border-slate-100">
                  <SheetTitle>Dutchkem Ventures</SheetTitle>
                  <SheetDescription>Apex Data Copilot Navigation</SheetDescription>
                </SheetHeader>
                <div className="p-4 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  <button
                    type="button"
                    onClick={() => switchHomeTab("overview")}
                    className="min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-100"
                  >
                    Vision
                  </button>
                  <a
                    href="#features"
                    onClick={() => {
                      setActiveHomeTab("overview");
                      setMobileNavOpen(false);
                    }}
                    className="min-h-[44px] px-3 rounded-xl flex items-center hover:bg-slate-100"
                  >
                    Features
                  </a>
                  <button
                    type="button"
                    onClick={() => switchHomeTab("marketplace")}
                    className="min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-100"
                  >
                    Marketplace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      onOpenPricing();
                    }}
                    className="min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-100"
                  >
                    Pricing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      onOpenJobBoard?.();
                    }}
                    className="min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-100"
                  >
                    Job Board
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      isAuthenticated ? onNavigateDashboard("blueprints") : onOpenLogin();
                    }}
                    className="min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-100"
                  >
                    Architecture
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      isAuthenticated ? onNavigateDashboard("overview") : onOpenLogin();
                    }}
                    className="min-h-[44px] px-3 rounded-xl text-left font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    {isAuthenticated ? "Go to Dashboard" : "Sign In"}
                  </button>
                  <div className="pt-3 border-t border-slate-100">
                    <PWAInstallButton
                      onOpenOfflineScripts={() => {
                        setMobileNavOpen(false);
                        onOpenOfflinePage?.();
                      }}
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="min-h-[44px] inline-flex items-center gap-2 text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
                <Compass className="w-4 h-4" />
              </span>
              <span>Dutchkem Ventures</span>
            </button>
          </div>

          <nav
            aria-label="Homepage sections"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => switchHomeTab("overview")}
              className={`hover:text-blue-700 transition-colors whitespace-nowrap shrink-0 ${
                activeHomeTab === "overview" ? "font-semibold text-slate-950" : ""
              }`}
            >
              Vision
            </button>
            <a
              href="#features"
              onClick={() => setActiveHomeTab("overview")}
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <button
              type="button"
              onClick={() => switchHomeTab("marketplace")}
              className={`hover:text-blue-700 transition-colors whitespace-nowrap shrink-0 ${
                activeHomeTab === "marketplace"
                  ? "font-semibold text-blue-700 underline decoration-blue-600 underline-offset-8"
                  : ""
              }`}
            >
              Marketplace
            </button>
            <button
              type="button"
              onClick={onOpenPricing}
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={onOpenJobBoard}
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Job Board
            </button>
            <button
              type="button"
              onClick={() =>
                isAuthenticated ? onNavigateDashboard("blueprints") : onOpenLogin()
              }
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Architecture
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => onNavigateDashboard("overview")}
                className="font-semibold text-blue-700 hover:text-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                Go to Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="font-semibold text-blue-700 hover:text-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </nav>

          <div className="shrink-0 flex items-center gap-2">
            <div className="hidden sm:block">
              <PWAInstallButton compact onOpenOfflineScripts={onOpenOfflinePage} />
            </div>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={onOpenPricing}
              className="min-h-[44px] px-3 sm:px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white shadow-[0_8px_22px_rgba(37,99,235,0.28)] hover:shadow-[0_12px_28px_rgba(37,99,235,0.4)] transition-shadow whitespace-nowrap shrink-0"
            >
              <span className="sm:hidden">Free Trial</span>
              <span className="hidden sm:inline">Start Your Free Trial</span>
            </motion.button>
          </div>
        </div>
      </header>

      {/* Homepage Marketplace Tab View */}
      {activeHomeTab === "marketplace" ? (
        <main className="mx-auto max-w-7xl 2xl:max-w-[1680px] px-6 py-10">
          <DataMarketplaceView
            embeddedInHomepage
            isAuthenticated={isAuthenticated}
            orgId={orgId}
            orgName={orgName}
            userId={userId}
            userName={userName}
            userEmail={userEmail}
            onReturnHomepage={() => switchHomeTab("overview")}
            onOpenLogin={onOpenLogin}
            onOpenDashboard={() => onNavigateDashboard("data-marketplace")}
          />
        </main>
      ) : (
        <>
      {/* Hero Section: Radiant 4K Light Canvas + Architectural Visual */}
      <section className="relative overflow-hidden border-b border-slate-200/80 min-h-[680px] flex items-center bg-gradient-to-br from-[#F0F7FF] via-[#FFFFFF] to-[#ECFDF5]">
        <HeroNeuralCanvas />
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(59,130,246,0.12),transparent_48%),radial-gradient(circle_at_84%_74%,rgba(16,185,129,0.11),transparent_45%),radial-gradient(circle_at_60%_14%,rgba(245,158,11,0.09),transparent_40%)] pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-7xl 2xl:max-w-[1680px] px-6 py-20 lg:py-24 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 space-y-6"
          >
            <p className="text-xs font-mono font-semibold tracking-wider text-blue-700">
              Apex Data Copilot · Multi-Tenant AI Workforce Orchestration
            </p>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] 2xl:text-6xl font-bold tracking-tight text-slate-950 leading-[1.06] text-balance">
              Precision AI Data Craft.{" "}
              <span className="bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-600 bg-clip-text text-transparent">
                Scale Globally.
              </span>{" "}
              Automate Every Gate.
            </h1>

            <p className="max-w-2xl text-base sm:text-lg text-slate-600 leading-relaxed">
              Generate multilingual synthetic speech, verify studio 24kHz SNR, enforce YOLOv8 IoU precision, and win high-value contracts automatically with Kora Pay local and global settlement.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={onOpenPricing}
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white shadow-[0_14px_32px_rgba(37,99,235,0.28)] hover:shadow-[0_18px_38px_rgba(37,99,235,0.42)] transition-all whitespace-nowrap shrink-0"
              >
                <span>Start Your Free Trial</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>

              <button
                type="button"
                onClick={() => switchHomeTab("marketplace")}
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold rounded-xl border border-blue-200 bg-blue-50/90 text-blue-800 hover:bg-blue-100 transition-colors shadow-xs whitespace-nowrap shrink-0"
              >
                <span>Browse Data Marketplace</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {onOpenJobBoard && (
                <button
                  type="button"
                  onClick={onOpenJobBoard}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold rounded-xl border border-emerald-300 bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 transition-colors shadow-xs whitespace-nowrap shrink-0"
                >
                  <span>Post a Job ($500)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => onNavigateDashboard("overview")}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white/95 text-slate-900 hover:border-blue-600 hover:text-blue-700 transition-colors shadow-xs whitespace-nowrap shrink-0"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold rounded-xl border border-blue-200 bg-white/95 text-blue-700 hover:border-blue-500 hover:bg-blue-50/70 transition-colors shadow-xs whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to Workspace</span>
                </button>
              )}
            </div>
          </motion.div>

          {/* Right 4K Editorial Studio Showcase */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5"
          >
            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl p-3 shadow-[0_24px_64px_rgba(15,23,42,0.10)]">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-gradient-to-br from-sky-100 via-white to-emerald-100">
                {!heroImgError ? (
                  <img
                    src={HERO_ARTWORK_URL}
                    alt="Dutchkem Ventures luminous 4K acoustic and vision data architecture sculpture"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 p-6 text-center">
                    <p className="text-sm font-semibold text-blue-900">
                      Dutchkem Ventures · Multi-Modal AI QA Studio
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 px-2 pt-3 pb-1 text-xs">
                <div>
                  <p className="text-slate-500">Acoustic Gate</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-blue-700">
                    24kHz · 35+ dB
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Vision IoU</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-emerald-700">
                    YOLOv8 ≥ 0.70
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Escrow Rail</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-amber-700">
                    Kora Pay 80/20
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Proof Strip Adjacent to Hero */}
      <section className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1680px] px-6 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500">Audio QA Acoustic Gate</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-blue-700">
              &gt; 35 dB SNR
            </p>
            <p className="mt-0.5 text-xs text-slate-500">24kHz Mono · &lt; -70 dBFS noise</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Vision Bounding Box Gate</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
              IoU ≥ 0.70
            </p>
            <p className="mt-0.5 text-xs text-slate-500">YOLOv8 overlap inspection</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">White-Label Escrow Split</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-600">
              80% / 20%
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Kora Pay Local & Global</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Synthetic Corpus Scale</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-sky-600">
              10,000+
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Multilingual prosody samples</p>
          </div>
        </div>
      </section>

      {/* Vision & Mission Section with Parallax Scroll Animation */}
      <VisionMissionSection />

      {/* 4 Interactive Colourful Feature Cards */}
      <section id="features" className="mx-auto max-w-7xl 2xl:max-w-[1680px] px-6 pb-24">
        <div className="mb-12 max-w-2xl">
          <p className="text-xs font-mono font-semibold text-emerald-700">Platform Capabilities</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
            Four specialized engines inside one luminous white-label workspace.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURE_CARDS.map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.button
                key={card.title}
                type="button"
                onClick={() =>
                  isAuthenticated ? onNavigateDashboard(card.targetSection) : onOpenLogin()
                }
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                whileHover={{ y: -4 }}
                className={`text-left rounded-2xl border border-slate-200/90 bg-white p-7 sm:p-8 transition-all ${card.hoverBorder}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-xs font-mono font-semibold ${card.accentText}`}>
                      {card.metric}
                    </p>
                    <h3 className="mt-1.5 text-xl font-bold text-slate-950">
                      {card.title}
                    </h3>
                  </div>
                  <div className={`rounded-xl p-3 shrink-0 ${card.iconShell}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {card.description}
                </p>
                <p className={`mt-5 inline-flex items-center gap-1.5 text-xs font-semibold ${card.accentText}`}>
                  <span>{isAuthenticated ? "Open live module" : "Sign in to launch module"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </p>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Programmatic Job Pages & Editorial SEO Resources */}
      <section className="mx-auto max-w-7xl 2xl:max-w-[1680px] px-6 pb-20">
        <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-r from-white via-sky-50/35 to-emerald-50/35 p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 shadow-xs">
          <div className="space-y-3">
            <p className="text-xs font-mono font-semibold text-blue-700">Programmatic Job Guides</p>
            <h2 className="text-xl font-bold text-slate-950">
              High-Value AI Data & QA Track Specifications
            </h2>
            <p className="text-sm text-slate-600">
              Explore deterministic acoustic, vision IoU, and prompt rubric guides tailored for freelancers and international agencies.
            </p>
            <div className="pt-2 flex flex-wrap gap-4 text-xs font-semibold text-slate-800">
              <button
                type="button"
                onClick={() => onOpenJobPage?.("tts-audio-qa")}
                className="underline decoration-blue-500 underline-offset-4 hover:text-blue-700 whitespace-nowrap"
              >
                TTS Audio QA (/jobs/tts-audio-qa)
              </button>
              <button
                type="button"
                onClick={() => onOpenJobPage?.("multilingual-prompt-engineering")}
                className="underline decoration-sky-500 underline-offset-4 hover:text-sky-700 whitespace-nowrap"
              >
                Multilingual Prompts (/jobs/multilingual-prompt-engineering)
              </button>
              <button
                type="button"
                onClick={() => onOpenJobPage?.("video-annotation-qa")}
                className="underline decoration-emerald-500 underline-offset-4 hover:text-emerald-700 whitespace-nowrap"
              >
                Video Annotation QA (/jobs/video-annotation-qa)
              </button>
            </div>
          </div>

          <div className="space-y-3 border-t lg:border-t-0 lg:border-l border-slate-200/90 pt-6 lg:pt-0 lg:pl-8">
            <p className="text-xs font-mono font-semibold text-emerald-700">Automated SEO Blog Library</p>
            <h2 className="text-xl font-bold text-slate-950">
              Field Manuals for Qualification & Agency Scale
            </h2>
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() =>
                  onOpenBlogPage?.("how-to-pass-telus-digital-voice-cloning-project")
                }
                className="block text-left text-xs font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-blue-700"
              >
                How to Pass the TELUS Digital Voice Cloning Project →
              </button>
              <button
                type="button"
                onClick={() => onOpenBlogPage?.("top-5-ai-data-annotation-platforms")}
                className="block text-left text-xs font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-blue-700"
              >
                Top 5 AI Data Annotation Platforms & Workplaces →
              </button>
              <div className="pt-1 flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>NDPA 2023 & GDPR Compliant Multi-Tenant Infrastructure</span>
              </div>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {/* Global Footer with strict auth-gated dashboard visibility */}
      <GlobalFooter
        onOpenLegal={(slug) => onOpenLegalPage?.(slug)}
        onOpenPricing={onOpenPricing}
        isAuthenticated={isAuthenticated}
        onGoToDashboard={
          isAuthenticated ? () => onNavigateDashboard("overview") : undefined
        }
        onSignIn={!isAuthenticated ? onOpenLogin : undefined}
      />
    </div>
  );
}
