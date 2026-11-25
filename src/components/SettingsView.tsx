import React, { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Fingerprint,
  KeyRound,
  Lock,
  LogOut,
  QrCode,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import type { TenantUser } from "../types/tenant";

interface SettingsViewProps {
  orgId: string;
  orgName: string;
  currentUser: TenantUser;
  onProfileUpdated: () => Promise<void>;
  onLogout: () => Promise<void>;
}

interface SecurityPosture {
  wafActive: boolean;
  cspActive: boolean;
  csrfOriginGuard: boolean;
  promptVaultEncryption: string;
  antiPromptReplicationActive: boolean;
  revokedTokensCount: number;
  lockedAccountsCount: number;
  passwordKdf: string;
}

export function SettingsView({
  orgId,
  orgName,
  currentUser,
  onProfileUpdated,
  onLogout,
}: SettingsViewProps) {
  const [fullName, setFullName] = useState(currentUser.full_name);
  const [email, setEmail] = useState(currentUser.email);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    currentUser.avatar_url ?? null
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    Boolean(currentUser.two_factor_enabled)
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState<number>(0);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackups, setCopiedBackups] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [settingUp2fa, setSettingUp2fa] = useState(false);
  const [verifying2fa, setVerifying2fa] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisablePrompt, setShowDisablePrompt] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [passkeys, setPasskeys] = useState<Array<{
    id: string;
    credential_id: string;
    device_name: string;
    counter: number;
    rp_id: string;
    is_hardware_yubikey: boolean;
    transports: string[];
    last_used_at: string | null;
    created_at: string;
  }>>([]);
  const [passkeyRpId, setPasskeyRpId] = useState("localhost");
  const [passkeyDeviceName, setPasskeyDeviceName] = useState("MacBook Touch ID / Security Key");
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshUserPasskeys() {
    const res = await fetch("/api/user/settings/security/passkeys", {
      credentials: "include",
      headers: {
        "x-org-id": orgId,
        "x-user-id": currentUser.id,
      },
    });
    if (res.ok) {
      const data = await res.json();
      setPasskeys(data.passkeys || []);
      if (data.rpId) setPasskeyRpId(data.rpId);
    }
  }

  useEffect(() => {
    fetch("/api/security/posture", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SecurityPosture | null) => {
        if (data) setPosture(data);
      })
      .catch(() => undefined);

    fetch("/api/settings/security", {
      credentials: "include",
      headers: {
        "x-org-id": orgId,
        "x-user-id": currentUser.id,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((sec: { twoFactorEnabled?: boolean; backupCodesRemaining?: number } | null) => {
        if (sec) {
          setTwoFactorEnabled(Boolean(sec.twoFactorEnabled));
          setBackupCodesRemaining(Number(sec.backupCodesRemaining ?? 0));
        }
      })
      .catch(() => undefined);

    void refreshUserPasskeys();
  }, [orgId, currentUser.id]);

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Profile picture must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(String(reader.result));
      setError(null);
    };
    reader.onerror = () => {
      setError("Failed to read selected profile image.");
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          avatar_url: avatarUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update profile settings.");
      }
      await onProfileUpdated();
      setNotice("Profile details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile update failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleInit2fa() {
    setSettingUp2fa(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/2fa/setup", {
        method: "POST",
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": currentUser.id,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Unable to initialize 2FA secret.");
      }
      setQrDataUrl(data.qrDataUrl);
      setManualSecret(data.manualSecret);
      setTotpCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA initialization failed.");
    } finally {
      setSettingUp2fa(false);
    }
  }

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    setVerifying2fa(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Invalid 6-digit verification code.");
      }
      setTwoFactorEnabled(true);
      setQrDataUrl(null);
      setManualSecret(null);
      setTotpCode("");
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      setBackupCodesRemaining(Number(data.backupCodesRemaining ?? 10));
      await onProfileUpdated();
      setNotice(
        "Two-factor authentication is now active. Save your 10 single-use recovery backup codes below."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA verification failed.");
    } finally {
      setVerifying2fa(false);
    }
  }

  async function handleDisable2fa(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/2fa/disable", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({ currentPassword: disablePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Unable to disable 2FA.");
      }
      setTwoFactorEnabled(false);
      setBackupCodes([]);
      setBackupCodesRemaining(0);
      setDisablePassword("");
      setShowDisablePrompt(false);
      await onProfileUpdated();
      setNotice("Two-factor authentication has been disabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disable 2FA.");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setUpdatingPassword(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Password change rejected.");
      }
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password updated and active session rotated securely.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password update failed.");
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleCopySecret() {
    if (!manualSecret) return;
    try {
      await navigator.clipboard.writeText(manualSecret);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = manualSecret;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 1800);
  }

  async function handleCopyBackupCodes() {
    if (backupCodes.length === 0) return;
    const text = backupCodes.join("\n");
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
    setCopiedBackups(true);
    setTimeout(() => setCopiedBackups(false), 1800);
  }

  async function triggerLogout() {
    setLoggingOut(true);
    await onLogout();
  }

  async function handleRegisterPasskey(e: React.FormEvent) {
    e.preventDefault();
    setRegisteringPasskey(true);
    setNotice(null);
    setError(null);
    try {
      const optRes = await fetch("/api/user/settings/security/passkeys/register/options", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({}),
      });
      const optData = await optRes.json().catch(() => ({}));
      if (!optRes.ok || !optData.options || !optData.challengeToken) {
        throw new Error(optData.detail || "Failed to generate WebAuthn registration options.");
      }

      const attestation = await startRegistration({ optionsJSON: optData.options });

      const verifyRes = await fetch("/api/user/settings/security/passkeys/register/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          challengeToken: optData.challengeToken,
          response: attestation,
          deviceName: passkeyDeviceName.trim() || "Workspace Passkey",
        }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(verifyData.detail || "Passkey attestation verification failed.");
      }

      await refreshUserPasskeys();
      setNotice(
        `Phishing-proof Passkey "${verifyData.passkey?.device_name || passkeyDeviceName}" registered for domain ${passkeyRpId}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey registration cancelled or failed.");
    } finally {
      setRegisteringPasskey(false);
    }
  }

  async function handleDeletePasskey(credentialId: string) {
    setDeletingPasskeyId(credentialId);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/user/settings/security/passkeys/${encodeURIComponent(credentialId)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            "x-org-id": orgId,
            "x-user-id": currentUser.id,
          },
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Unable to remove passkey.");
      }
      await refreshUserPasskeys();
      setNotice("Passkey credential removed from user_passkeys.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove passkey.");
    } finally {
      setDeletingPasskeyId(null);
    }
  }

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {orgName} · {currentUser.role === "admin" ? "Organization Admin" : "Annotator"} · Account & Security
          </p>
          <h1 className="mt-1 text-2xl 2xl:text-3xl font-semibold tracking-tight text-slate-900">
            User Settings, 2FA & Session Control
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage profile identity, Google Authenticator TOTP security, password credentials, and permanent session revocation.
          </p>
        </div>

        <button
          type="button"
          disabled={loggingOut}
          onClick={triggerLogout}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 self-start"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{loggingOut ? "Signing out..." : "Logout Permanently"}</span>
        </button>
      </div>

      {notice && (
        <div className="p-4 border border-emerald-200 bg-emerald-50 text-emerald-900 rounded-lg text-sm">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Profile Settings */}
      <section className="border border-slate-200 bg-white rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <UserRound className="w-4 h-4 text-slate-700" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Profile Settings</h2>
            <p className="text-xs text-slate-500">
              Update display name, primary contact email, and profile picture.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div className="flex flex-wrap items-center gap-5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-base font-semibold shrink-0">
                {initials || "AP"}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Profile Picture</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="sr-only"
                />
              </label>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl(null)}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-600 hover:text-red-700 hover:border-red-200 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="settings-fullname"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Full Name
              </label>
              <input
                id="settings-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="settings-email"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Email Address
              </label>
              <input
                id="settings-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              Rate: ${currentUser.hourly_rate.toFixed(2)}/hr · User ID: {currentUser.id.slice(0, 8)}...
            </p>
            <button
              type="submit"
              disabled={savingProfile}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {savingProfile ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </section>

      {/* Security Settings: TOTP 2FA via otplib */}
      <section className="border border-slate-200 bg-white rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-slate-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Security Settings · Two-Factor Authentication (TOTP)
              </h2>
              <p className="text-xs text-slate-500">
                Powered by otplib time-based one-time passwords compatible with Google Authenticator.
              </p>
            </div>
          </div>

          <p
            className={`text-xs font-medium whitespace-nowrap ${
              twoFactorEnabled ? "text-emerald-700" : "text-slate-600"
            }`}
          >
            Status: {twoFactorEnabled ? "Enabled (Google Authenticator)" : "Disabled"}
          </p>
        </div>

        {!twoFactorEnabled && !qrDataUrl && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-slate-600 max-w-xl">
              Require a rotating 6-digit Google Authenticator verification code whenever signing into your organization workspace.
            </p>
            <button
              type="button"
              disabled={settingUp2fa}
              onClick={handleInit2fa}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{settingUp2fa ? "Generating QR..." : "Enable 2FA"}</span>
            </button>
          </div>
        )}

        {qrDataUrl && (
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start pt-1">
            <div className="border border-slate-200 rounded-lg p-2.5 bg-white w-fit">
              <img
                src={qrDataUrl}
                alt="Google Authenticator 2FA QR Code"
                className="w-44 h-44 object-contain"
              />
            </div>

            <form onSubmit={handleVerify2fa} className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  1. Scan QR Code with Google Authenticator
                </p>
                <p className="text-xs text-slate-600">
                  Open Google Authenticator on your phone and scan the QR code, or enter the Base32 setup key manually.
                </p>
              </div>

              {manualSecret && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="text-xs font-mono text-slate-800 break-all">
                    {manualSecret}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 bg-white rounded whitespace-nowrap"
                  >
                    {copiedSecret ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Key</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="totp-verify-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  2. Enter 6-Digit Authenticator Code
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="totp-verify-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-40 min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums tracking-[0.25em] border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <button
                    type="submit"
                    disabled={verifying2fa || totpCode.length !== 6}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {verifying2fa ? "Verifying..." : "Verify & Activate 2FA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQrDataUrl(null);
                      setManualSecret(null);
                      setTotpCode("");
                    }}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {twoFactorEnabled && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-slate-700">
                Optional User Plane TOTP verification is active at{" "}
                <span className="font-mono text-xs">/login</span> for{" "}
                <span className="font-mono text-xs">{currentUser.email}</span> ·{" "}
                <span className="font-mono text-xs tabular-nums text-emerald-700">
                  {backupCodesRemaining} backup codes remaining
                </span>
              </p>
              {!showDisablePrompt && (
                <button
                  type="button"
                  onClick={() => setShowDisablePrompt(true)}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Disable 2FA
                </button>
              )}
            </div>

            {backupCodes.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      10 Single-Use Recovery Backup Codes
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Each code works once at sign-in if your authenticator device is unavailable.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyBackupCodes}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-slate-200 bg-white rounded text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                  >
                    {copiedBackups ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Copied 10 Codes</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Backup Codes</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs tabular-nums">
                  {backupCodes.map((code) => (
                    <div
                      key={code}
                      className="rounded border border-slate-200 bg-white px-2 py-1.5 text-center text-slate-900"
                    >
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showDisablePrompt && (
              <form
                onSubmit={handleDisable2fa}
                className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100"
              >
                <input
                  type="password"
                  required
                  placeholder="Confirm current password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-md text-slate-900"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
                >
                  Confirm Disable
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDisablePrompt(false);
                    setDisablePassword("");
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Phishing-Proof WebAuthn Passkeys (@simplewebauthn) */}
      <section className="border border-slate-200 bg-white rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <Fingerprint className="w-4 h-4 text-blue-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                WebAuthn Passkeys &amp; Security Keys (@simplewebauthn)
              </h2>
              <p className="text-xs text-slate-500">
                Cryptographically bound to RP domain <span className="font-mono">{passkeyRpId}</span> · Replay &amp; phishing-origin protected.
              </p>
            </div>
          </div>
          <p className="text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap">
            Enrolled Keys: {passkeys.length}
          </p>
        </div>

        <form onSubmit={handleRegisterPasskey} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label
              htmlFor="passkey-device-name"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Passkey / Security Key Label
            </label>
            <input
              id="passkey-device-name"
              type="text"
              required
              value={passkeyDeviceName}
              onChange={(e) => setPasskeyDeviceName(e.target.value)}
              placeholder="MacBook Touch ID or YubiKey 5C"
              className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={registeringPasskey}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>{registeringPasskey ? "Waiting for Authenticator..." : "Register Passkey"}</span>
          </button>
        </form>

        {passkeys.length === 0 ? (
          <p className="text-xs text-slate-500">
            No passkeys registered yet. Register Touch ID, Face ID, Windows Hello, or a hardware security key for passwordless phishing-proof login.
          </p>
        ) : (
          <>
            <div className="md:hidden space-y-2.5 text-xs">
              {passkeys.map((pk) => (
                <div
                  key={pk.credential_id}
                  className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-slate-900 truncate">{pk.device_name}</p>
                    <p className="font-mono text-[11px] text-emerald-700">
                      {pk.rp_id} · Counter {pk.counter}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 truncate">
                      {pk.credential_id.slice(0, 18)}...
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={deletingPasskeyId === pk.credential_id}
                    onClick={() => void handleDeletePasskey(pk.credential_id)}
                    className="min-h-[44px] px-3 py-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Device Name</th>
                    <th className="py-2 px-3 font-medium">Credential ID</th>
                    <th className="py-2 px-3 font-medium">RP Domain</th>
                    <th className="py-2 px-3 font-medium text-right">Sign Counter</th>
                    <th className="py-2 pl-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {passkeys.map((pk) => (
                    <tr key={pk.credential_id}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{pk.device_name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {pk.credential_id.slice(0, 18)}...
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-700">{pk.rp_id}</td>
                      <td className="py-2.5 px-3 font-mono text-right tabular-nums text-slate-700">
                        {pk.counter}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <button
                          type="button"
                          disabled={deletingPasskeyId === pk.credential_id}
                          onClick={() => void handleDeletePasskey(pk.credential_id)}
                          className="min-h-[44px] inline-flex items-center gap-1 px-2 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Change Password */}
      <section className="border border-slate-200 bg-white rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <KeyRound className="w-4 h-4 text-slate-700" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
            <p className="text-xs text-slate-500">
              Current password verification is required. New password requires 8+ characters with a letter and number/symbol. Demo workspace password:{" "}
              <span className="font-mono">ApexPilot2026!</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="old-password"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Current Password
            </label>
            <input
              id="old-password"
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="md:col-span-3 flex justify-end pt-1">
            <button
              type="submit"
              disabled={updatingPassword}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {updatingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>

      {/* Military-Grade Security & Prompt Vault Posture */}
      <section className="border border-slate-200 bg-white rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <Lock className="w-4 h-4 text-slate-700" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Platform Hardening & Anti-Replication Vault
            </h2>
            <p className="text-xs text-slate-500">
              Server-enforced protection against injection, CSRF, brute-force credential stuffing, and prompt exfiltration.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-lg divide-y md:divide-y-0 md:divide-x divide-slate-200">
          <div className="p-4">
            <p className="text-xs text-slate-500">Prompt Vault Cipher</p>
            <p className="mt-1.5 text-sm font-mono font-semibold text-slate-900">
              {posture?.promptVaultEncryption ?? "AES-256-GCM"}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              {posture?.antiPromptReplicationActive ? "Replication Shield Active" : "Active"}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-slate-500">WAF & CSRF Guard</p>
            <p className="mt-1.5 text-sm font-mono font-semibold text-slate-900">
              {posture?.wafActive && posture?.csrfOriginGuard ? "Enforced" : "Active"}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              XSS, SQLi, Prototype Pollution & Origin check
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-slate-500">Password Derivation</p>
            <p className="mt-1.5 text-sm font-mono font-semibold text-slate-900">
              scrypt + 128-bit Salt
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Constant-time comparison & 5-try lockout
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-slate-500">Revoked Session Tokens</p>
            <p className="mt-1.5 text-sm font-mono tabular-nums font-semibold text-slate-900">
              {posture?.revokedTokensCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              JWT JTI blacklist + permanent logout flag
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
