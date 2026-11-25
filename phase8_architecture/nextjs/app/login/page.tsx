"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("hendrik@dutchkemventures.com");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          totpCode: requiresTwoFactor ? totpCode : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Authentication failed.");
      }
      if (body.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        return;
      }
      window.location.href = "/settings";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050914] text-slate-100 flex flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="space-y-2 text-center">
          <p className="text-xs font-mono tracking-wider text-amber-400">
            Dutchkem Ventures · Apex Data Copilot
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Sign in to your workspace
          </h1>
          <p className="text-sm text-slate-400">
            Multi-tenant AI data annotation, QA, and escrow console.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-white/10 bg-slate-900/75 backdrop-blur-xl p-7 space-y-5"
        >
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-xs font-medium text-slate-300">
              Work Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {requiresTwoFactor && (
            <div className="space-y-1.5 pt-1 border-t border-white/10">
              <label
                htmlFor="login-totp"
                className="flex items-center gap-1.5 text-xs font-medium text-amber-300"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Google Authenticator 6-Digit Code</span>
              </label>
              <input
                id="login-totp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-md border border-amber-400/50 bg-slate-950/90 px-3.5 py-2.5 text-sm font-mono tracking-[0.25em] text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-105 disabled:opacity-60 transition-all whitespace-nowrap"
          >
            <Lock className="w-4 h-4" />
            <span>{submitting ? "Verifying..." : requiresTwoFactor ? "Verify & Sign In" : "Sign In"}</span>
          </button>
        </form>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Homepage</span>
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
