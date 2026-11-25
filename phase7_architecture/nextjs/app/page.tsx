"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, AudioWaveform, Bot, Eye, Sparkles } from "lucide-react";
import { NeuralGridCanvas } from "@/components/NeuralGridCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  {
    title: "Auto-Bidder AI",
    metric: "Upwork · Mercor · TELUS Digital",
    description:
      "Continuously scrapes high-ticket annotation contracts, extracts acoustic and rubric constraints, and dispatches tailored agency proposals automatically.",
    icon: Bot,
  },
  {
    title: "Audio QA (librosa)",
    metric: "Mono · 24kHz · > 35 dB SNR",
    description:
      "Enforces container compliance, -6 to -3 dBFS peak bounds, < -70 dBFS noise floor, and Whisper WER checks before any escrow funds leave the platform.",
    icon: AudioWaveform,
  },
  {
    title: "Synthetic Data Factory",
    metric: "10,000+ Multilingual Utterances",
    description:
      "Produces multi-accent speech corpora via ElevenLabs, Coqui XTTS, and Gemini TTS alongside automated Red-Team prompt vulnerability audits.",
    icon: Sparkles,
  },
  {
    title: "Vision Annotation (YOLO)",
    metric: "IoU >= 0.70 Threshold Gate",
    description:
      "Cross-checks annotator bounding boxes against YOLOv8 detections in real time and flags geometry drift or label mismatches before client delivery.",
    icon: Eye,
  },
];

export default function HomePage() {
  const visionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: visionRef,
    offset: ["start end", "end start"],
  });
  const parallaxY = useTransform(scrollYProgress, [0, 1], [36, -36]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] selection:bg-amber-300/40">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Dutchkem Ventures
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-600">
            <a href="#vision" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Vision
            </a>
            <a href="#features" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <Link href="/pricing" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Pricing
            </Link>
            <Link href="/dashboard" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Go to Dashboard
            </Link>
          </nav>

          <div className="shrink-0">
            <Link href="/pricing">
              <Button variant="gold" size="sm">
                Start Your Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with Light 4K R3F Neural Lattice */}
      <section className="relative overflow-hidden border-b border-slate-200 min-h-[680px] flex items-center bg-[#F8FAFC]">
        <NeuralGridCanvas />
        <div className="absolute inset-0 bg-gradient-to-r from-[#F8FAFC] via-[#F8FAFC]/88 to-[#F8FAFC]/20 pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl space-y-6"
          >
            <p className="text-xs font-mono tracking-wider text-amber-700">
              Apex Data Copilot · Multi-Tenant AI Workforce Architecture
            </p>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-slate-900 leading-[1.08] text-balance">
              The Ultimate AI Data Copilot. Scale Your Agency. Automate Your QA.
            </h1>

            <p className="max-w-2xl text-base sm:text-lg text-slate-600 leading-relaxed">
              Generate synthetic data, verify audio SNR, and win contracts automatically. Powered by Dutchkem Ventures.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Link href="/pricing">
                  <Button variant="gold" size="lg" className="gap-2">
                    <span>Start Your Free Trial</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </motion.div>

              <Link href="/dashboard">
                <Button variant="outline" size="lg" className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50">
                  Go to Dashboard
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Vision & Mission Section with Parallax Glassmorphism Cards */}
      <section id="vision" ref={visionRef} className="mx-auto max-w-7xl px-6 py-24">
        <motion.div style={{ y: parallaxY }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-amber-300/70 bg-white/85 backdrop-blur-xl p-8 space-y-4">
            <p className="text-xs font-mono text-amber-700">01. Our Vision</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Zero-defect AI training supply chains run by autonomous agencies.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              We envision a market where boutique annotation studios and specialized AI labs operate at institutional speed—backing every contract bid, synthetic voice corpus, and human recording with deterministic QA verification.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/85 backdrop-blur-xl p-8 space-y-4">
            <p className="text-xs font-mono text-sky-700">02. Our Mission</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Unify contract acquisition, automated DSP/IoU verification, and instant 80/20 escrow.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Dutchkem Ventures eliminates manual QA bottlenecks by pairing PostgreSQL Row-Level Security multi-tenancy with automated Audio, Vision, Text, Red-Teaming, and Kora Pay payout engines.
            </p>
          </div>
        </motion.div>
      </section>

      {/* 4 Animated Feature Cards */}
      <section id="features" className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-mono text-amber-700">Core Automation Engines</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Built for agencies winning high-ticket AI data contracts.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: idx * 0.08 }}
                whileHover={{ y: -4 }}
              >
                <Card className="h-full border-slate-200 bg-white transition-all hover:border-amber-400 hover:shadow-[0_12px_36px_rgba(245,158,11,0.16)]">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono text-amber-700">{feature.metric}</p>
                      <CardTitle className="mt-1.5 text-slate-900">{feature.title}</CardTitle>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-700">
                      <Icon className="h-5 w-5" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="leading-relaxed text-slate-600">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500">
          <p className="font-medium text-slate-900">
            Dutchkem Ventures · Apex Data Copilot
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-slate-900 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-900 transition-colors">
              Terms
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="bg-[#0F172A] text-white border-[#0F172A]">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
