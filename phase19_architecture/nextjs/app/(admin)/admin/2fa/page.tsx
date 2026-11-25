"use client";

import React, { useEffect, useState } from "react";

interface EnrollmentData {
  qrDataUrl: string;
  manualSecret: string;
  backupCodes: string[];
  kekId?: string;
}

export default function AdminTwoFactorPage() {
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [savedBackupAck, setSavedBackupAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("apex_admin_2fa_enrollment");
    if (raw) {
      try {
        setEnrollment(JSON.parse(raw) as EnrollmentData);
      } catch {
        setEnrollment(null);
      }
    }
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const challengeToken = sessionStorage.getItem("apex_admin_2fa_challenge") || "";
      const endpoint = enrollment ? "/admin/api/auth/2fa/enroll" : "/admin/api/auth/2fa";
      const payload = enrollment
        ? { challengeToken, totpCode }
        : useBackup
          ? { challengeToken, backupCode }
          : { challengeToken, totpCode };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "Invalid TOTP verification code.");
        return;
      }
      sessionStorage.removeItem("apex_admin_2fa_challenge");
      sessionStorage.removeItem("apex_admin_2fa_enrollment");
      window.location.href = "/admin";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <form
        onSubmit={handleVerify}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5"
      >
        <div>
          <p className="text-xs font-mono text-emerald-400">
            {enrollment
              ? "Step 2 · Mandatory First-Login TOTP Enrollment (KEK_ADMIN)"
              : "Step 2 · Mandatory TOTP"}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            {enrollment ? "Enroll Admin Authenticator" : "Admin 2FA Verification"}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {enrollment
              ? "Scan the QR code with your authenticator app, store your 10 single-use backup codes, and verify your first 6-digit code."
              : "Enter your 6-digit authenticator code or single-use backup code to mint apex_admin_session (Path=/admin)."}
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg p-3">
            {error}
          </p>
        )}

        {enrollment && (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <img
                src={enrollment.qrDataUrl}
                alt="Mandatory Admin TOTP QR Code"
                className="w-36 h-36 rounded-lg bg-white p-1.5 shrink-0"
              />
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-white">Manual Setup Key</p>
                <p className="font-mono text-emerald-400 break-all">{enrollment.manualSecret}</p>
                <p className="text-slate-400">
                  Secret sealed with KEK_ADMIN ({enrollment.kekId || "kms-kek-admin-v1"}).
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <p className="text-xs font-semibold text-slate-200">
                10 Single-Use Recovery Backup Codes
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-xs tabular-nums">
                {enrollment.backupCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-slate-200 text-center"
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
                />
                <span>I have securely stored these 10 admin backup codes.</span>
              </label>
            </div>
          </div>
        )}

        {!enrollment && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setUseBackup((prev) => !prev);
                setError(null);
              }}
              className="text-xs text-emerald-400 hover:underline"
            >
              {useBackup ? "Use 6-digit authenticator code" : "Use a single-use backup code"}
            </button>
          </div>
        )}

        {useBackup && !enrollment ? (
          <input
            type="text"
            required
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-center font-mono text-lg tracking-widest text-white"
          />
        ) : (
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            required
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-white"
          />
        )}

        <button
          type="submit"
          disabled={submitting || (Boolean(enrollment) && !savedBackupAck)}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white"
        >
          {enrollment
            ? "Complete Mandatory 2FA Enrollment & Enter Admin Console"
            : "Verify 2FA & Enter Admin Console"}
        </button>
      </form>
    </div>
  );
}
