import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { GlobalFooter, type LegalDocSlug } from "./components/GlobalFooter";
import { LandingHomepageView } from "./components/LandingHomepageView";
import { LoginView, type UserAuthMode } from "./components/LoginView";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { Sidebar, type WorkspaceSection } from "./components/Sidebar";
import { cacheWorkspaceScripts } from "./pwa/offlineScriptStore";
import { useFeatureFlags } from "./hooks/useFeatureFlags";
import type {
  Organization,
  RlsProbeResult,
  TenantUser,
  WorkspacePayload,
} from "./types/tenant";

const DashboardLayout = lazy(() => import("./planes/dashboard/DashboardLayout"));
const SupportChatWidget = lazy(() => import("./planes/dashboard/SupportChatWidget"));
const AdminLayout = lazy(() => import("./planes/admin/AdminLayout"));
const AdminAuthView = lazy(() => import("./planes/admin/AdminAuthView"));
const AdminPortalShell = lazy(() => import("./planes/admin/AdminPortalShell"));

// Code-split Admin-only views so they are never bundled into User /dashboard JS chunks
const AdminDashboardView = lazy(() =>
  import("./components/AdminDashboardView").then((m) => ({ default: m.AdminDashboardView }))
);
const DynamicPricingInsightsView = lazy(() =>
  import("./components/DynamicPricingInsightsView").then((m) => ({
    default: m.DynamicPricingInsightsView,
  }))
);
const SyntheticRedTeamView = lazy(() =>
  import("./components/SyntheticRedTeamView").then((m) => ({ default: m.SyntheticRedTeamView }))
);
const SalesAgentView = lazy(() =>
  import("./components/SalesAgentView").then((m) => ({ default: m.SalesAgentView }))
);
const BlueprintViewer = lazy(() =>
  import("./components/BlueprintViewer").then((m) => ({ default: m.BlueprintViewer }))
);

// Code-split heavy User & Public feature views
const AffiliateDashboardView = lazy(() =>
  import("./components/AffiliateDashboardView").then((m) => ({
    default: m.AffiliateDashboardView,
  }))
);
const AnnotatorDashboardView = lazy(() =>
  import("./components/AnnotatorDashboardView").then((m) => ({
    default: m.AnnotatorDashboardView,
  }))
);
const ApiGatewayView = lazy(() =>
  import("./components/ApiGatewayView").then((m) => ({ default: m.ApiGatewayView }))
);
const EscrowLedgerView = lazy(() =>
  import("./components/EscrowLedgerView").then((m) => ({ default: m.EscrowLedgerView }))
);
const EvaluationEnginesView = lazy(() =>
  import("./components/EvaluationEnginesView").then((m) => ({
    default: m.EvaluationEnginesView,
  }))
);
const JobBoardView = lazy(() =>
  import("./components/JobBoardView").then((m) => ({ default: m.JobBoardView }))
);
const CertificationView = lazy(() =>
  import("./components/CertificationView").then((m) => ({ default: m.CertificationView }))
);
const DataMarketplaceView = lazy(() =>
  import("./components/DataMarketplaceView").then((m) => ({ default: m.DataMarketplaceView }))
);
const AiCoachView = lazy(() =>
  import("./components/AiCoachView").then((m) => ({ default: m.AiCoachView }))
);
const KoraPayoutStatusView = lazy(() =>
  import("./components/KoraPayoutStatusView").then((m) => ({ default: m.KoraPayoutStatusView }))
);
const LegalComplianceView = lazy(() =>
  import("./components/LegalComplianceView").then((m) => ({ default: m.LegalComplianceView }))
);
const LiveMonitorAndInterviewView = lazy(() =>
  import("./components/LiveMonitorAndInterviewView").then((m) => ({
    default: m.LiveMonitorAndInterviewView,
  }))
);
const MarketplaceView = lazy(() =>
  import("./components/MarketplaceView").then((m) => ({ default: m.MarketplaceView }))
);
const PricingView = lazy(() =>
  import("./components/PricingView").then((m) => ({ default: m.PricingView }))
);
const RlsIsolationLab = lazy(() =>
  import("./components/RlsIsolationLab").then((m) => ({ default: m.RlsIsolationLab }))
);
const SeoPagesView = lazy(() =>
  import("./components/SeoPagesView").then((m) => ({ default: m.SeoPagesView }))
);
const SettingsView = lazy(() =>
  import("./components/SettingsView").then((m) => ({ default: m.SettingsView }))
);
const OnboardingWizardView = lazy(() =>
  import("./components/OnboardingWizardView").then((m) => ({
    default: m.OnboardingWizardView,
  }))
);
const OfflinePageView = lazy(() =>
  import("./components/OfflinePageView").then((m) => ({
    default: m.OfflinePageView,
  }))
);
const MobileWorkspaceView = lazy(() =>
  import("./components/MobileWorkspaceView").then((m) => ({
    default: m.MobileWorkspaceView,
  }))
);
const PublicStatusPageView = lazy(() =>
  import("./components/PublicStatusPageView").then((m) => ({
    default: m.PublicStatusPageView,
  }))
);

interface TenantDirectory {
  organizations: Array<Pick<Organization, "id" | "name" | "subscription_tier">>;
  personas: Array<
    Pick<
      TenantUser,
      "id" | "org_id" | "full_name" | "email" | "role" | "avatar_url" | "two_factor_enabled"
    >
  >;
}

const LOGGED_OUT_STORAGE_KEY = "apex_permanently_logged_out";

function isStatusHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname.startsWith("status.");
}

function isPublicSeoOrLegalPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/status" ||
    pathname === "/offline" ||
    pathname === "/jobs-board" ||
    pathname === "/marketplace" ||
    pathname.startsWith("/ref/") ||
    pathname.startsWith("/jobs/") ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/legal/")
  );
}

function safeStorageGet(key: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage denial in strict third-party iframe contexts
  }
}

