import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 20D Next.js 15 Edge Middleware
 * - Preserves Phase 19 Three-Plane Isolation (Public / User / Admin)
 * - Enforces users.onboarding_completed === true before granting access to /dashboard/*
 */

const USER_COOKIE = "apex_user_session";
const ADMIN_COOKIE = "apex_admin_session";

interface UserJwtPayload {
  sub: string;
  aud: "apex:user" | "apex:admin";
  orgId?: string;
  role?: string;
  onboardingCompleted?: boolean;
  exp?: number;
}

const PUBLIC_PATHS = new Set(["/", "/pricing", "/jobs-board", "/login", "/signup", "/forgot-password", "/reset-password"]);
const PUBLIC_PREFIXES = ["/blog/", "/legal/", "/jobs/", "/ref/"];
const ONBOARDING_EXEMPT_PREFIXES = ["/onboarding", "/api/onboarding", "/api/auth"];

function base64UrlDecodeJson(segment: string): Partial<UserJwtPayload> | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const binary = atob(normalized + pad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Partial<UserJwtPayload>;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")
  ) {
    return NextResponse.next();
  }

  const rawUserToken = request.cookies.get(USER_COOKIE)?.value || "";
  const rawAdminToken = request.cookies.get(ADMIN_COOKIE)?.value || "";

  // User Plane routes (/dashboard/*, /onboarding) require valid User session
  const isProtectedDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isOnboardingRoute = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  if ((isProtectedDashboard || isOnboardingRoute) && !rawUserToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (rawUserToken) {
    const parts = rawUserToken.split(".");
    const claims = parts.length === 3 ? base64UrlDecodeJson(parts[1]) : null;

    if (!claims || claims.aud !== "apex:user") {
      if (rawAdminToken && isProtectedDashboard) {
        return NextResponse.json({ error: "CROSS_PLANE_FORBIDDEN" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Phase 20D Onboarding Gate: Check server session / claims.onboardingCompleted
    const isExempt = ONBOARDING_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
    let onboardingCompleted = claims.onboardingCompleted;

    if (onboardingCompleted === undefined && !isExempt) {
      try {
        const statusRes = await fetch(new URL("/api/onboarding/status", request.url), {
          headers: { cookie: request.headers.get("cookie") || "" },
        });
        if (statusRes.ok) {
          const statusBody = (await statusRes.json()) as { onboarding_completed?: boolean };
          onboardingCompleted = statusBody.onboarding_completed;
        }
      } catch {
        onboardingCompleted = true;
      }
    }

    if (onboardingCompleted === false && !isExempt) {
      const onboardingUrl = new URL("/onboarding", request.url);
      onboardingUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(onboardingUrl);
    }

    if (onboardingCompleted === true && isOnboardingRoute) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/onboarding/:path*", "/api/user/:path*"],
};
