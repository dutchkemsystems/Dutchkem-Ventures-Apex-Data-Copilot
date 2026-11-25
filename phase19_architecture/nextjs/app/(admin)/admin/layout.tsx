import React from "react";
import { AdminPlaneProvider, type AdminPlaneSessionState } from "./providers";

/**
 * Isolated Admin Plane Layout (/admin/*)
 * Guarded by middleware.ts requiring apex_admin_session cookie (JWT aud = 'apex:admin').
 * Build-time ESLint rule forbids importing any component from app/(user)/**.
 */
export default function AdminPlaneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialSession: AdminPlaneSessionState = {
    plane: "admin",
    audience: "apex:admin",
    adminId: "",
    email: "",
    adminRole: "super_admin",
    totpVerified: true,
  };

  return (
    <AdminPlaneProvider initialSession={initialSession}>
      <div className="min-h-screen flex bg-slate-950 text-slate-100">
        <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-900 p-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              Apex Control Plane
            </div>
            <nav className="space-y-1 text-sm font-medium text-slate-300">
              <a
                href="/admin"
                className="block px-3 py-2 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                Security Overview
              </a>
              <a
                href="/admin/escrow"
                className="block px-3 py-2 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                Escrow &amp; Finance
              </a>
              <a
                href="/admin/dpo"
                className="block px-3 py-2 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                DPO Compliance
              </a>
              <a
                href="/admin/audit"
                className="block px-3 py-2 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                Audit &amp; Incidents
              </a>
            </nav>
          </div>
          <form action="/api/auth/admin/logout" method="POST">
            <button
              type="submit"
              className="w-full px-3 py-2 text-xs font-semibold text-red-200 border border-red-800/70 bg-red-950/40 rounded-lg hover:bg-red-900/50 whitespace-nowrap"
            >
              Admin Sign Out
            </button>
          </form>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 px-8 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-8">
            <span className="text-sm font-semibold text-white whitespace-nowrap">
              Admin Plane · aud: apex:admin (TOTP Required)
            </span>
            <span className="text-xs font-mono text-emerald-400 whitespace-nowrap">
              Cookie: apex_admin_session (Path=/admin)
            </span>
          </header>
          <main className="flex-1 p-8 max-w-6xl w-full mx-auto">{children}</main>
        </div>
      </div>
    </AdminPlaneProvider>
  );
}
