"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MULTI_TENANT_NAV, TenantSession } from "../lib/tenant-context";

interface DashboardShellProps {
  session: TenantSession;
  children: React.ReactNode;
}

export function DashboardShell({ session, children }: DashboardShellProps) {
  const pathname = usePathname();
  const visibleNav = MULTI_TENANT_NAV.filter((item) =>
    item.roles.includes(session.role)
  );

  const isAdmin = session.role === "admin";

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      {/* White-Label Tenant Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between">
        <div>
          <div className="px-6 py-5 border-b border-slate-200">
            <p className="text-base font-semibold tracking-tight text-slate-900">
              {session.orgName}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {session.subscriptionTier.replace("_", " ")} · {session.role}
            </p>
          </div>

          <nav className="p-3 space-y-1" aria-label="Workspace navigation">
            {visibleNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Scoped Role Summary Footer */}
        <div className="p-4 border-t border-slate-200 text-xs text-slate-600 space-y-1">
          <p className="font-medium text-slate-900 truncate">{session.userName}</p>
          <p className="truncate">{session.userEmail}</p>
          {isAdmin ? (
            <p className="font-mono tabular-nums text-slate-500 pt-1">
              Org ID: {session.orgId.slice(0, 8)}
            </p>
          ) : (
            <p className="font-mono tabular-nums text-slate-500 pt-1">
              Rate: ${session.hourlyRate.toFixed(2)}/hr
            </p>
          )}
        </div>
      </aside>

      {/* Main Tenant Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-8 border-b border-slate-200 bg-white flex items-center justify-between gap-8">
          <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
            <span className="font-medium text-slate-900">{session.orgName}</span>
            <span aria-hidden="true">/</span>
            <span>{isAdmin ? "Organization Admin Console" : "Annotator Workbench"}</span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="text-xs font-mono tabular-nums text-slate-500">
              RLS Scope: {session.orgId.slice(0, 8)}
            </span>
            {isAdmin && (
              <Link
                href="/dashboard/projects?new=1"
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                Create Project
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 p-8 max-w-[1200px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