function safeStorageRemove(key: string): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage denial
  }
}

function captureReferralFromLocation() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const refFromPath = path.startsWith("/ref/")
    ? decodeURIComponent(path.slice("/ref/".length).split("/")[0] || "").trim()
    : "";
  const refFromQuery = (params.get("ref") || "").trim();
  const refId = refFromPath || refFromQuery;
  if (!refId) return;

  try {
    document.cookie = `apex_ref_id=${encodeURIComponent(refId)}; Path=/; Max-Age=2592000; SameSite=Lax`;
  } catch {
    // Ignore restricted cookie access
  }
  safeStorageSet("apex_ref_id", refId);

  if (refFromQuery) {
    fetch("/api/referrals/track", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrerId: refId, landingPath: `${path}${window.location.search}` }),
    }).catch(() => {});
  }
}

function isOrganizationBillingGated(org: Organization | undefined | null): boolean {
  if (!org) return false;
  if (org.subscription_locked) return true;
  const isTrial = org.subscription_tier === "trial";
  const trialExpired =
    isTrial &&
    Boolean(org.trial_ends_at) &&
    Date.parse(org.trial_ends_at as string) <= Date.now();
  const subscriptionExpired =
    (org.subscription_tier === "pro" || org.subscription_tier === "agency") &&
    Boolean(org.subscription_ends_at) &&
    Date.parse(org.subscription_ends_at as string) <= Date.now();
  const quotaExceeded = isTrial && (org.monthly_task_count ?? 0) >= 3;
  return trialExpired || subscriptionExpired || quotaExceeded;
}

function isUserAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  );
}

function resolveUserAuthMode(pathname: string): UserAuthMode {
  if (pathname === "/signup") return "signup";
  if (pathname === "/forgot-password") return "forgot";
  if (pathname === "/reset-password") return "reset";
  return "signin";
}

