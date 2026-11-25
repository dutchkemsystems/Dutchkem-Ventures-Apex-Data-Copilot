import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Compass,
  Fingerprint,
  Lock,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import loginBannerUrl from "../assets/images/login_workspace_banner_1794784989268.jpg";

export type UserAuthMode = "signin" | "signup" | "forgot" | "reset";

interface LoginViewProps {
  initialMode?: UserAuthMode;
  initialResetToken?: string;
  onLoginSuccess: (orgId: string, userId: string) => void;
  onReturnHomepage: () => void;
}

const LOGIN_BANNER_URL = loginBannerUrl;

export function LoginView({
  initialMode,
  initialResetToken,
  onLoginSuccess,
  onReturnHomepage,
}: LoginViewProps) {
  const [mode, setMode] = useState<UserAuthMode>(initialMode || "signin");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("hendrik@dutchkemventures.com");
  const [password, setPassword] = useState("ApexPilot2026!");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [resetToken, setResetToken] = useState(initialResetToken || "");
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState(false);
  const [captchaPrompt, setCaptchaPrompt] = useState<{
    challengeToken: string;
    promptQuestion: string;
    anomalyScore?: number;
  } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaClearanceToken, setCaptchaClearanceToken] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [impossibleTravelAlert, setImpossibleTravelAlert] = useState<{
    reauthToken: string;
    distanceKm: number | null;
    elapsedMinutes: number | null;
    previousCity: string;
    attemptedCity: string;
  } | null>(null);

  const verifiedHost =
    typeof window !== "undefined" ? window.location.host : "apex.dutchkemventures.com";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResetSuccessMessage(null);
    try {
      if (mode === "forgot") {
        const res = await fetch("/api/auth/user/forgot-password", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || "Unable to issue password reset link.");
        }
        if (data.resetToken) {
          setResetToken(data.resetToken);
        }
        setResetSuccessMessage(
          data.message || "Password reset token issued. Proceed to Reset Password."
        );
        return;
      }

      if (mode === "reset") {
        const res = await fetch("/api/auth/user/reset-password", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, newPassword: password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || "Unable to reset password.");
        }
        setResetSuccessMessage("Password updated. Sign in below with your new password.");
        setMode("signin");
        setPassword("");
        if (typeof window !== "undefined") {
          window.history.pushState({}, "", "/login");
        }
        return;
      }

      if (mode === "signup") {
        const cookieMatch =
          typeof document !== "undefined"
            ? document.cookie.match(/(?:^|;\s*)apex_ref_id=([^;]+)/)
            : null;
        const referrerId =
          window.localStorage.getItem("apex_ref_id") ||
          (cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined);
        const res = await fetch("/api/auth/user/signup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, orgName, email, password, referrerId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || "Unable to create 14-day trial account.");
        }
        if (data.user && data.organization) {
          localStorage.removeItem("apex_permanently_logged_out");
          localStorage.setItem("apex_org_id", data.organization.id);
          localStorage.setItem("apex_user_id", data.user.id);
          onLoginSuccess(data.organization.id, data.user.id);
        }
        return;
      }

      let activeClearance = captchaClearanceToken;
      if (captchaPrompt && captchaAnswer.trim()) {
        const capRes = await fetch("/api/security/captcha/verify", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeToken: captchaPrompt.challengeToken,
            answer: captchaAnswer.trim(),
          }),
        });
        const capData = await capRes.json().catch(() => ({}));
        if (!capRes.ok || !capData.clearanceToken) {
          throw new Error(capData.detail || "CAPTCHA verification failed.");
        }
        activeClearance = capData.clearanceToken;
        setCaptchaClearanceToken(capData.clearanceToken);
        setCaptchaPrompt(null);
        setCaptchaAnswer("");
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (activeClearance) {
        headers["x-captcha-clearance"] = activeClearance;
      }

      const res = await fetch("/api/auth/user/login", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          email,
          password,
          totpCode: requiresTwoFactor && !useBackupCode ? totpCode : undefined,
          backupCode: requiresTwoFactor && useBackupCode ? backupCode : undefined,
          reauthToken: impossibleTravelAlert?.reauthToken,
          reauthenticateConfirm: Boolean(impossibleTravelAlert),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && data.requiresCaptcha && data.captchaChallenge) {
          setCaptchaPrompt({
            challengeToken: data.captchaChallenge.challengeToken,
            promptQuestion: data.captchaChallenge.promptQuestion,
            anomalyScore: data.anomalyScore,
          });
        }
        if (res.status === 403 && data.requiresReauthentication && data.reauthToken) {
          setImpossibleTravelAlert({
            reauthToken: data.reauthToken,
            distanceKm: data.distanceKm ?? null,
            elapsedMinutes: data.elapsedMinutes ?? null,
            previousCity: data.previousCity || "Previous Location",
            attemptedCity: data.attemptedCity || "Current Location",
          });
        }
        throw new Error(data.detail || "Invalid credentials.");
      }
      if (data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        return;
      }
      if (data.user && data.organization) {
        setImpossibleTravelAlert(null);
        setCaptchaPrompt(null);
        localStorage.removeItem("apex_permanently_logged_out");
        localStorage.setItem("apex_org_id", data.organization.id);
        localStorage.setItem("apex_user_id", data.user.id);
        onLoginSuccess(data.organization.id, data.user.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasskeySignIn() {
    setPasskeyBusy(true);
    setError(null);
    setResetSuccessMessage(null);
    try {
      const optRes = await fetch("/api/auth/user/passkey/login/options", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const optData = await optRes.json().catch(() => ({}));
      if (!optRes.ok || !optData.options || !optData.challengeToken) {
        throw new Error(optData.detail || "Unable to initialize WebAuthn passkey challenge.");
      }

      const assertion = await startAuthentication({ optionsJSON: optData.options });

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (captchaClearanceToken) {
        headers["x-captcha-clearance"] = captchaClearanceToken;
      }

      const verifyRes = await fetch("/api/auth/user/passkey/login/verify", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          challengeToken: optData.challengeToken,
          response: assertion,
          reauthToken: impossibleTravelAlert?.reauthToken,
          reauthenticateConfirm: Boolean(impossibleTravelAlert),
        }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        if (verifyRes.status === 403 && verifyData.requiresReauthentication && verifyData.reauthToken) {
          setImpossibleTravelAlert({
            reauthToken: verifyData.reauthToken,
            distanceKm: verifyData.distanceKm ?? null,
            elapsedMinutes: verifyData.elapsedMinutes ?? null,
            previousCity: verifyData.previousCity || "Previous Location",
            attemptedCity: verifyData.attemptedCity || "Current Location",
          });
        }
        throw new Error(verifyData.detail || "Passkey authentication failed.");
      }

      if (verifyData.user && verifyData.organization) {
        setImpossibleTravelAlert(null);
        localStorage.removeItem("apex_permanently_logged_out");
        localStorage.setItem("apex_org_id", verifyData.organization.id);
        localStorage.setItem("apex_user_id", verifyData.user.id);
        onLoginSuccess(verifyData.organization.id, verifyData.user.id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Passkey prompt was cancelled or no passkey is registered for this domain."
      );
    } finally {
      setPasskeyBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EEF5FF] via-[#FFFFFF] to-[#ECFDF5] text-slate-900 flex items-center justify-center px-6 py-10 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(37,99,235,0.12),transparent_42%),radial-gradient(circle_at_88%_82%,rgba(16,185,129,0.12),transparent_44%),radial-gradient(circle_at_78%_14%,rgba(245,158,11,0.1),transparent_36%)] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-6xl 2xl:max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Inspiring 4K Architectural Showcase */}
        <motion.section
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="hidden lg:flex lg:col-span-6 flex-col justify-between rounded-3xl border border-white/90 bg-white/85 backdrop-blur-xl p-5 shadow-[0_24px_70px_rgba(37,99,235,0.1)]"
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 via-sky-50 to-emerald-100">
            {!bannerError ? (
              <img
                src={LOGIN_BANNER_URL}
                alt="Bright sunlit international engineering studio headquarters"
                referrerPolicy="no-referrer"
                onError={() => setBannerError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 p-8 text-white">
                <p className="text-xl font-bold">Dutchkem Ventures Global AI Studio</p>
              </div>
            )}
          </div>

          <div className="p-4 pt-6 space-y-4">
            <p className="text-xs font-mono font-semibold text-blue-700">
              Dutchkem Ventures · International AI Data Studio
            </p>
            <h2 className="text-2xl 2xl:text-3xl font-bold tracking-tight text-slate-950 text-balance">
              Orchestrate global voice, vision, and LLM evaluation from one luminous console.
            </h2>
            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-200/80 text-xs">
              <div>
                <p className="text-slate-500">Audio Precision</p>
                <p className="mt-1 font-mono font-bold tabular-nums text-blue-700">
                  24kHz · &gt;35 dB
                </p>
              </div>
              <div>
                <p className="text-slate-500">Settlement Rails</p>
                <p className="mt-1 font-mono font-bold tabular-nums text-emerald-700">
                  Kora Pay 80/20
                </p>
              </div>
              <div>
                <p className="text-slate-500">Data Defense</p>
                <p className="mt-1 font-mono font-bold tabular-nums text-amber-700">
                  AES-256 · RLS
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Right Crisp Bright Authentication Card */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-6 w-full max-w-md mx-auto space-y-6"
        >
          <div className="text-center lg:text-left space-y-2">
            <div className="inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 text-white flex items-center justify-center shadow-xs">
                <Compass className="w-4 h-4" />
              </span>
              <span className="text-xs font-mono font-semibold tracking-wider text-blue-700">
                Dutchkem Ventures · Apex Data Copilot
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {mode === "signin"
                ? "Sign in to your agency workspace"
                : mode === "signup"
                  ? "Start your 14-day free trial"
                  : mode === "forgot"
                    ? "Recover workspace password"
                    : "Set a new password"}
            </h1>
            <p className="text-sm text-slate-600">
              {mode === "signin"
                ? "Authenticate with apex_user_session (aud='apex:user') to unlock QA engines and Kora Pay Escrow."
                : mode === "signup"
                  ? "Includes 3 monthly QA tasks with Neon PostgreSQL Row-Level Security."
                  : mode === "forgot"
                    ? "Request a signed 15-minute reset token for your User Plane account."
                    : "Enter your signed reset token and a new strong password."}
            </p>
          </div>

          <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setResetSuccessMessage(null);
                if (typeof window !== "undefined") window.history.pushState({}, "", "/login");
              }}
              className={`flex-1 min-h-[44px] py-2.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                mode === "signin"
                  ? "bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setEmail("");
                setPassword("");
                setRequiresTwoFactor(false);
                setError(null);
                setResetSuccessMessage(null);
                if (typeof window !== "undefined") window.history.pushState({}, "", "/signup");
              }}
              className={`flex-1 min-h-[44px] py-2.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                mode === "signup"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Start 14-Day Trial
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xl p-7 space-y-4 shadow-[0_20px_55px_rgba(37,99,235,0.09)] relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500" />

            {/* Anti-Phishing Origin Verification */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Verified Origin</span>
              </span>
              <span className="font-mono text-slate-500 truncate">{verifiedHost}</span>
            </div>

            {resetSuccessMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 font-medium space-y-1.5">
                <p>{resetSuccessMessage}</p>
                {mode === "forgot" && resetToken && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setPassword("");
                      if (typeof window !== "undefined") {
                        window.history.pushState({}, "", `/reset-password?token=${encodeURIComponent(resetToken)}`);
                      }
                    }}
                    className="underline font-semibold text-emerald-900"
                  >
                    Proceed to /reset-password
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 font-medium">
                {error}
              </div>
            )}

            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="signup-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Full Name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Mercer"
                    className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="signup-org"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Agency / Freelance Studio Name
                  </label>
                  <input
                    id="signup-org"
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Meridian Voice Studio"
                    className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                  />
                </div>
              </>
            )}

            {mode === "reset" ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="reset-token"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Signed Reset Token
                </label>
                <input
                  id="reset-token"
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste signed reset token"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-xs font-mono text-slate-950 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Work Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                />
              </div>
            )}

            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {mode === "reset" ? "New Password" : "Password"}
                  </label>
                  {mode === "signin" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setResetSuccessMessage(null);
                        if (typeof window !== "undefined") {
                          window.history.pushState({}, "", "/forgot-password");
                        }
                      }}
                      className="text-[11px] font-semibold text-blue-700 hover:underline"
                    >
                      Forgot password?
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      8+ chars, letter & number/symbol
                    </span>
                  )}
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                />
              </div>
            )}

            {mode === "signin" && captchaPrompt && (
              <div className="space-y-2 pt-2 border-t border-amber-200">
                <div className="flex items-center justify-between text-xs text-amber-900 font-semibold">
                  <span>Zero-Trust Anomaly Challenge</span>
                  {typeof captchaPrompt.anomalyScore === "number" && (
                    <span className="font-mono tabular-nums">
                      Score {captchaPrompt.anomalyScore}/100
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700">{captchaPrompt.promptQuestion}</p>
                <input
                  id="login-captcha-answer"
                  type="text"
                  required
                  placeholder="Enter CAPTCHA answer"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  className="w-full rounded-lg border border-amber-300 bg-amber-50/50 px-3.5 py-2 text-sm font-mono tabular-nums text-slate-950 focus:border-amber-600 focus:outline-none"
                />
              </div>
            )}

            {mode === "signin" && impossibleTravelAlert && (
              <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 space-y-1.5 text-xs text-red-900">
                <p className="font-semibold">Impossible Travel Detected — Re-Authentication Required</p>
                <p className="text-red-800">
                  {impossibleTravelAlert.previousCity} to {impossibleTravelAlert.attemptedCity}
                  {impossibleTravelAlert.distanceKm !== null
                    ? ` · ${impossibleTravelAlert.distanceKm} km`
                    : ""}
                  {impossibleTravelAlert.elapsedMinutes !== null
                    ? ` in ${impossibleTravelAlert.elapsedMinutes} min`
                    : ""}
                </p>
                <p className="text-[11px] text-red-700">
                  Previous sessions have been revoked. Confirm your password below and submit to verify this login location.
                </p>
              </div>
            )}

            {mode === "signin" && requiresTwoFactor && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={useBackupCode ? "login-backup-code" : "login-totp"}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-700"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {useBackupCode ? "Single-Use Backup Code" : "Authenticator 6-Digit Code"}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode((prev) => !prev);
                      setError(null);
                    }}
                    className="text-[11px] font-semibold text-blue-700 hover:underline"
                  >
                    {useBackupCode ? "Use 6-digit TOTP" : "Use backup code"}
                  </button>
                </div>
                {useBackupCode ? (
                  <input
                    id="login-backup-code"
                    type="text"
                    required
                    placeholder="ABCD-EFGH"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-blue-300 bg-blue-50/40 px-3.5 py-2.5 text-sm font-mono tabular-nums tracking-widest text-slate-950 focus:border-blue-600 focus:outline-none"
                  />
                ) : (
                  <input
                    id="login-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-lg border border-blue-300 bg-blue-50/40 px-3.5 py-2.5 text-sm font-mono tabular-nums tracking-[0.25em] text-slate-950 focus:border-blue-600 focus:outline-none"
                  />
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)] hover:brightness-105 disabled:opacity-60 transition-all whitespace-nowrap"
            >
              {mode === "signup" ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>
                {submitting
                  ? "Processing..."
                  : mode === "signup"
                    ? "Create 14-Day Trial Workspace"
                    : mode === "forgot"
                      ? "Issue Reset Link"
                      : mode === "reset"
                        ? "Update Password"
                        : impossibleTravelAlert
                          ? "Confirm Re-Authentication & Sign In"
                          : captchaPrompt
                            ? "Verify CAPTCHA & Sign In"
                            : requiresTwoFactor
                              ? "Verify 2FA & Sign In"
                              : "Sign In to Workspace"}
              </span>
            </button>

            {mode === "signin" && (
              <button
                type="button"
                disabled={submitting || passkeyBusy}
                onClick={() => void handlePasskeySignIn()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <Fingerprint className="w-4 h-4 text-blue-600" />
                <span>
                  {passkeyBusy
                    ? `Verifying Passkey for ${verifiedHost}...`
                    : "Sign in with Passkey (Phishing-Proof WebAuthn)"}
                </span>
              </button>
            )}

            {mode === "signin" && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>Quick Persona:</span>
                <div className="flex items-center gap-3 font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail("hendrik@dutchkemventures.com");
                      setPassword("ApexPilot2026!");
                      setRequiresTwoFactor(false);
                    }}
                    className="text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap"
                  >
                    Hendrik (Agency)
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail("amina@solsticefreelance.io");
                      setPassword("ApexPilot2026!");
                      setRequiresTwoFactor(false);
                    }}
                    className="text-emerald-700 hover:text-emerald-900 transition-colors whitespace-nowrap"
                  >
                    Amina (14-Day Trial)
                  </button>
                </div>
              </div>
            )}
          </form>

          <div className="text-center lg:text-left">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-700 transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Homepage</span>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
