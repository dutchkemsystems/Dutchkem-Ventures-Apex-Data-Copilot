"use client";

import React, { useEffect, useState } from "react";
import { useUserPlane } from "../providers";

export default function UserSecuritySettingsPage() {
  const session = useUserPlane();
  const [enabled, setEnabled] = useState(false);
  const [backupRemaining, setBackupRemaining] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/settings/security", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setEnabled(Boolean(data.twoFactorEnabled));
          setBackupRemaining(Number(data.backupCodesRemaining || 0));
        }
      })
      .catch(() => {});
  }, []);

  async function handleStartSetup() {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/user/settings/security/2fa/setup", {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || "Unable to generate TOTP setup QR code.");
      return;
    }
    setQrDataUrl(data.qrDataUrl);
    setManualSecret(data.manualSecret);
    setBackupCodes([]);
  }

  async function handleVerifySetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/user/settings/security/2fa/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || "Invalid 6-digit authenticator code.");
      return;
    }
    setEnabled(true);
    setQrDataUrl(null);
    setManualSecret(null);
    setCode("");
    setBackupCodes(data.backupCodes || []);
    setBackupRemaining(Number(data.backupCodesRemaining || 10));
    setNotice("Optional User 2FA enabled. Save your 10 single-use backup codes.");
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/user/settings/security/2fa/disable", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: disablePassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || "Failed to disable 2FA.");
      return;
    }
    setEnabled(false);
    setBackupCodes([]);
    setBackupRemaining(0);
    setDisablePassword("");
    setNotice("Two-factor authentication disabled for your User Plane account.");
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-mono text-slate-500">
          /dashboard/settings/security · Plane: {session.plane}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">
          Account Security &amp; Optional TOTP 2FA
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Protect your freelancer or agency workspace with time-based one-time passwords (TOTP) and backup codes.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Two-Factor Authentication (Optional for User Plane)
            </h2>
            <p className="text-xs text-slate-500">
              {enabled
                ? `Active · ${backupRemaining} single-use backup codes remaining`
                : "Not enrolled · Enable TOTP to require a 6-digit code at /login"}
            </p>
          </div>
          {!enabled && !qrDataUrl && (
            <button
              type="button"
              onClick={handleStartSetup}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Enable Optional 2FA
            </button>
          )}
        </div>

        {qrDataUrl && (
          <form onSubmit={handleVerifySetup} className="grid grid-cols-1 md:grid-cols-[192px_1fr] gap-6 pt-2">
            <img
              src={qrDataUrl}
              alt="User TOTP QR Code"
              className="w-48 h-48 border border-slate-200 rounded-lg p-2 bg-white"
            />
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Scan the QR code in your authenticator app or enter key{" "}
                <span className="font-mono text-slate-900">{manualSecret}</span>.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-36 px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white"
                >
                  Verify &amp; Activate
                </button>
              </div>
            </div>
          </form>
        )}

        {backupCodes.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-900">
              10 Single-Use Recovery Backup Codes
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs tabular-nums">
              {backupCodes.map((c) => (
                <div key={c} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-center">
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}

        {enabled && (
          <form onSubmit={handleDisable} className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <input
              type="password"
              required
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Current password to disable"
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-md"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              Disable 2FA
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
