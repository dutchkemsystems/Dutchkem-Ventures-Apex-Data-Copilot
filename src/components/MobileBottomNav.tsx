import React from "react";
import { BriefcaseBusiness, Home, Landmark, Settings } from "lucide-react";
import type { UserRole } from "../types/tenant";
import type { WorkspaceSection } from "./Sidebar";

interface MobileBottomNavProps {
  activeSection: WorkspaceSection;
  userRole?: UserRole;
  onSelectSection: (section: WorkspaceSection) => void;
}

export function MobileBottomNav({
  activeSection,
  userRole,
  onSelectSection,
}: MobileBottomNavProps) {
  const earningsTarget: WorkspaceSection =
    userRole === "client" ? "kora-payouts" : "escrow";

  const items: Array<{
    key: string;
    label: string;
    section: WorkspaceSection;
    icon: React.ComponentType<{ className?: string }>;
    isActive: boolean;
  }> = [
    {
      key: "home",
      label: "Home",
      section: "overview",
      icon: Home,
      isActive: activeSection === "overview" || activeSection === "tasks",
    },
    {
      key: "jobs",
      label: "Jobs",
      section: "job-board",
      icon: BriefcaseBusiness,
      isActive: activeSection === "job-board",
    },
    {
      key: "earnings",
      label: "Earnings",
      section: earningsTarget,
      icon: Landmark,
      isActive: activeSection === "escrow" || activeSection === "kora-payouts",
    },
    {
      key: "settings",
      label: "Settings",
      section: "settings",
      icon: Settings,
      isActive: activeSection === "settings",
    },
  ];

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-slate-200/90 bg-white/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
    >
      <div className="grid grid-cols-4 items-center px-2 h-15">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectSection(item.section)}
              aria-current={item.isActive ? "page" : undefined}
              className={`min-h-[44px] min-w-[44px] w-full flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                item.isActive
                  ? "text-[#0B1F3A] bg-blue-50/90 font-bold"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  item.isActive ? "text-blue-600" : "text-slate-500"
                }`}
              />
              <span className="text-[11px] leading-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
