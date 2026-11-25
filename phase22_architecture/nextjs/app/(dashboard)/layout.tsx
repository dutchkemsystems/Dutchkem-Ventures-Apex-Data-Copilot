"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Home, Menu, Settings, Wallet } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home, matchExact: true },
  { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase, matchExact: false },
  { href: "/dashboard/earnings", label: "Earnings", icon: Wallet, matchExact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, matchExact: false },
] as const;

export default function MobileResponsiveDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/dashboard";
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-[#F4F7FC] text-[#0B1F3A]">
      {/* Desktop Sidebar (lg+ only) */}
      <aside className="hidden lg:flex w-64 2xl:w-72 shrink-0 flex-col border-r border-slate-200/80 bg-white">
        <div className="px-5 py-5 border-b border-slate-200/80">
          <p className="text-sm font-bold text-[#0B1F3A]">Apex Data Copilot</p>
          <p className="text-xs text-slate-500">Dutchkem Ventures</p>
        </div>
        <nav aria-label="Desktop workspace navigation" className="flex-1 p-3 space-y-1">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.matchExact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[#0B1F3A] text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 lg:px-8 border-b border-slate-200/80 bg-white/95 backdrop-blur-md flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open workspace navigation drawer"
                  className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shrink-0"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[340px] p-0 bg-white">
                <SheetHeader className="px-5 py-4 border-b border-slate-200">
                  <SheetTitle className="text-base font-bold text-[#0B1F3A]">
                    Apex Data Copilot
                  </SheetTitle>
                  <SheetDescription className="text-xs text-slate-500">
                    Mobile workspace navigation
                  </SheetDescription>
                </SheetHeader>
                <nav className="p-3 space-y-1">
                  {BOTTOM_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = item.matchExact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSheetOpen(false)}
                        className={`min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                          active
                            ? "bg-[#0B1F3A] text-white"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            <span className="text-sm font-bold text-[#0B1F3A] truncate">
              Apex Data Copilot
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< lg only) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-slate-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-4 h-16 px-1">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.matchExact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors ${
                  active ? "text-[#0B1F3A]" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
