import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/qa", "/sales-agent"];
const SESSION_COOKIE_NAME = "apex_session";

interface SessionClaims {
  sub?: string;
  orgId?: string;
  subscriptionTier?: "trial" | "starter" | "pro" | "agency" | "growth" | "enterprise_whitelabel";
  trialEndsAt?: string | null;
  monthlyTaskCount?: number;
  exp?: number;
}

function decodeJwtPayload(token: string): SessionClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as SessionClaims;
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 1. Logout Flow: clear JWT cookies and redirect cleanly to /login
  if (pathname === "/logout" || searchParams.get("logout") === "1") {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set("apex_refresh", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = rawToken ? decodeJwtPayload(rawToken) : null;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // 2. Authentication Gate
  if (isProtected && !session?.sub) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (rawToken) response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // 3. Phase 9 Trial Expiration & 3-Task Quota Gate
  if (isProtected && session?.subscriptionTier === "trial") {
    const trialExpired =
      Boolean(session.trialEndsAt) &&
      Date.parse(session.trialEndsAt as string) <= Date.now();
    const quotaExceeded = (session.monthlyTaskCount ?? 0) >= 3;

    if (trialExpired || quotaExceeded) {
      const pricingUrl = new URL("/pricing", request.url);
      pricingUrl.searchParams.set(
        "toast",
        "Upgrade to continue using the Apex Copilot."
      );
      return NextResponse.redirect(pricingUrl);
    }
  }

  // 4. Redirect signed-in users away from /login
  if (pathname === "/login" && session?.sub) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  if (session?.sub) requestHeaders.set("x-user-id", session.sub);
  if (session?.orgId) requestHeaders.set("x-org-id", session.orgId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/qa/:path*",
    "/sales-agent/:path*",
    "/pricing",
    "/login",
    "/logout",
  ],
};
