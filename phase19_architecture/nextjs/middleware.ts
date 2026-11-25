import { NextResponse, type NextRequest } from "next/server";

export type SecurityPlane = "public" | "user" | "admin";

interface VerifiedPlaneJwt {
  sub: string;
  aud: "apex:user" | "apex:admin";
  orgId?: string;
  role?: string;
  jti?: string;
  exp?: number;
}

const ADMIN_COOKIE = "apex_admin_session";
const USER_COOKIE = "apex_user_session";

const PUBLIC_EXACT_ROUTES = new Set(["/", "/pricing", "/jobs-board"]);
const PUBLIC_PREFIX_ROUTES = ["/blog/", "/legal/", "/jobs/", "/ref/"];
const USER_AUTH_ROUTES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);
const ADMIN_AUTH_ROUTES = new Set([
  "/admin/login",
  "/admin/2fa",
  "/admin/api/auth/login",
  "/admin/api/auth/2fa",
  "/admin/api/auth/accept-invite",
]);

function isAdminInviteAcceptanceRequest(request: NextRequest): boolean {
  return (
    request.nextUrl.pathname === "/admin/users/invite" &&
    request.nextUrl.searchParams.has("token")
  );
}

function classifyPlane(pathname: string): SecurityPlane {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return "admin";
  }
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/user")) {
    return "user";
  }
  return "public";
}

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIX_ROUTES.some((prefix) => pathname.startsWith(prefix));
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtUnverified(token: string): Partial<VerifiedPlaneJwt> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const jsonBytes = base64UrlToBytes(parts[1]);
    return JSON.parse(new TextDecoder().decode(jsonBytes)) as Partial<VerifiedPlaneJwt>;
  } catch {
    return null;
  }
}

async function verifyPlaneJwt(
  token: string,
  expectedAud: "apex:user" | "apex:admin",
  secret: string
): Promise<VerifiedPlaneJwt | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !secret) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = base64UrlToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      sigBytes,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64))
    ) as Partial<VerifiedPlaneJwt>;

    if (!payload.sub || payload.aud !== expectedAud) {
      return null;
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return payload as VerifiedPlaneJwt;
  } catch {
    return null;
  }
}

