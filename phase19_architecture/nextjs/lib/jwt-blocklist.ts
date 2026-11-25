export type PlaneScope = "user" | "admin";

export interface BlocklistRecord {
  key: string;
  jti: string;
  plane: PlaneScope;
  sub: string;
  ttlSeconds: number;
  revokedAt: string;
}

const fallbackBlocklist = new Map<string, number>();

export async function revokeJwtWithRemainingTtl(input: {
  jti: string;
  plane: PlaneScope;
  sub: string;
  exp?: number;
}): Promise<BlocklistRecord> {
  const nowSec = Math.floor(Date.now() / 1000);
  const defaultTtl = input.plane === "admin" ? 14400 : 86400;
  const expSec = typeof input.exp === "number" && input.exp > 0 ? input.exp : nowSec + defaultTtl;
  const ttlSeconds = Math.max(1, expSec - nowSec);
  const key = `blocklist:jwt:${input.plane}:${input.jti}`;
  const revokedAt = new Date().toISOString();

  fallbackBlocklist.set(key, Date.now() + ttlSeconds * 1000);

  const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (redisUrl && redisToken) {
    const value = JSON.stringify({ jti: input.jti, plane: input.plane, sub: input.sub, revokedAt });
    const endpoint = `${redisUrl.replace(/\/$/, "")}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${ttlSeconds}`;
    await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken}` },
    }).catch(() => {});
  }

  return {
    key,
    jti: input.jti,
    plane: input.plane,
    sub: input.sub,
    ttlSeconds,
    revokedAt,
  };
}

export async function isJwtBlocklisted(jti: string, plane: PlaneScope): Promise<boolean> {
  const key = `blocklist:jwt:${plane}:${jti}`;
  const localExp = fallbackBlocklist.get(key);
  if (localExp && localExp > Date.now()) {
    return true;
  }
  if (localExp && localExp <= Date.now()) {
    fallbackBlocklist.delete(key);
  }

  const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl.replace(/\/$/, "")}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { result?: unknown };
        if (body.result !== null && body.result !== undefined) return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}
