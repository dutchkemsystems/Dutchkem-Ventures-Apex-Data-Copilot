import crypto from "node:crypto";

export type AdminRole = "super_admin" | "finance" | "dpo";

export interface AdminPlaneJwtPayload {
  sub: string;
  admin_id: string;
  role: AdminRole;
  totp_verified: true;
  aud: "apex:admin";
  jti: string;
  iat: number;
  exp: number;
}

export interface SignedAdminInvitePayload {
  inviteId: string;
  email: string;
  role: AdminRole;
  invitedByAdminId: string;
  aud: "apex:admin_invite";
  iat: number;
  exp: number;
}

export const ADMIN_SESSION_COOKIE_NAME = "apex_admin_session";

function getAdminJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error("ADMIN_JWT_SECRET environment variable is required.");
  }
  return secret;
}

export function issueAdminPlaneJwt(input: {
  adminId: string;
  role: AdminRole;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 14400;
  const payload: AdminPlaneJwtPayload = {
    sub: input.adminId,
    admin_id: input.adminId,
    role: input.role,
    totp_verified: true,
    aud: "apex:admin",
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttl,
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getAdminJwtSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function buildAdminSessionCookieHeader(jwt: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const domainAttr = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : "";
  const secureAttr = isProd ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(jwt)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=14400${secureAttr}${domainAttr}`;
}

export function signAdminInviteToken(input: {
  inviteId: string;
  email: string;
  role: AdminRole;
  invitedByAdminId: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedAdminInvitePayload = {
    inviteId: input.inviteId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    invitedByAdminId: input.invitedByAdminId,
    aud: "apex:admin_invite",
    iat: now,
    exp: now + (input.ttlSeconds ?? 86400),
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getAdminJwtSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}
