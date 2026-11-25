import crypto from "node:crypto";
import { cookies } from "next/headers";

export const USER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 604,800s (7 days)
export const USER_SESSION_COOKIE_NAME = "apex_user_session";

export interface RedisUserSessionRecord {
  sessionId: string;
  userId: string;
  orgId: string;
  role: string;
  onboardingCompleted: boolean;
  createdAt: string;
  lastSeenAt: string;
}

function getUpstashConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required.");
  }
  return { url, token };
}

function hashSessionId(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

export async function createRedisUserSession(input: {
  userId: string;
  orgId: string;
  role: string;
  onboardingCompleted: boolean;
}): Promise<{ sessionId: string; record: RedisUserSessionRecord }> {
  const { url, token } = getUpstashConfig();
  const sessionId = crypto.randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const record: RedisUserSessionRecord = {
    sessionId,
    userId: input.userId,
    orgId: input.orgId,
    role: input.role,
    onboardingCompleted: input.onboardingCompleted,
    createdAt: now,
    lastSeenAt: now,
  };
  const key = `session:user:${hashSessionId(sessionId)}`;
  await fetch(
    `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(record))}/EX/${USER_SESSION_TTL_SECONDS}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );
  return { sessionId, record };
}

export async function getAndRefreshRedisUserSession(
  sessionId?: string | null
): Promise<RedisUserSessionRecord | null> {
  if (!sessionId) return null;
  const { url, token } = getUpstashConfig();
  const key = `session:user:${hashSessionId(sessionId)}`;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: string | null };
  if (!body.result) return null;

  const parsed = JSON.parse(body.result) as RedisUserSessionRecord;
  parsed.lastSeenAt = new Date().toISOString();
  void fetch(`${url}/expire/${encodeURIComponent(key)}/${USER_SESSION_TTL_SECONDS}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return parsed;
}

export async function readCurrentNextUserSession(): Promise<RedisUserSessionRecord | null> {
  const store = await cookies();
  const sid = store.get(USER_SESSION_COOKIE_NAME)?.value;
  return getAndRefreshRedisUserSession(sid);
}

export async function revokeRedisUserSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const { url, token } = getUpstashConfig();
  const key = `session:user:${hashSessionId(sessionId)}`;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