async function logSecurityEvent(
  request: NextRequest,
  event: {
    kind: "audit" | "incident";
    incidentType?: "cross_plane_attempt" | "invalid_jwt_audience";
    plane: SecurityPlane;
    sourcePlane?: SecurityPlane;
    targetPlane?: SecurityPlane;
    userId?: string;
    action: string;
    result: "allowed" | "denied" | "redirected" | "blocked_403";
  }
) {
  try {
    const internalSecret = process.env.CRON_SECRET || process.env.ADMIN_JWT_SECRET || "";
    const endpoint =
      event.kind === "incident"
        ? "/api/internal/security-incidents"
        : "/api/internal/security-audit";

    await fetch(new URL(endpoint, request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-security-key": internalSecret,
      },
      body: JSON.stringify({
        ...event,
        route: request.nextUrl.pathname,
        method: request.method,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Non-blocking audit telemetry dispatch
  }
}

function applySecurityHeaders(response: NextResponse, plane: SecurityPlane): NextResponse {
  const hstsMaxAge = process.env.HSTS_MAX_AGE || "63072000";
  response.headers.set(
    "Strict-Transport-Security",
    `max-age=${hstsMaxAge}; includeSubDomains; preload`
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Security-Plane", plane);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Enforce HTTPS redirect on all plain HTTP traffic outside localhost dev loopback
  const forwardedProto = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  const isLocalHost =
    request.nextUrl.hostname === "localhost" ||
    request.nextUrl.hostname === "127.0.0.1" ||
    request.nextUrl.hostname === "::1";
  const isPlainHttp = forwardedProto === "http" || (!forwardedProto && request.nextUrl.protocol === "http:");
  if (isPlainHttp && !isLocalHost) {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = "https:";
    const redirectRes = NextResponse.redirect(httpsUrl, 308);
    return applySecurityHeaders(redirectRes, classifyPlane(pathname));
  }

  const plane = classifyPlane(pathname);
  const adminSecret = process.env.ADMIN_JWT_SECRET || "";
  const userSecret = process.env.USER_JWT_SECRET || "";

  const rawAdminCookie = request.cookies.get(ADMIN_COOKIE)?.value || "";
  const rawUserCookie = request.cookies.get(USER_COOKIE)?.value || "";
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  // 1. Public Plane: /, /pricing, /blog/*, /legal/* and auth entry routes
  if (
    plane === "public" &&
    (isPublicRoute(pathname) || USER_AUTH_ROUTES.has(pathname))
  ) {
    return applySecurityHeaders(NextResponse.next(), "public");
  }

  if (ADMIN_AUTH_ROUTES.has(pathname) || isAdminInviteAcceptanceRequest(request)) {
    return applySecurityHeaders(NextResponse.next(), "admin");
  }

  // 2. Admin Plane Guard (/admin/*, /api/admin/*)
  if (plane === "admin") {
    const candidateAdminToken = rawAdminCookie || bearerToken;
    const verifiedAdmin = candidateAdminToken
      ? await verifyPlaneJwt(candidateAdminToken, "apex:admin", adminSecret)
      : null;

    if (!verifiedAdmin) {
      // Cross-plane detection: check if a User token (apex:user) is being used on /admin
      const userSessionClaims = rawUserCookie
        ? await verifyPlaneJwt(rawUserCookie, "apex:user", userSecret)
        : null;
      const unverifiedAdminClaims = candidateAdminToken
        ? decodeJwtUnverified(candidateAdminToken)
        : null;
      const unverifiedBearerClaims = bearerToken ? decodeJwtUnverified(bearerToken) : null;

      const isCrossPlaneAttempt =
        Boolean(userSessionClaims) ||
        unverifiedAdminClaims?.aud === "apex:user" ||
        unverifiedBearerClaims?.aud === "apex:user";

      if (isCrossPlaneAttempt) {
        await logSecurityEvent(request, {
          kind: "incident",
          incidentType: "cross_plane_attempt",
          plane: "admin",
          sourcePlane: "user",
          targetPlane: "admin",
          userId:
            userSessionClaims?.sub ||
            unverifiedAdminClaims?.sub ||
            unverifiedBearerClaims?.sub,
          action: "CROSS_PLANE_ADMIN_ACCESS",
          result: "blocked_403",
        });

        return applySecurityHeaders(
          NextResponse.json(
            {
              error: "CROSS_PLANE_FORBIDDEN",
              detail:
                "Security incident logged: User-plane credentials (aud='apex:user') are strictly forbidden on Admin routes.",
            },
            { status: 403 }
          ),
          "admin"
        );
      }

      await logSecurityEvent(request, {
        kind: "audit",
        plane: "admin",
        action: "ADMIN_UNAUTHENTICATED_ACCESS",
        result: pathname.startsWith("/api/admin") ? "denied" : "redirected",
      });

      if (pathname.startsWith("/api/admin")) {
        return applySecurityHeaders(
          NextResponse.json(
            { detail: "Missing or invalid apex_admin_session (aud='apex:admin')." },
            { status: 401 }
          ),
          "admin"
        );
      }

      const adminLoginUrl = new URL("/admin/login", request.url);
      adminLoginUrl.searchParams.set("next", pathname);
      const res = NextResponse.redirect(adminLoginUrl);
      if (rawAdminCookie) res.cookies.delete(ADMIN_COOKIE);
      return applySecurityHeaders(res, "admin");
    }

    await logSecurityEvent(request, {
      kind: "audit",
      plane: "admin",
      userId: verifiedAdmin.sub,
      action: "ADMIN_ROUTE_ACCESS",
      result: "allowed",
    });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-plane", "admin");
    requestHeaders.set("x-admin-id", verifiedAdmin.sub);
    requestHeaders.set("x-admin-role", verifiedAdmin.role || "admin");

    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      "admin"
    );
  }

  // 3. User Plane Guard (/dashboard/*, /api/user/*)
  if (plane === "user") {
    const candidateUserToken = rawUserCookie || bearerToken;
    const verifiedUser = candidateUserToken
      ? await verifyPlaneJwt(candidateUserToken, "apex:user", userSecret)
      : null;

    if (!verifiedUser) {
      const candidateClaims = candidateUserToken
        ? decodeJwtUnverified(candidateUserToken)
        : null;
      if (candidateClaims?.aud === "apex:admin") {
        await logSecurityEvent(request, {
          kind: "incident",
          incidentType: "cross_plane_attempt",
          plane: "user",
          sourcePlane: "admin",
          targetPlane: "user",
          userId: candidateClaims.sub,
          action: "ADMIN_TOKEN_ON_USER_PLANE",
          result: "blocked_403",
        });
        return applySecurityHeaders(
          NextResponse.json(
            {
              error: "CROSS_PLANE_FORBIDDEN",
              detail: "Admin-plane token cannot be presented on User-plane credentials.",
            },
            { status: 403 }
          ),
          "user"
        );
      }

      if (pathname.startsWith("/api/user")) {
        return applySecurityHeaders(
          NextResponse.json(
            { detail: "Missing or invalid apex_user_session (aud='apex:user')." },
            { status: 401 }
          ),
          "user"
        );
      }

      const userLoginUrl = new URL("/login", request.url);
      userLoginUrl.searchParams.set("next", pathname);
      const res = NextResponse.redirect(userLoginUrl);
      if (rawUserCookie) res.cookies.delete(USER_COOKIE);
      return applySecurityHeaders(res, "user");
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-plane", "user");
    requestHeaders.set("x-user-id", verifiedUser.sub);
    if (verifiedUser.orgId) requestHeaders.set("x-org-id", verifiedUser.orgId);

    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      "user"
    );
  }

  return applySecurityHeaders(NextResponse.next(), "public");
}

export const config = {
  matcher: [
    "/",
    "/pricing",
    "/blog/:path*",
    "/legal/:path*",
    "/jobs-board",
    "/jobs/:path*",
    "/ref/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/dashboard/:path*",
    "/api/user/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
