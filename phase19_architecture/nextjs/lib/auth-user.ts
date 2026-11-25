import crypto from "node:crypto";

export interface UserPlaneJwtPayload {
  sub: string;
  current_user_id: string;
  orgId: string;
  role: string;
  aud: "apex:user";
  jti: string;
  iat: number;
  exp: number;
}

export const USER_SESSION_COOKIE_NAME = "apex_user_session";

function getUserJwtSecret(): string {
  const secret = process.env.USER_JWT_SECRET;
  if (!secret) {
    throw new Error("USER_JWT_SECRET environment variable is required.");
  }
  return secret;
}

export function issueUserPlaneJwt(input: {
  userId: string;
  orgId: string;
  role: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 86400;
  const payload: UserPlaneJwtPayload = {
    sub: input.userId,
    current_user_id: input.userId,
    orgId: input.orgId,
    role: input.role,
    aud: "apex:user",
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttl,
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getUserJwtSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function buildUserSessionCookieHeader(jwt: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const domainAttr = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : "";
  const secureAttr = isProd ? "; Secure" : "";
  return `${USER_SESSION_COOKIE_NAME}=${encodeURIComponent(jwt)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureAttr}${domainAttr}`;
}
