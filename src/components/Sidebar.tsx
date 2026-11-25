import React from "react";
import {
  Activity,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Code2,
  CreditCard,
  Database,
  FlaskConical,
  FolderKanban,
  Gauge,
  Globe,
  Home,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mic,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import type { Organization, TenantUser, UserRole } from "../types/tenant";
import { PWAInstallButton } from "./PWAInstallButton";

export type WorkspaceSection =
  | "overview"
  | "workspace"
  | "tasks"
  | "sales-agent"
  | "qa-engines"
  | "api-gateway"
  | "job-board"
  | "certification"
  | "data-marketplace"
  | "coach"
  | "affiliates"
  | "insights"
  | "factory"
  | "marketplace"
  | "live-monitor"
  | "escrow"
  | "kora-payouts"
  | "rls-lab"
  | "seo-engine"
  | "pricing"
  | "settings"
  | "blueprints";

interface SidebarProps {
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  organizations: Array<Pick<Organization, "id" | "name" | "subscription_tier">>;
  personas: Array<
    Pick<
      TenantUser,
      "id" | "org_id" | "full_name" | "email" | "role" | "avatar_url" | "two_factor_enabled"
    >
  >;
  activeOrgId: string;
  activeUserId: string;
  onSwitchTenant: (orgId: string, userId: string) => void;
  onOpenHomepage?: () => void;
  onOpenOfflineScripts?: () => void;
  onLogout: () => Promise<void>;
  isPhaseEnabled?: (phaseNumber: number) => boolean;
}

const NAV_ITEMS: Array<{
  id: WorkspaceSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  roles: UserRole[];
  phaseNumber?: number;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, iconColor: "text-blue-600", roles: ["admin", "annotator", "client"], phaseNumber: 1 },
  { id: "workspace", label: "Capture Workspace", icon: Mic, iconColor: "text-emerald-600", roles: ["admin", "annotator", "client"], phaseNumber: 22 },
  { id: "tasks", label: "Projects & Tasks", icon: FolderKanban, iconColor: "text-indigo-600", roles: ["admin", "annotator", "client"], phaseNumber: 1 },
  { id: "sales-agent", label: "Auto-Bidder Agent", icon: BriefcaseBusiness, iconColor: "text-sky-600", roles: ["admin"], phaseNumber: 2 },
  { id: "qa-engines", label: "QA Engines", icon: Gauge, iconColor: "text-emerald-600", roles: ["admin", "annotator"], phaseNumber: 3 },
  { id: "api-gateway", label: "B2B API Gateway", icon: KeyRound, iconColor: "text-indigo-600", roles: ["admin", "annotator"], phaseNumber: 7 },
  { id: "job-board", label: "Two-Sided Job Board", icon: BriefcaseBusiness, iconColor: "text-blue-600", roles: ["admin", "annotator", "client"], phaseNumber: 15 },
  { id: "certification", label: "QA Certification ($99)", icon: BadgeCheck, iconColor: "text-emerald-600", roles: ["admin", "annotator", "client"], phaseNumber: 21 },
  { id: "data-marketplace", label: "Data Marketplace (10%)", icon: Database, iconColor: "text-blue-600", roles: ["admin", "annotator", "client"], phaseNumber: 21 },
  { id: "coach", label: "AI Coach ($19/mo)", icon: Sparkles, iconColor: "text-indigo-600", roles: ["admin", "annotator", "client"], phaseNumber: 21 },
  { id: "affiliates", label: "Affiliate & Referrals", icon: Share2, iconColor: "text-emerald-600", roles: ["admin", "annotator", "client"], phaseNumber: 16 },
  { id: "insights", label: "Pricing & Data Insights", icon: TrendingUp, iconColor: "text-blue-600", roles: ["admin"], phaseNumber: 17 },
  { id: "factory", label: "Synthetic & Red-Team", icon: FlaskConical, iconColor: "text-amber-600", roles: ["admin"], phaseNumber: 4 },
  { id: "marketplace", label: "Expert Marketplace", icon: Users, iconColor: "text-teal-600", roles: ["admin", "annotator"], phaseNumber: 5 },
  { id: "live-monitor", label: "Live & Simulator", icon: Activity, iconColor: "text-cyan-600", roles: ["admin", "annotator"], phaseNumber: 6 },
  { id: "escrow", label: "Escrow Ledger", icon: Landmark, iconColor: "text-emerald-600", roles: ["admin", "annotator"], phaseNumber: 18 },
  { id: "kora-payouts", label: "Kora Pay 85/15 & T+2", icon: Landmark, iconColor: "text-blue-600", roles: ["admin", "annotator", "client"], phaseNumber: 18 },
  { id: "rls-lab", label: "RLS Isolation Lab", icon: ShieldCheck, iconColor: "text-blue-600", roles: ["admin", "annotator"], phaseNumber: 11 },
  { id: "seo-engine", label: "SEO & Marketing", icon: Globe, iconColor: "text-sky-600", roles: ["admin", "annotator"], phaseNumber: 10 },
  { id: "pricing", label: "Pricing & Trial", icon: CreditCard, iconColor: "text-amber-600", roles: ["admin", "annotator", "client"], phaseNumber: 9 },
  { id: "settings", label: "Settings & 2FA", icon: Settings, iconColor: "text-slate-600", roles: ["admin", "annotator", "client"], phaseNumber: 8 },
  { id: "blueprints", label: "Architecture Code", icon: Code2, iconColor: "text-indigo-600", roles: ["admin", "annotator"] },
];

