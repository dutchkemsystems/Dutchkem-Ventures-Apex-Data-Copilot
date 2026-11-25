import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/pricing"];
const SESSION_COOKIE_NAME = "apex_session";

function decodeJwtPayload(token: string): { sub?: string; orgId?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json) as { sub?: string; orgId?: string; exp?: number };
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

  // 1. Dedicated Logout Flow: destroy JWT cookies and redirect cleanly to /login
  if (pathname === "/logout" || searchParams.get("logout") === "1") {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
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

  // 2. Protected Dashboard & Settings Route Guard
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = rawToken ? decodeJwtPayload(rawToken) : null;

  if (isProtected && !session?.sub) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (rawToken) {
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  // 3. Redirect already-authenticated users away from /login
  if (pathname === "/login" && session?.sub) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  // Forward verified tenant claims in internal request headers
  const requestHeaders = new Headers(request.headers);
  if (session?.sub) requestHeaders.set("x-user-id", session.sub);
  if (session?.orgId) requestHeaders.set("x-org-id", session.orgId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/pricing/:path*", "/login", "/logout"],
};
