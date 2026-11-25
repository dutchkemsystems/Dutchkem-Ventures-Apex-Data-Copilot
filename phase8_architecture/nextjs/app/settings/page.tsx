"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, LogOut, QrCode, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

export default function SettingsPage() {
  const [fullName, setFullName] = useState("Hendrik van der Berg");
  const [email, setEmail] = useState("hendrik@dutchkemventures.com");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, avatar_url: avatarUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMessage(data.detail || "Failed to update profile.");
      return;
    }
    setStatusMessage("Profile settings updated.");
  }

  async function handleSetupTwoFactor() {
    setErrorMessage(null);
    const res = await fetch("/api/settings/2fa/setup", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setErrorMessage(data.detail || "Unable to initialize 2FA.");
      return;
    }
    setQrDataUrl(data.qrDataUrl);
    setManualSecret(data.manualSecret);
  }

  async function handleVerifyTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    const res = await fetch("/api/settings/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMessage(data.detail || "Invalid 6-digit authenticator code.");
      return;
    }
    setTwoFactorEnabled(true);
    setQrDataUrl(null);
    setManualSecret(null);
    setTotpCode("");
    setStatusMessage("Two-factor authentication enabled via Google Authenticator.");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }
    const res = await fetch("/api/settings/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMessage(data.detail || "Password change rejected.");
      return;
    }
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStatusMessage("Password changed successfully.");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.localStorage.clear();
    setFullName("");
    setEmail("");
    setAvatarUrl(null);
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100 py-12 px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-4xl space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-mono text-amber-400">Account & Security</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              Workspace User Settings
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleLogout}
            className="border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        {/* Profile Settings */}
        <Card className="border-white/10 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <UserRound className="w-4 h-4 text-amber-400" />
              Profile Settings
            </CardTitle>
            <CardDescription>Update your agency display name, email, and profile picture.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex items-center gap-4">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 rounded-full object-cover border border-amber-400/40"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sm font-semibold text-amber-300">
                    {fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="text-xs text-slate-300" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300">Full Name</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <Button type="submit" className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                Save Profile
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security Settings (TOTP 2FA via otplib) */}
        <Card className="border-white/10 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Two-Factor Authentication (TOTP)
            </CardTitle>
            <CardDescription>
              Status: {twoFactorEnabled ? "Enabled (Google Authenticator)" : "Not enabled"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!twoFactorEnabled && !qrDataUrl && (
              <Button type="button" onClick={handleSetupTwoFactor}>
                <QrCode className="w-4 h-4 mr-2" />
                Enable 2FA with Google Authenticator
              </Button>
            )}

            {qrDataUrl && (
              <form onSubmit={handleVerifyTwoFactor} className="flex flex-col sm:flex-row gap-6 items-start">
                <img
                  src={qrDataUrl}
                  alt="Google Authenticator 2FA QR code"
                  className="h-44 w-44 rounded-lg bg-white p-2"
                />
                <div className="space-y-3 flex-1">
                  <p className="text-xs text-slate-300">
                    Scan this QR code in Google Authenticator, then enter the 6-digit TOTP code below.
                  </p>
                  {manualSecret && (
                    <p className="font-mono text-xs text-amber-300">Secret: {manualSecret}</p>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-40 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white"
                  />
                  <div>
                    <Button type="submit" className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                      Verify & Activate 2FA
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="border-white/10 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <KeyRound className="w-4 h-4 text-amber-400" />
              Change Password
            </CardTitle>
            <CardDescription>Verify your current password before setting a new password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="password"
                required
                placeholder="Current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <div className="sm:col-span-3">
                <Button type="submit" variant="outline">
                  Update Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