function isAdminPlanePathname(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export default function App() {
  const initialPath =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const initialSearch =
    typeof window !== "undefined" ? window.location.search : "";
  const [adminLocation, setAdminLocation] = useState<string>(() =>
    isAdminPlanePathname(initialPath) ? `${initialPath}${initialSearch}` : ""
  );
  const initialPublicSeoRoute: { mode: "jobs" | "blog"; slug: string } | null =
    initialPath.startsWith("/jobs/")
      ? { mode: "jobs", slug: initialPath.slice("/jobs/".length) }
      : initialPath.startsWith("/blog/")
        ? { mode: "blog", slug: initialPath.slice("/blog/".length) }
        : null;
  const initialPublicLegalDoc: LegalDocSlug | null =
    initialPath === "/legal/terms"
      ? "terms"
      : initialPath === "/legal/privacy"
        ? "privacy"
        : initialPath === "/legal/refund"
          ? "refund"
          : null;
  const isLocallyLoggedOut = safeStorageGet(LOGGED_OUT_STORAGE_KEY) === "1";

  const [directory, setDirectory] = useState<TenantDirectory | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [permanentlyLoggedOut, setPermanentlyLoggedOut] = useState(isLocallyLoggedOut);
  const [publicSeoRoute, setPublicSeoRoute] = useState<{
    mode: "jobs" | "blog";
    slug: string;
  } | null>(initialPublicSeoRoute);
  const [publicLegalDoc, setPublicLegalDoc] = useState<LegalDocSlug | null>(
    initialPublicLegalDoc
  );
  const [publicJobBoard, setPublicJobBoard] = useState<boolean>(
    initialPath === "/jobs-board"
  );
  const [publicOfflinePage, setPublicOfflinePage] = useState<boolean>(
    initialPath === "/offline"
  );
  const [publicStatusPage, setPublicStatusPage] = useState<boolean>(
    initialPath === "/status" || isStatusHost()
  );
  const [showLogin, setShowLogin] = useState(
    !isAdminPlanePathname(initialPath) &&
      !initialPublicSeoRoute &&
      !initialPublicLegalDoc &&
      initialPath !== "/jobs-board" &&
      initialPath !== "/offline" &&
      initialPath !== "/status" &&
      !isStatusHost() &&
      !initialPath.startsWith("/ref/") &&
      (isUserAuthPath(initialPath) || (isLocallyLoggedOut && initialPath !== "/"))
  );
  const [showHomepage, setShowHomepage] = useState(
    !isAdminPlanePathname(initialPath) &&
      !initialPublicSeoRoute &&
      !initialPublicLegalDoc &&
      initialPath !== "/jobs-board" &&
      initialPath !== "/offline" &&
      initialPath !== "/status" &&
      !isStatusHost() &&
      initialPath !== "/onboarding" &&
      !isUserAuthPath(initialPath) &&
      initialPath !== "/settings" &&
      initialPath !== "/dashboard/settings/security" &&
      initialPath !== "/pricing" &&
      initialPath !== "/certification" &&
      initialPath !== "/coach" &&
      !initialPath.startsWith("/dashboard") &&
      (!isLocallyLoggedOut ||
        initialPath === "/" ||
        initialPath === "/marketplace" ||
        initialPath.startsWith("/ref/"))
  );
  const [section, setSection] = useState<WorkspaceSection>(
    initialPath === "/settings" || initialPath === "/dashboard/settings/security"
      ? "settings"
      : initialPath === "/dashboard/workspace"
        ? "workspace"
        : initialPath === "/pricing"
          ? "pricing"
          : initialPath === "/certification"
            ? "certification"
            : initialPath === "/coach"
              ? "coach"
              : "overview"
  );
  const [upgradeToast, setUpgradeToast] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(!isAdminPlanePathname(initialPath));
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = Boolean(workspace) && !permanentlyLoggedOut;
  const { isFeatureEnabled, isPhaseEnabled } = useFeatureFlags(
    workspace?.currentUser.id || activeUserId || null,
    workspace?.organization.id || activeOrgId || null
  );
  const newDashboardFlagEnabled = isFeatureEnabled("feature.new_dashboard_enabled");

  const forceLoggedOutLogin = useCallback(() => {
    setWorkspace(null);
    setDirectory(null);
    setActiveOrgId("");
    setActiveUserId("");
    setPermanentlyLoggedOut(true);
    setPublicSeoRoute(null);
    setPublicLegalDoc(null);
    setPublicJobBoard(false);
    setPublicOfflinePage(false);
    setShowHomepage(false);
    setShowLogin(true);
    safeStorageRemove("apex_org_id");
    safeStorageRemove("apex_user_id");
    safeStorageSet(LOGGED_OUT_STORAGE_KEY, "1");
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const openLoginScreen = useCallback(() => {
    setPublicSeoRoute(null);
    setPublicLegalDoc(null);
    setPublicJobBoard(false);
    setPublicOfflinePage(false);
    setShowHomepage(false);
    setShowLogin(true);
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.history.pushState({}, "", "/login");
    }
  }, []);

  const openOfflinePage = useCallback(() => {
    setMobileMenuOpen(false);
    setPublicSeoRoute(null);
    setPublicLegalDoc(null);
    setPublicJobBoard(false);
    setShowHomepage(false);
    setShowLogin(false);
    setPublicOfflinePage(true);
    if (typeof window !== "undefined" && window.location.pathname !== "/offline") {
      window.history.pushState({}, "", "/offline");
    }
  }, []);

  const loadWorkspace = useCallback(
    async (orgId: string, userId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch("/api/workspace", {
          credentials: "include",
          headers: {
            "x-org-id": orgId,
            "x-user-id": userId,
          },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (
            res.status === 401 ||
            body.code === "SESSION_PERMANENTLY_LOGGED_OUT" ||
            body.code === "SESSION_REVOKED"
          ) {
            forceLoggedOutLogin();
            return;
          }
          throw new Error(body.detail || "Failed to load tenant workspace.");
        }
        const payload: WorkspacePayload = await res.json();
        setWorkspace(payload);
        cacheWorkspaceScripts(
          payload.tasks ?? [],
          payload.organization?.name ?? "Apex Workspace",
          payload.escrowLedger ?? []
        );

        if (payload.currentUser.onboarding_completed === false) {
          setShowHomepage(false);
          setShowLogin(false);
          if (typeof window !== "undefined" && window.location.pathname !== "/onboarding") {
            window.history.replaceState({}, "", "/onboarding");
          }
          return;
        } else if (typeof window !== "undefined" && window.location.pathname === "/onboarding") {
          window.history.replaceState({}, "", "/dashboard");
        }

        const org = payload.organization;
        if (isOrganizationBillingGated(org)) {
          setUpgradeToast(
            org.subscription_locked
              ? "Subscription canceled or payment failed. Upgrade to unlock your Apex Copilot workspace."
              : "Upgrade to continue using the Apex Copilot."
          );
          setSection("pricing");
          if (typeof window !== "undefined" && window.location.pathname !== "/pricing") {
            window.history.replaceState({}, "", "/pricing");
          }
        }

        if (payload.currentUser.role !== "admin") {
          setSection((prev) =>
            prev === "sales-agent" || prev === "factory" || prev === "insights"
              ? "overview"
              : prev
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected workspace error.");
      } finally {
        setLoading(false);
      }
    },
    [forceLoggedOutLogin]
  );

  const refreshDirectory = useCallback(async () => {
    const res = await fetch("/api/tenants", { credentials: "include" });
    const dir: TenantDirectory = await res.json();
    setDirectory(dir);
    return dir;
  }, []);

  useEffect(() => {
    function syncRouteState() {
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      if (isAdminPlanePathname(currentPath)) {
        setAdminLocation(`${currentPath}${currentSearch}`);
        return;
      }
      setAdminLocation("");

      const loggedOutFlag = safeStorageGet(LOGGED_OUT_STORAGE_KEY) === "1";

      if (loggedOutFlag && !isUserAuthPath(currentPath)) {
        setPermanentlyLoggedOut(true);
        setWorkspace(null);
        setActiveOrgId("");
        setActiveUserId("");
        if (!isPublicSeoOrLegalPath(currentPath)) {
          setPublicSeoRoute(null);
          setPublicLegalDoc(null);
          setShowHomepage(false);
          setShowLogin(true);
          if (currentPath !== "/login") {
            window.history.replaceState({}, "", "/login");
          }
          return;
        }
      }

      if (currentPath.startsWith("/jobs/")) {
        setPublicLegalDoc(null);
        setPublicSeoRoute({ mode: "jobs", slug: currentPath.slice("/jobs/".length) });
        setShowHomepage(false);
        setShowLogin(false);
      } else if (currentPath.startsWith("/blog/")) {
        setPublicLegalDoc(null);
        setPublicSeoRoute({ mode: "blog", slug: currentPath.slice("/blog/".length) });
        setShowHomepage(false);
        setShowLogin(false);
      } else if (currentPath === "/legal/terms") {
        setPublicSeoRoute(null);
        setPublicLegalDoc("terms");
        setShowHomepage(false);
        setShowLogin(false);
      } else if (currentPath === "/legal/privacy") {
        setPublicSeoRoute(null);
        setPublicLegalDoc("privacy");
        setShowHomepage(false);
        setShowLogin(false);
      } else if (currentPath === "/legal/refund") {
        setPublicSeoRoute(null);
        setPublicLegalDoc("refund");
        setShowHomepage(false);
        setShowLogin(false);
      } else if (currentPath === "/status" || isStatusHost()) {
        setPublicSeoRoute(null);
        setPublicLegalDoc(null);
        setPublicJobBoard(false);
        setPublicOfflinePage(false);
        setPublicStatusPage(true);
        setShowHomepage(false);
        setShowLogin(false);
      } else if (currentPath === "/offline") {
        setPublicSeoRoute(null);
        setPublicLegalDoc(null);
        setPublicJobBoard(false);
        setPublicStatusPage(false);
        setShowHomepage(false);
        setShowLogin(false);
        setPublicOfflinePage(true);
      } else if (currentPath === "/jobs-board") {
        setPublicSeoRoute(null);
        setPublicLegalDoc(null);
        setPublicOfflinePage(false);
        setPublicStatusPage(false);
        setPublicJobBoard(true);
        setShowHomepage(false);
        setShowLogin(false);
      } else if (
        currentPath === "/" ||
        currentPath === "/marketplace" ||
        currentPath.startsWith("/ref/")
      ) {
        captureReferralFromLocation();
        setPublicSeoRoute(null);
        setPublicLegalDoc(null);
        setPublicJobBoard(false);
        setPublicOfflinePage(false);
        setPublicStatusPage(false);
        setShowLogin(false);
        setShowHomepage(true);
      } else if (isUserAuthPath(currentPath)) {
        setPublicSeoRoute(null);
        setPublicLegalDoc(null);
        setPublicJobBoard(false);
        setPublicOfflinePage(false);
        setShowHomepage(false);
        setShowLogin(true);
      } else if (currentPath === "/onboarding") {
        setPublicSeoRoute(null);
        setPublicLegalDoc(null);
        setPublicJobBoard(false);
        setPublicOfflinePage(false);
        setShowHomepage(false);
        setShowLogin(false);
      } else if (!loggedOutFlag) {
        setPublicSeoRoute(null);
        setPublicLegalDoc(null);
        setPublicJobBoard(false);
        setPublicOfflinePage(false);
        setShowHomepage(false);
        setShowLogin(false);
        if (currentPath === "/pricing") setSection("pricing");
        else if (currentPath === "/certification") setSection("certification");
        else if (currentPath === "/coach") setSection("coach");
        else if (currentPath === "/dashboard/workspace") setSection("workspace");
        else if (currentPath === "/settings" || currentPath === "/dashboard/settings/security") {
          setSection("settings");
        }
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        syncRouteState();
      }
    }

    window.addEventListener("popstate", syncRouteState);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("popstate", syncRouteState);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    captureReferralFromLocation();
    if (isAdminPlanePathname(window.location.pathname)) {
      setLoading(false);
      return;
    }
    async function init() {
      try {
        const sessionRes = await fetch("/api/auth/session", {
          credentials: "include",
        });
        const sessionData = (await sessionRes.json().catch(() => ({}))) as {
          authenticated?: boolean;
          permanentlyLoggedOut?: boolean;
          user?: TenantUser | null;
          organization?: Organization | null;
        };

        const loggedOut =
          Boolean(sessionData.permanentlyLoggedOut) ||
          safeStorageGet(LOGGED_OUT_STORAGE_KEY) === "1";

        if (loggedOut) {
          safeStorageRemove("apex_org_id");
          safeStorageRemove("apex_user_id");
          safeStorageSet(LOGGED_OUT_STORAGE_KEY, "1");
          setPermanentlyLoggedOut(true);
          setWorkspace(null);
          setDirectory(null);
          setActiveOrgId("");
          setActiveUserId("");
          if (!isPublicSeoOrLegalPath(window.location.pathname) && !isUserAuthPath(window.location.pathname)) {
            setShowHomepage(false);
            setShowLogin(true);
            if (window.location.pathname !== "/login") {
              window.history.replaceState({}, "", "/login");
            }
          }
          setLoading(false);
          return;
        }

        const dir = await refreshDirectory();
        if (sessionData.authenticated && sessionData.organization && sessionData.user) {
          safeStorageSet("apex_org_id", sessionData.organization.id);
          safeStorageSet("apex_user_id", sessionData.user.id);
          setActiveOrgId(sessionData.organization.id);
          setActiveUserId(sessionData.user.id);
          await loadWorkspace(sessionData.organization.id, sessionData.user.id);
          return;
        }

        const storedOrgId = safeStorageGet("apex_org_id");
        const storedUserId = safeStorageGet("apex_user_id");
        const matchedPersona = dir.personas.find(
          (p) => p.org_id === storedOrgId && p.id === storedUserId
        );
        const firstOrg = dir.organizations[0];
        const firstAdmin = dir.personas.find(
          (p) => p.org_id === firstOrg?.id && p.role === "admin"
        );
        const targetOrgId = matchedPersona?.org_id ?? firstOrg?.id;
        const targetUserId = matchedPersona?.id ?? firstAdmin?.id;
        if (targetOrgId && targetUserId) {
          safeStorageSet("apex_org_id", targetOrgId);
          safeStorageSet("apex_user_id", targetUserId);
          setActiveOrgId(targetOrgId);
          setActiveUserId(targetUserId);
          await loadWorkspace(targetOrgId, targetUserId);
        } else {
          setLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to connect to tenant API."
        );
        setLoading(false);
      }
    }
    init();
  }, [loadWorkspace, refreshDirectory]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/user/logout", {
        method: "POST",
        credentials: "include",
        redirect: "manual",
        headers: activeUserId ? { "x-user-id": activeUserId } : undefined,
      });
    } catch {
      // Proceed with local cleanup and redirect to homepage even if network fails
    }
    safeStorageRemove("apex_org_id");
    safeStorageRemove("apex_user_id");
    safeStorageSet(LOGGED_OUT_STORAGE_KEY, "1");
    setWorkspace(null);
    setDirectory(null);
    setActiveOrgId("");
    setActiveUserId("");
    setPermanentlyLoggedOut(true);
    setSection("overview");
    setShowLogin(false);
    setShowHomepage(true);
    window.location.replace("/");
  }

  async function handleLoginSuccess(orgId: string, userId: string) {
    safeStorageRemove(LOGGED_OUT_STORAGE_KEY);
    safeStorageSet("apex_org_id", orgId);
    safeStorageSet("apex_user_id", userId);
    setPermanentlyLoggedOut(false);
    setActiveOrgId(orgId);
    setActiveUserId(userId);
    setShowLogin(false);
    setShowHomepage(false);
    setSection("overview");
    window.history.pushState({}, "", "/dashboard");
    await refreshDirectory();
    await loadWorkspace(orgId, userId);
  }

  function handleSwitchTenant(nextOrgId: string, nextUserId: string) {
    setMobileMenuOpen(false);
    setActiveOrgId(nextOrgId);
    setActiveUserId(nextUserId);
    safeStorageSet("apex_org_id", nextOrgId);
    safeStorageSet("apex_user_id", nextUserId);
    loadWorkspace(nextOrgId, nextUserId);
  }

  async function handleCreateTask(payload: {
    project_id: string;
    assignee_id: string;
    title: string;
    amount: number;
    script_note: string;
  }) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-org-id": activeOrgId,
        "x-user-id": activeUserId,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        forceLoggedOutLogin();
        return;
      }
      if (res.status === 402 || body.code === "TRIAL_UPGRADE_REQUIRED") {
        setUpgradeToast(body.detail || "Upgrade to continue using the Apex Copilot.");
        setSection("pricing");
        window.history.pushState({}, "", "/pricing");
        return;
      }
      throw new Error(body.detail || "Failed to provision task.");
    }
    await loadWorkspace(activeOrgId, activeUserId);
  }

  async function handleVerifyTask(
    taskId: string,
    action: "approve" | "reject",
    verifierScore: number
  ) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-org-id": activeOrgId,
        "x-user-id": activeUserId,
      },
      body: JSON.stringify({ action, verifier_score: verifierScore }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        forceLoggedOutLogin();
        return;
      }
      throw new Error(body.detail || "Failed to update task.");
    }
    await loadWorkspace(activeOrgId, activeUserId);
  }

  async function handleSubmitTask(taskId: string, notes: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-org-id": activeOrgId,
        "x-user-id": activeUserId,
      },
      body: JSON.stringify({ action: "submit", notes }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        forceLoggedOutLogin();
        return;
      }
      throw new Error(body.detail || "Failed to submit task.");
    }
    await loadWorkspace(activeOrgId, activeUserId, { silent: true });
  }

  async function handleRunProbe(targetTaskId: string): Promise<RlsProbeResult> {
    const res = await fetch("/api/rls-probe", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-org-id": activeOrgId,
        "x-user-id": activeUserId,
      },
      body: JSON.stringify({ targetTaskId }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        forceLoggedOutLogin();
      }
      throw new Error("Failed to run RLS isolation probe.");
    }
    return res.json();
  }

  if (adminLocation && isAdminPlanePathname(adminLocation.split("?")[0])) {
    const [adminPathOnly, adminQuery = ""] = adminLocation.split("?");
    const inviteTokenParam = new URLSearchParams(adminQuery).get("token") || "";
    const isAuthEntry =
      adminPathOnly === "/admin/login" ||
      adminPathOnly === "/admin/2fa" ||
      (adminPathOnly === "/admin/users/invite" && Boolean(inviteTokenParam));

    if (isAuthEntry) {
      return (
        <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
          <AdminAuthView
            initialStep={
              adminPathOnly === "/admin/2fa"
                ? "2fa"
                : inviteTokenParam
                  ? "accept-invite"
                  : "login"
            }
            inviteToken={inviteTokenParam || undefined}
            onAuthenticated={() => setAdminLocation("/admin")}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <AdminPortalShell
          onRequireAuth={() => {
            window.history.replaceState({}, "", "/admin/login");
            setAdminLocation("/admin/login");
          }}
        />
      </Suspense>
    );
  }

  if (showLogin) {
    const currentUserAuthPath =
      typeof window !== "undefined" ? window.location.pathname : "/login";
    const resetTokenParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token") || ""
        : "";
    return (
      <LoginView
        initialMode={resolveUserAuthMode(currentUserAuthPath)}
        initialResetToken={resetTokenParam}
        onLoginSuccess={(orgId, userId) => void handleLoginSuccess(orgId, userId)}
        onReturnHomepage={() => {
          window.history.pushState({}, "", "/");
          setShowLogin(false);
          setShowHomepage(true);
        }}
      />
    );
  }

  const isPublicRenderableRoute = Boolean(
    publicLegalDoc ||
      publicSeoRoute ||
      publicStatusPage ||
      publicOfflinePage ||
      publicJobBoard ||
      showHomepage
  );

  if (!isPublicRenderableRoute && !directory && loading && !permanentlyLoggedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#EEF5FF] via-[#FFFFFF] to-[#ECFDF5] text-sm font-medium text-slate-700">
        Initializing multi-tenant workspace...
      </div>
    );
  }

  const isAdmin = workspace?.currentUser.role === "admin";

  function handleSelectSection(nextSection: WorkspaceSection) {
    setMobileMenuOpen(false);
    if (!isAuthenticated) {
      openLoginScreen();
      return;
    }
    const gated = isOrganizationBillingGated(workspace?.organization);
    if (gated && nextSection !== "pricing" && nextSection !== "blueprints") {
      setUpgradeToast(
        workspace?.organization.subscription_locked
          ? "Dashboard locked due to subscription cancellation or payment failure. Upgrade to unlock."
          : "Upgrade to continue using the Apex Copilot."
      );
      setSection("pricing");
      if (typeof window !== "undefined" && window.location.pathname !== "/pricing") {
        window.history.pushState({}, "", "/pricing");
      }
      return;
    }
    setSection(nextSection);
    if (typeof window !== "undefined") {
      const targetPath =
        nextSection === "pricing"
          ? "/pricing"
          : nextSection === "certification"
            ? "/certification"
            : nextSection === "coach"
              ? "/coach"
              : nextSection === "workspace"
                ? "/dashboard/workspace"
                : nextSection === "settings"
                  ? "/dashboard/settings/security"
                  : "/dashboard";
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, "", targetPath);
      }
    }
  }

  function handleEnterDashboard(targetSection: WorkspaceSection = "overview") {
    if (!isAuthenticated) {
      openLoginScreen();
      return;
    }
    const resolvedSection =
      !isAdmin &&
      (targetSection === "sales-agent" ||
        targetSection === "factory" ||
        targetSection === "insights")
        ? "overview"
        : targetSection;
    handleSelectSection(resolvedSection);
    setShowHomepage(false);
    setShowLogin(false);
  }

  function openPublicJob(slug: string) {
    window.history.pushState({}, "", `/jobs/${slug}`);
    setPublicLegalDoc(null);
    setPublicSeoRoute({ mode: "jobs", slug });
    setShowHomepage(false);
    setShowLogin(false);
  }

  function openPublicBlog(slug: string) {
    window.history.pushState({}, "", `/blog/${slug}`);
    setPublicLegalDoc(null);
    setPublicSeoRoute({ mode: "blog", slug });
    setShowHomepage(false);
    setShowLogin(false);
  }

  function openPublicLegal(slug: LegalDocSlug) {
    window.history.pushState({}, "", `/legal/${slug}`);
    setPublicSeoRoute(null);
    setPublicLegalDoc(slug);
    setShowHomepage(false);
    setShowLogin(false);
  }

  function openTrialFromPublicSeo() {
    setPublicSeoRoute(null);
    setPublicLegalDoc(null);
    if (!isAuthenticated) {
      openLoginScreen();
      return;
    }
    setSection("pricing");
    setShowHomepage(false);
    setShowLogin(false);
    window.history.pushState({}, "", "/pricing");
  }

  if (publicLegalDoc) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#F8FAFF]" />}>
        <LegalComplianceView
          activeDoc={publicLegalDoc}
          isAuthenticated={isAuthenticated}
          onSelectDoc={openPublicLegal}
          onOpenPricing={openTrialFromPublicSeo}
          onReturnHomepage={() => {
            setPublicLegalDoc(null);
            window.history.pushState({}, "", "/");
            setShowHomepage(true);
          }}
          onGoToDashboard={() => {
            setPublicLegalDoc(null);
            handleEnterDashboard("overview");
          }}
          onSignIn={openLoginScreen}
        />
      </Suspense>
    );
  }

  if (publicSeoRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#F8FAFF]" />}>
        <SeoPagesView
          mode={publicSeoRoute.mode}
          slug={publicSeoRoute.slug}
          orgId={activeOrgId}
          userId={activeUserId}
          isAuthenticated={isAuthenticated}
          onNavigateJob={openPublicJob}
          onNavigateBlog={openPublicBlog}
          onStartTrial={openTrialFromPublicSeo}
          onReturnHomepage={() => {
            setPublicSeoRoute(null);
            window.history.pushState({}, "", "/");
            setShowHomepage(true);
          }}
          onOpenLegal={openPublicLegal}
          onSignIn={openLoginScreen}
        />
      </Suspense>
    );
  }

  if (
    isAuthenticated &&
    workspace &&
    workspace.currentUser.onboarding_completed === false &&
    !publicSeoRoute &&
    !publicLegalDoc
  ) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#F8FAFF]" />}>
        <OnboardingWizardView
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userName={workspace.currentUser.full_name}
          userEmail={workspace.currentUser.email}
          initialKoraRecipientId={workspace.currentUser.kora_recipient_id ?? null}
          initialTier={workspace.organization.subscription_tier}
          initialStep={workspace.currentUser.onboarding_step ?? 1}
          onCompleted={async () => {
            await refreshDirectory();
            await loadWorkspace(workspace.organization.id, workspace.currentUser.id);
            setSection("overview");
            if (typeof window !== "undefined") {
              window.history.replaceState({}, "", "/dashboard");
            }
          }}
        />
      </Suspense>
    );
  }

  if (publicStatusPage) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#070B14]" />}>
        <PublicStatusPageView
          onOpenJobBoard={() => {
            setPublicStatusPage(false);
            setPublicJobBoard(true);
            window.history.pushState({}, "", "/jobs-board");
          }}
          onReturnHomepage={() => {
            setPublicStatusPage(false);
            window.history.pushState({}, "", "/");
            setShowHomepage(true);
          }}
        />
      </Suspense>
    );
  }

  if (publicOfflinePage) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#F8FAFF]" />}>
        <OfflinePageView
          isAuthenticated={isAuthenticated}
          onReturnDashboard={() => {
            setPublicOfflinePage(false);
            handleEnterDashboard("overview");
          }}
          onOpenJobBoard={() => {
            setPublicOfflinePage(false);
            setPublicJobBoard(true);
            window.history.pushState({}, "", "/jobs-board");
          }}
          onReturnHomepage={() => {
            setPublicOfflinePage(false);
            window.history.pushState({}, "", "/");
            setShowHomepage(true);
          }}
        />
      </Suspense>
    );
  }

  if (publicJobBoard) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#F8FAFF]" />}>
        <JobBoardView
          standalone
          isAuthenticated={isAuthenticated}
          orgId={activeOrgId}
          userName={workspace?.currentUser.full_name}
          userEmail={workspace?.currentUser.email}
          onReturnHomepage={() => {
            setPublicJobBoard(false);
            window.history.pushState({}, "", "/");
            setShowHomepage(true);
          }}
          onOpenLogin={openLoginScreen}
          onOpenDashboard={() => {
            setPublicJobBoard(false);
            handleEnterDashboard("job-board");
          }}
          onOpenCertification={() => {
            setPublicJobBoard(false);
            handleEnterDashboard("certification");
          }}
          onGenerateSyntheticData={() => {
            setPublicJobBoard(false);
            if (isAuthenticated) {
              handleEnterDashboard(isAdmin ? "factory" : "qa-engines");
            } else {
              openLoginScreen();
            }
          }}
        />
        <OfflineIndicator onOpenOfflinePage={openOfflinePage} />
      </Suspense>
    );
  }

  if (showHomepage) {
    const initialHomeTab =
      typeof window !== "undefined" && window.location.pathname === "/marketplace"
        ? "marketplace"
        : "overview";
    return (
      <>
        <LandingHomepageView
          isAuthenticated={isAuthenticated}
          orgId={workspace?.organization.id}
          orgName={workspace?.organization.name}
          userId={workspace?.currentUser.id}
          userName={workspace?.currentUser.full_name}
          userEmail={workspace?.currentUser.email}
          initialTab={initialHomeTab}
          onNavigateDashboard={handleEnterDashboard}
          onOpenLogin={openLoginScreen}
          onOpenPricing={() => {
            if (!isAuthenticated) {
              openLoginScreen();
              return;
            }
            setSection("pricing");
            setShowHomepage(false);
            setShowLogin(false);
            window.history.pushState({}, "", "/pricing");
          }}
          onOpenJobBoard={() => {
            setPublicJobBoard(true);
            setShowHomepage(false);
            setShowLogin(false);
            window.history.pushState({}, "", "/jobs-board");
          }}
          onOpenDataMarketplace={() => {
            if (typeof window !== "undefined" && window.location.pathname !== "/marketplace") {
              window.history.pushState({}, "", "/marketplace");
            }
          }}
          onOpenJobPage={openPublicJob}
          onOpenBlogPage={openPublicBlog}
          onOpenLegalPage={openPublicLegal}
          onOpenOfflinePage={openOfflinePage}
        />
        <OfflineIndicator onOpenOfflinePage={openOfflinePage} />
      </>
    );
  }

  const isAdminRoutePlane =
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

  const sidebarNode = directory ? (
    <Sidebar
      activeSection={section}
      onSelectSection={handleSelectSection}
      organizations={directory.organizations}
      personas={directory.personas}
      activeOrgId={activeOrgId}
      activeUserId={activeUserId}
      onSwitchTenant={handleSwitchTenant}
      onOpenHomepage={() => {
        window.history.pushState({}, "", "/");
        setShowHomepage(true);
      }}
      onOpenOfflineScripts={openOfflinePage}
      onLogout={handleLogout}
      isPhaseEnabled={isPhaseEnabled}
    />
  ) : null;

  const headerNode = (
    <header className="h-14 lg:h-16 px-3 sm:px-6 lg:px-8 2xl:px-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl sticky top-0 z-20 flex items-center justify-between gap-2 sm:gap-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
        {directory && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open workspace navigation menu"
            className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <span className="font-bold text-slate-950 truncate max-w-[125px] sm:max-w-none">
          {workspace?.organization.name ?? "Apex Data Copilot"}
        </span>
        <span aria-hidden="true" className="hidden sm:inline">/</span>
        <span className="whitespace-nowrap hidden sm:inline">
          {isAdmin ? "Organization Admin Console" : "Annotator Workbench"}
        </span>
        <span aria-hidden="true">/</span>
        <span className="capitalize truncate text-blue-700 font-semibold">
          {section.replace("-", " ")}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="hidden xl:inline text-xs font-mono tabular-nums text-emerald-700 font-medium whitespace-nowrap">
          AES-256 Prompt Vault · Zero-Trust RLS
        </span>
        <div className="hidden sm:block">
          <PWAInstallButton compact onOpenOfflineScripts={openOfflinePage} />
        </div>
        <button
          type="button"
          onClick={() => setSection("blueprints")}
          className="min-h-[44px] px-3 sm:px-4 py-2 text-xs font-semibold border border-blue-200 bg-blue-50/70 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
        >
          <span className="sm:hidden">Code</span>
          <span className="hidden sm:inline">Inspect Architecture Code</span>
        </button>
      </div>
    </header>
  );

  const footerNode = (
    <GlobalFooter
      compact
      isAuthenticated={isAuthenticated}
      onOpenLegal={openPublicLegal}
      onOpenPricing={() => handleSelectSection("pricing")}
    />
  );

  const mainContentNode = (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-24 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        </div>
      }
    >
      {error && (
        <div className="mb-6 p-4 border border-red-200 bg-red-50 text-red-900 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {!newDashboardFlagEnabled && (
        <div className="mb-5 p-4 border border-amber-300 bg-amber-50 text-amber-950 rounded-xl text-xs font-medium">
          Canary Notice: <span className="font-mono">feature.new_dashboard_enabled</span> is paused or rolled back for this cohort — serving safe baseline workspace view.
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        </div>
      ) : !workspace ? (
        <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4">
          <h2 className="text-base font-bold text-slate-900">Workspace session unavailable</h2>
          <p className="text-sm text-slate-600">
            {error || "Please sign in or retry loading your tenant workspace."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                void loadWorkspace(activeOrgId, activeUserId);
              }}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              Retry Workspace
            </button>
            <button
              type="button"
              onClick={openLoginScreen}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Sign In
            </button>
          </div>
        </div>
      ) : section === "blueprints" ? (
        <BlueprintViewer />
      ) : section === "pricing" ? (
        <PricingView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userEmail={workspace.currentUser.email}
          userName={workspace.currentUser.full_name}
          upgradeToast={upgradeToast}
          onDismissToast={() => setUpgradeToast(null)}
          onSubscriptionChanged={async () => {
            await refreshDirectory();
            await loadWorkspace(activeOrgId, activeUserId);
          }}
          onBackToHomepage={() => {
            window.history.pushState({}, "", "/");
            setShowHomepage(true);
          }}
        />
      ) : section === "settings" ? (
        <SettingsView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          currentUser={workspace.currentUser}
          onProfileUpdated={async () => {
            await refreshDirectory();
            await loadWorkspace(activeOrgId, activeUserId);
          }}
          onLogout={handleLogout}
        />
      ) : section === "rls-lab" ? (
        <RlsIsolationLab
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          data={workspace}
          onRunProbe={handleRunProbe}
        />
      ) : section === "seo-engine" ? (
        <SeoPagesView
          mode="console"
          orgId={workspace.organization.id}
          userId={workspace.currentUser.id}
          isAuthenticated={isAuthenticated}
          onNavigateJob={openPublicJob}
          onNavigateBlog={openPublicBlog}
          onStartTrial={() => handleSelectSection("pricing")}
          onReturnHomepage={() => {
            window.history.pushState({}, "", "/");
            setShowHomepage(true);
          }}
        />
      ) : section === "escrow" ? (
        <EscrowLedgerView data={workspace} />
      ) : section === "kora-payouts" ? (
        <KoraPayoutStatusView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userName={workspace.currentUser.full_name}
          userRole={workspace.currentUser.role}
        />
      ) : section === "workspace" ? (
        <MobileWorkspaceView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          data={workspace}
          onSubmitTask={handleSubmitTask}
          onTaskUpdated={() => loadWorkspace(activeOrgId, activeUserId, { silent: true })}
        />
      ) : section === "qa-engines" ? (
        <EvaluationEnginesView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          tasks={workspace.tasks}
          onTaskUpdated={() => loadWorkspace(activeOrgId, activeUserId, { silent: true })}
        />
      ) : section === "api-gateway" ? (
        <ApiGatewayView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userEmail={workspace.currentUser.email}
          userName={workspace.currentUser.full_name}
        />
      ) : section === "job-board" ? (
        <JobBoardView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          isAuthenticated={isAuthenticated}
          orgId={workspace.organization.id}
          userName={workspace.currentUser.full_name}
          userEmail={workspace.currentUser.email}
          onOpenCertification={() => handleSelectSection("certification")}
          onGenerateSyntheticData={() =>
            handleSelectSection(isAdmin ? "factory" : "qa-engines")
          }
        />
      ) : section === "certification" ? (
        <CertificationView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userName={workspace.currentUser.full_name}
          userEmail={workspace.currentUser.email}
          isAuthenticated={isAuthenticated}
          onOpenJobBoard={() => handleSelectSection("job-board")}
          onOpenLogin={openLoginScreen}
        />
      ) : section === "data-marketplace" ? (
        <DataMarketplaceView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          isAuthenticated={isAuthenticated}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userName={workspace.currentUser.full_name}
          userEmail={workspace.currentUser.email}
          onOpenLogin={openLoginScreen}
        />
      ) : section === "coach" ? (
        <AiCoachView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userName={workspace.currentUser.full_name}
          userEmail={workspace.currentUser.email}
          isAuthenticated={isAuthenticated}
          onOpenJobBoard={() => handleSelectSection("job-board")}
          onOpenLogin={openLoginScreen}
        />
      ) : section === "affiliates" ? (
        <AffiliateDashboardView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userName={workspace.currentUser.full_name}
        />
      ) : section === "live-monitor" ? (
        <LiveMonitorAndInterviewView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userName={workspace.currentUser.full_name}
        />
      ) : section === "marketplace" ? (
        <MarketplaceView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
          userRole={workspace.currentUser.role}
          onSettled={() => loadWorkspace(activeOrgId, activeUserId)}
        />
      ) : section === "insights" && isAdmin ? (
        <DynamicPricingInsightsView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
        />
      ) : section === "factory" && isAdmin ? (
        <SyntheticRedTeamView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
        />
      ) : section === "sales-agent" && isAdmin ? (
        <SalesAgentView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          orgId={workspace.organization.id}
          orgName={workspace.organization.name}
          userId={workspace.currentUser.id}
        />
      ) : isAdmin ? (
        <AdminDashboardView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          data={workspace}
          mode={section === "tasks" ? "tasks" : "overview"}
          onCreateTask={handleCreateTask}
          onVerifyTask={handleVerifyTask}
          onOpenAutoBidder={() => handleSelectSection("sales-agent")}
        />
      ) : (
        <AnnotatorDashboardView
          key={`${workspace.organization.id}-${workspace.currentUser.id}`}
          data={workspace}
          onSubmitTask={handleSubmitTask}
          onBrowseJobBoard={() => handleSelectSection("job-board")}
          onOpenCaptureWorkspace={() => handleSelectSection("workspace")}
        />
      )}
    </Suspense>
  );

  if (isAdminRoutePlane) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
        <AdminLayout
          session={{
            plane: "admin",
            audience: "apex:admin",
            adminId: workspace?.currentUser.id ?? "",
            orgId: workspace?.organization.id ?? "",
            adminEmail: workspace?.currentUser.email ?? "",
            adminName: workspace?.currentUser.full_name ?? "Platform Admin",
            adminRole: "super_admin",
          }}
          sidebar={sidebarNode}
          header={headerNode}
          footer={footerNode}
        >
          {mainContentNode}
        </AdminLayout>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFF]" />}>
      <DashboardLayout
        session={{
          plane: "user",
          audience: "apex:user",
          userId: workspace?.currentUser.id ?? "",
          orgId: workspace?.organization.id ?? "",
          userEmail: workspace?.currentUser.email ?? "",
          userName: workspace?.currentUser.full_name ?? "Workspace User",
        }}
        sidebar={sidebarNode}
        header={headerNode}
        footer={footerNode}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuOpenChange={setMobileMenuOpen}
        mobileBottomNav={
          <MobileBottomNav
            activeSection={section}
            userRole={workspace?.currentUser.role}
            onSelectSection={handleSelectSection}
          />
        }
      >
        {mainContentNode}
        {isAuthenticated && workspace && (
          <Suspense fallback={null}>
            <SupportChatWidget
              orgId={workspace.organization.id}
              userId={workspace.currentUser.id}
            />
          </Suspense>
        )}
        <OfflineIndicator onOpenOfflinePage={openOfflinePage} />
      </DashboardLayout>
    </Suspense>
  );
}
