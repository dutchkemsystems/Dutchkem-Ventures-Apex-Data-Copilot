import React from "react";
import { UserPlaneProvider, type UserPlaneSessionState } from "./providers";

/**
 * Isolated User Plane Layout (/dashboard/*)
 * Guarded by middleware.ts requiring apex_user_session cookie with JWT aud = 'apex:user'.
 * Build-time ESLint rule forbids importing any component from app/(admin)/**.
 */
export default function UserDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialSession: UserPlaneSessionState = {
    plane: "user",
    audience: "apex:user",
    userId: "",
    orgId: "",
    email: "",
    role: "freelancer",
  };

  return (
    <UserPlaneProvider initialSession={initialSession}>
      <div className="min-h-screen flex bg-[#F8FAFF] text-[#0F172A]">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="text-base font-bold tracking-tight text-slate-950 whitespace-nowrap">
              Apex User Portal
            </div>
            <nav className="space-y-1 text-sm font-medium text-slate-700">
              <a
                href="/dashboard"
                className="block px-3 py-2 rounded-lg hover:bg-slate-100 whitespace-nowrap"
              >
                Overview
              </a>
              <a
                href="/dashboard/payouts"
                className="block px-3 py-2 rounded-lg hover:bg-slate-100 whitespace-nowrap"
              >
                Kora Payouts
              </a>
              <a
                href="/dashboard/settings/security"
                className="block px-3 py-2 rounded-lg hover:bg-slate-100 whitespace-nowrap"
              >
                Security &amp; 2FA
              </a>
            </nav>
          </div>
          <form action="/api/auth/user/logout" method="POST">
            <button
              type="submit"
              className="w-full px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap"
            >
              User Sign Out
            </button>
          </form>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 px-8 border-b border-slate-200 bg-white flex items-center justify-between gap-8">
            <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
              User Plane · aud: apex:user
            </span>
            <span className="text-xs font-mono text-blue-700 whitespace-nowrap">
              Cookie: apex_user_session
            </span>
          </header>
          <main className="flex-1 p-8 max-w-6xl w-full mx-auto">{children}</main>
        </div>
      </div>
    </UserPlaneProvider>
  );
}
