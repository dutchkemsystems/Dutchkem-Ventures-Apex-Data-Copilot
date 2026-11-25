import React, { useEffect, useState } from "react";
import { Check, Copy, Fingerprint, KeyRound, Lock, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";

type AdminAuthStep = "login" | "2fa" | "enroll-2fa" | "accept-invite";

interface InvitePreview {
  valid: boolean;
  inviteId: string;
  email: string;
  role: "super_admin" | "finance" | "dpo";
  deferTotpEnrollment?: boolean;
  expiresAt: string;
  qrDataUrl: string;
  manualSecret: string;
}

interface EnrollmentPayload {
  qrDataUrl: string;
  manualSecret: string;
  otpauthUri: string;
  backupCodes: string[];
  backupCodesCount: number;
  kekId?: string;
  kekScope?: string;
}

function readStoredEnrollment(): EnrollmentPayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("apex_admin_2fa_enrollment");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EnrollmentPayload;
  } catch {
    return null;
  }
}

export function AdminAuthView({
  initialStep,
  inviteToken,
  onAuthenticated,
}: {
  initialStep?: AdminAuthStep;
  inviteToken?: string;
  onAuthenticated: () => void;
}) {
  const [enrollment, setEnrollment] = useState<EnrollmentPayload | null>(() => readStoredEnrollment());
  const [step, setStep] = useState<AdminAuthStep>(() => {
    if (inviteToken) return "accept-invite";
    if (initialStep === "2fa" && readStoredEnrollment()) return "enroll-2fa";
    return initialStep || "login";
  });
  const [email, setEmail] = useState("superadmin@dutchkemventures.com");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupMode, setUseBackupMode] = useState(false);
  const [savedBackupAck, setSavedBackupAck] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string>(() =>
    typeof window !== "undefined"
      ? sessionStorage.getItem("apex_admin_2fa_challenge") || ""
      : ""
  );

  // Invite acceptance state
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [inviteFullName, setInviteFullName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteTotp, setInviteTotp] = useState("");
  const [inviteAccepted, setInviteAccepted] = useState(false);
  const [inviteBackupCodes, setInviteBackupCodes] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [yubikeyBusy, setYubikeyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "accept-invite" || !inviteToken) return;
    fetch(`/admin/api/auth/invite-preview?token=${encodeURIComponent(inviteToken)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || "Invalid or expired admin invite token.");
        }
        setInvitePreview(data as InvitePreview);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load invite.");
      });
  }, [step, inviteToken]);

  async function handleAdminPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Admin authentication failed.");
      }
      if (data.requiresTotpEnrollment && data.challengeToken && data.enrollment) {
        sessionStorage.setItem("apex_admin_2fa_challenge", data.challengeToken);
        sessionStorage.setItem("apex_admin_2fa_enrollment", JSON.stringify(data.enrollment));
        setChallengeToken(data.challengeToken);
        setEnrollment(data.enrollment as EnrollmentPayload);
        setSavedBackupAck(false);
        setTotpCode("");
        setStep("enroll-2fa");
        window.history.pushState({}, "", "/admin/2fa");
      } else if (data.requiresTotp && data.challengeToken) {
        sessionStorage.removeItem("apex_admin_2fa_enrollment");
        sessionStorage.setItem("apex_admin_2fa_challenge", data.challengeToken);
        setChallengeToken(data.challengeToken);
        setEnrollment(null);
        setUseBackupMode(false);
        setTotpCode("");
        setBackupCode("");
        setStep("2fa");
        window.history.pushState({}, "", "/admin/2fa");
      } else if (data.authenticated) {
        onAuthenticated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdminYubikeyLogin() {
    setYubikeyBusy(true);
    setError(null);
    try {
      const optRes = await fetch("/admin/api/auth/passkey/login/options", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const optData = await optRes.json().catch(() => ({}));
      if (!optRes.ok || !optData.options || !optData.challengeToken) {
        throw new Error(optData.detail || "Unable to start Admin YubiKey challenge.");
      }

      const assertion = await startAuthentication({ optionsJSON: optData.options });

      const verifyRes = await fetch("/admin/api/auth/passkey/login/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken: optData.challengeToken,
          response: assertion,
        }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(verifyData.detail || "Admin YubiKey verification failed.");
      }
      if (verifyData.authenticated) {
        sessionStorage.removeItem("apex_admin_2fa_challenge");
        sessionStorage.removeItem("apex_admin_2fa_enrollment");
        window.history.pushState({}, "", "/admin");
        onAuthenticated();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "YubiKey prompt was cancelled or no hardware passkey is enrolled for this admin."
      );
    } finally {
      setYubikeyBusy(false);
    }
  }

  async function handleAdmin2faSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/auth/2fa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useBackupMode ? { challengeToken, backupCode } : { challengeToken, totpCode }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "2FA verification failed.");
      }
      sessionStorage.removeItem("apex_admin_2fa_challenge");
      sessionStorage.removeItem("apex_admin_2fa_enrollment");
      window.history.pushState({}, "", "/admin");
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid TOTP or backup code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdminEnrollConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/auth/2fa/enroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Mandatory TOTP enrollment verification failed.");
      }
      sessionStorage.removeItem("apex_admin_2fa_challenge");
      sessionStorage.removeItem("apex_admin_2fa_enrollment");
      setEnrollment(null);
      window.history.pushState({}, "", "/admin");
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete 2FA enrollment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyBackupCodes(codes: string[]) {
    const text = codes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 1800);
  }

  async function handleAcceptInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/admin/api/auth/accept-invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: inviteToken,
          fullName: inviteFullName,
          password: invitePassword,
          totpCode: invitePreview?.deferTotpEnrollment ? undefined : inviteTotp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Could not accept admin invite.");
      }
      setInviteAccepted(true);
      setInviteBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      setEmail(invitePreview?.email || "");
      setStep("login");
      window.history.pushState({}, "", "/admin/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete invite onboarding.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-security-plane="admin"
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Admin Control Plane · aud: apex:admin</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {step === "login"
              ? "Platform Admin Sign In"
              : step === "enroll-2fa"
                ? "Mandatory First-Login 2FA Enrollment"
                : step === "2fa"
                  ? "Mandatory Admin 2FA (TOTP)"
                  : "Accept Signed Admin Invite"}
          </h1>
          <p className="text-xs text-slate-400">
            {step === "login"
              ? "Isolated session cookie (apex_admin_session, SameSite=Strict, Path=/admin). Self-registration is disabled."
              : step === "enroll-2fa"
                ? "Scan the otplib QR code, record your 10 single-use backup codes, and verify your first 6-digit code. Secret sealed via KEK_ADMIN."
                : step === "2fa"
                  ? "Enter the 6-digit TOTP authenticator code or a single-use backup code to mint your role-scoped admin session."
                  : "Set a strong staff password and bind your TOTP hardware/app authenticator."}
          </p>
        </div>

        {inviteAccepted && (
          <div className="rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-xs text-emerald-200 space-y-2">
            <p>
              Admin account provisioned. Sign in below using your password and mandatory TOTP verification.
            </p>
            {inviteBackupCodes.length > 0 && (
              <div className="pt-2 border-t border-emerald-800/60 space-y-1.5">
                <p className="font-semibold text-white">10 Backup Codes Generated:</p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] tabular-nums">
                  {inviteBackupCodes.map((code) => (
                    <div key={code} className="rounded bg-slate-950/80 px-2 py-1 text-center">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-xs text-red-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {step === "login" && (
          <form
            onSubmit={handleAdminPasswordLogin}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7 space-y-4 shadow-xl"
          >
            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-300">
                Staff Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-300">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || yubikeyBusy}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>{submitting ? "Verifying Credentials..." : "Continue to Mandatory 2FA"}</span>
            </button>

            <button
              type="button"
              disabled={submitting || yubikeyBusy}
              onClick={() => void handleAdminYubikeyLogin()}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/80 bg-slate-950 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-emerald-300 disabled:opacity-60 transition-colors"
            >
              <Fingerprint className="w-4 h-4" />
              <span>
                {yubikeyBusy
                  ? "Touch Your YubiKey Hardware Key..."
                  : "Sign in with YubiKey / Hardware Passkey (FIDO2)"}
              </span>
            </button>

            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>Invite-only roles: super_admin · finance · dpo</span>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEmail("ops-onboarding@dutchkemventures.com")}
                  className="min-h-[44px] inline-flex items-center text-emerald-400 hover:text-emerald-300 underline"
                >
                  Test First-Login Enrollment
                </button>
                <a href="/" className="min-h-[44px] inline-flex items-center text-slate-300 hover:text-white underline">
                  Public Site
                </a>
              </div>
            </div>
          </form>
        )}

        {step === "enroll-2fa" && enrollment && (
          <form
            onSubmit={handleAdminEnrollConfirm}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-7 space-y-5 shadow-xl"
          >
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={enrollment.qrDataUrl}
                  alt="Mandatory Admin TOTP QR Code"
                  className="w-36 h-36 rounded-lg bg-white p-1.5 shrink-0"
                />
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-white">1. Scan TOTP QR Code</p>
                  <p className="text-slate-400">
                    Bind your authenticator app. Secret encrypted at rest with{" "}
                    <span className="font-mono text-emerald-400">
                      KEK_ADMIN ({enrollment.kekId || "kms-kek-admin-v1"})
                    </span>
                    .
                  </p>
                  <div className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 break-all">
                    {enrollment.manualSecret}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">
                    2. Save Your 10 Single-Use Backup Codes
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopyBackupCodes(enrollment.backupCodes)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                  >
                    {copiedBackup ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy All 10</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 font-mono text-xs tabular-nums">
                  {enrollment.backupCodes.map((code) => (
                    <div
                      key={code}
                      className="rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-center text-slate-100"
                    >
                      {code}
                    </div>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 pt-1">
                  <input
                    type="checkbox"
                    checked={savedBackupAck}
                    onChange={(e) => setSavedBackupAck(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <span>I have stored all 10 single-use recovery backup codes safely.</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-enroll-totp" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <KeyRound className="w-3.5 h-3.5" />
                <span>3. Enter First 6-Digit Authenticator Code</span>
              </label>
              <input
                id="admin-enroll-totp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-center font-mono text-lg tracking-[0.35em] text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !savedBackupAck || totpCode.length !== 6}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            >
              {submitting ? "Enrolling & Sealing w/ KEK_ADMIN..." : "Complete Mandatory 2FA Enrollment"}
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem("apex_admin_2fa_enrollment");
                sessionStorage.removeItem("apex_admin_2fa_challenge");
                setEnrollment(null);
                setStep("login");
                window.history.pushState({}, "", "/admin/login");
              }}
              className="w-full text-xs text-slate-400 hover:text-white"
            >
              Cancel &amp; return to /admin/login
            </button>
          </form>
        )}

        {step === "2fa" && (
          <form
            onSubmit={handleAdmin2faSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-300 inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                <span>{useBackupMode ? "Single-Use Backup Code" : "6-Digit Authenticator Code"}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setUseBackupMode((prev) => !prev);
                  setError(null);
                }}
                className="min-h-[44px] inline-flex items-center text-xs text-emerald-400 hover:underline"
              >
                {useBackupMode ? "Use 6-digit TOTP instead" : "Use backup code instead"}
              </button>
            </div>

            {useBackupMode ? (
              <input
                id="admin-backup-code"
                type="text"
                required
                placeholder="ABCD-EFGH"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                className="w-full min-h-[48px] rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-center font-mono text-lg tracking-widest text-white focus:border-emerald-500 focus:outline-none"
              />
            ) : (
              <input
                id="admin-totp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full min-h-[48px] rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-center font-mono text-lg tracking-[0.35em] text-white focus:border-emerald-500 focus:outline-none"
              />
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 transition-colors"
            >
              {submitting ? "Verifying 2FA..." : "Verify 2FA & Issue Admin Session"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("login");
                window.history.pushState({}, "", "/admin/login");
              }}
              className="w-full min-h-[44px] text-xs text-slate-400 hover:text-white"
            >
              Back to /admin/login
            </button>
          </form>
        )}

        {step === "accept-invite" && (
          <form
            onSubmit={handleAcceptInvite}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-7 space-y-4 shadow-xl"
          >
            {invitePreview && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Invited Email:</span>
                  <span className="font-mono text-white">{invitePreview.email}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Assigned Role:</span>
                  <span className="font-mono text-emerald-400">{invitePreview.role}</span>
                </div>
                {!invitePreview.deferTotpEnrollment && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <img
                      src={invitePreview.qrDataUrl}
                      alt="Admin TOTP QR Code"
                      className="w-40 h-40 rounded-lg bg-white p-1.5"
                    />
                    <span className="text-[11px] font-mono text-slate-400">
                      Manual Key: {invitePreview.manualSecret}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">Full Name</label>
              <input
                type="text"
                required
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="Jordan Vance"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">Staff Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Min 8 chars + number/symbol"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            {!invitePreview?.deferTotpEnrollment && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-emerald-300">
                  Confirm 6-Digit Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={inviteTotp}
                  onChange={(e) => setInviteTotp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-center font-mono text-base tracking-[0.3em] text-white"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !invitePreview}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              <UserCheck className="w-4 h-4" />
              <span>{submitting ? "Activating Admin..." : "Activate Admin Account"}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default AdminAuthView;