export function Sidebar({
  activeSection,
  onSelectSection,
  organizations,
  personas,
  activeOrgId,
  activeUserId,
  onSwitchTenant,
  onOpenHomepage,
  onOpenOfflineScripts,
  onLogout,
  isPhaseEnabled,
}: SidebarProps) {
  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const orgPersonas = personas.filter((p) => p.org_id === activeOrgId);
  const activeUser = orgPersonas.find((p) => p.id === activeUserId);

  return (
    <aside className="w-full lg:w-64 2xl:w-72 shrink-0 lg:border-r border-slate-200/80 bg-white/95 backdrop-blur-xl text-slate-900 flex flex-col justify-between">
      <div>
        {/* White-Label Organization Identity */}
        <div className="px-6 py-5 border-b border-slate-200/80 bg-gradient-to-br from-blue-50/60 via-white to-emerald-50/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <p className="text-[15px] font-bold tracking-tight text-slate-950 truncate">
              {activeOrg?.name ?? "Apex Copilot"}
            </p>
          </div>
          <p className="mt-2.5 text-xs font-medium text-slate-600 truncate capitalize">
            {activeOrg?.subscription_tier.replace("_", " ")} ·{" "}
            {activeUser?.role === "admin" ? "Org Admin" : "Annotator"}
          </p>
        </div>

        {/* Navigation Links */}
        <nav className="p-3.5 space-y-1" aria-label="Primary workspace navigation">
          {NAV_ITEMS.filter((item) => {
            if (activeUser && !item.roles.includes(activeUser.role)) return false;
            if (item.phaseNumber && isPhaseEnabled && !isPhaseEnabled(item.phaseNumber)) {
              return false;
            }
            return true;
          }).map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white shadow-[0_6px_18px_rgba(37,99,235,0.22)]"
                    : "text-slate-600 hover:text-slate-950 hover:bg-slate-100/80"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : item.iconColor}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Multi-Tenant Session Switcher */}
        <div className="mx-3.5 mt-4 pt-4 border-t border-slate-200/80 space-y-3">
          <div>
            <label
              htmlFor="tenant-org-select"
              className="block text-xs font-semibold text-slate-600 mb-1.5"
            >
              Active Tenant Organization
            </label>
            <select
              id="tenant-org-select"
              value={activeOrgId}
              onChange={(e) => {
                const nextOrgId = e.target.value;
                const defaultPersona = personas.find((p) => p.org_id === nextOrgId);
                if (defaultPersona) {
                  onSwitchTenant(nextOrgId, defaultPersona.id);
                }
              }}
              className="w-full min-h-[44px] px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tenant-role-select"
              className="block text-xs font-semibold text-slate-600 mb-1.5"
            >
              View Mode / Persona
            </label>
            <select
              id="tenant-role-select"
              value={activeUserId}
              onChange={(e) => onSwitchTenant(activeOrgId, e.target.value)}
              className="w-full min-h-[44px] px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            >
              {orgPersonas.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} ({person.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Active Session Summary */}
      <div className="p-4 border-t border-slate-200/80 bg-slate-50/70 text-xs text-slate-500 space-y-3">
        <div className="flex items-center gap-2.5">
          {activeUser?.avatar_url ? (
            <img
              src={activeUser.avatar_url}
              alt={activeUser.full_name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-blue-200 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
              {(activeUser?.full_name ?? "AP").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">
              {activeUser?.full_name ?? "Loading..."}
            </p>
            <p className="truncate text-slate-500">{activeUser?.email}</p>
          </div>
        </div>
        <p className="font-mono tabular-nums text-[11px] text-slate-500 truncate">
          org_id: {activeOrgId.slice(0, 8)}...
          {activeUser?.two_factor_enabled ? " · 2FA On" : ""}
        </p>

        <div className="space-y-1.5 pt-1">
          <PWAInstallButton onOpenOfflineScripts={onOpenOfflineScripts} />
          {onOpenOfflineScripts && (
            <button
              type="button"
              onClick={onOpenOfflineScripts}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap"
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Scripts (/offline)</span>
            </button>
          )}
          {onOpenHomepage && (
            <button
              type="button"
              onClick={onOpenHomepage}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Public Homepage</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void onLogout()}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-red-200 bg-red-50 rounded-lg text-red-700 hover:bg-red-100 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout Permanently</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
