import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { USER_SESSION_COOKIE_NAME } from "../../../../lib/auth-user";
import { revokeJwtWithRemainingTtl } from "../../../../lib/jwt-blocklist";

function verifyAndDecodeUserJwt(token: string): { sub: string; jti: string; exp: number } | null {
  try {
    const secret = process.env.USER_JWT_SECRET || "";
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
    if (claims.aud !== "apex:user" || !claims.sub || !claims.jti || !claims.exp) return null;
    return { sub: claims.sub, jti: claims.jti, exp: claims.exp };
  } catch {
    return null;
  }
}

async function handleUserPlaneLogout(request: NextRequest, status: 302 | 303): Promise<NextResponse> {
  const rawToken =
    request.cookies.get(USER_SESSION_COOKIE_NAME)?.value ||
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")!.slice("Bearer ".length).trim()
      : "");

  if (rawToken) {
    const claims = verifyAndDecodeUserJwt(rawToken);
    if (claims) {
      await revokeJwtWithRemainingTtl({
        jti: claims.jti,
        plane: "user",
        sub: claims.sub,
        exp: claims.exp,
      });
    }
  }

  // Strictly destroy ONLY apex_user_session; NEVER touch apex_admin_session
  const response = NextResponse.redirect(new URL("/", request.url), status);
  const isProd = process.env.NODE_ENV === "production";
  const domainAttr = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : "";
  const secureAttr = isProd ? "; Secure" : "";
  response.headers.set(
    "Set-Cookie",
    `${USER_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttr}${domainAttr}`
  );
  response.headers.set("X-Security-Plane", "user");
  return response;
}

export async function POST(request: NextRequest) {
  return handleUserPlaneLogout(request, 303);
}

export async function GET(request: NextRequest) {
  return handleUserPlaneLogout(request, 302);
}
