import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME } from "../../../../lib/auth-admin";
import { revokeJwtWithRemainingTtl } from "../../../../lib/jwt-blocklist";

function verifyAndDecodeAdminJwt(token: string): { sub: string; jti: string; exp: number } | null {
  try {
    const secret = process.env.ADMIN_JWT_SECRET || "";
    if (!secret) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    if (
      sigB64.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig))
    ) {
      return null;
    }
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      sub?: string;
      aud?: string;
      jti?: string;
      exp?: number;
    };
    if (claims.aud !== "apex:admin" || !claims.sub || !claims.jti || !claims.exp) return null;
    return { sub: claims.sub, jti: claims.jti, exp: claims.exp };
  } catch {
    return null;
  }
}

async function handleAdminPlaneLogout(request: NextRequest, status: 302 | 303): Promise<NextResponse> {
  const rawToken =
    request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ||
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")!.slice("Bearer ".length).trim()
      : "");

  if (rawToken) {
    const claims = verifyAndDecodeAdminJwt(rawToken);
    if (claims) {
      await revokeJwtWithRemainingTtl({
        jti: claims.jti,
        plane: "admin",
        sub: claims.sub,
        exp: claims.exp,
      });
    }
  }

  // Strictly destroy ONLY apex_admin_session (Path=/admin); NEVER affect apex_user_session
  const response = NextResponse.redirect(new URL("/admin/login", request.url), status);
  const isProd = process.env.NODE_ENV === "production";
  const domainAttr = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : "";
  const secureAttr = isProd ? "; Secure" : "";
  response.headers.set(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttr}${domainAttr}`
  );
  response.headers.set("X-Security-Plane", "admin");
  return response;
}

export async function POST(request: NextRequest) {
  return handleAdminPlaneLogout(request, 303);
}

export async function GET(request: NextRequest) {
  return handleAdminPlaneLogout(request, 302);
}
