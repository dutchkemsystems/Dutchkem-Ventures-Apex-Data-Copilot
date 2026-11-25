import crypto from "node:crypto";

export type BlocklistPlane = "user" | "admin";

export interface JwtBlocklistEntry {
  key: string;
  jti: string;
  plane: BlocklistPlane;
  sub: string;
  exp: number;
  ttlSeconds: number;
  revokedAt: string;
  expiresAtMs: number;
  reason: string;
  backend: "redis" | "memory_ttl";
}

export class JwtBlocklistStore {
  private readonly entries = new Map<string, JwtBlocklistEntry>();

  private purgeExpired(nowMs = Date.now()): void {
    for (const [jti, entry] of this.entries.entries()) {
      if (entry.expiresAtMs <= nowMs) {
        this.entries.delete(jti);
      }
    }
  }

  public revokeToken(input: {
    jti: string;
    plane: BlocklistPlane;
    sub: string;
    exp?: number;
    reason?: string;
  }): JwtBlocklistEntry {
    const nowSec = Math.floor(Date.now() / 1000);
    const defaultTtl = input.plane === "admin" ? 14400 : 86400;
    const expSec = typeof input.exp === "number" && input.exp > 0 ? input.exp : nowSec + defaultTtl;
    const remainingTtlSeconds = Math.max(1, expSec - nowSec);
    const key = `blocklist:jwt:${input.plane}:${input.jti}`;
    const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
    const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
    const hasRedisRest = Boolean(redisUrl && redisToken);

    const entry: JwtBlocklistEntry = {
      key,
      jti: input.jti,
      plane: input.plane,
      sub: input.sub,
      exp: expSec,
      ttlSeconds: remainingTtlSeconds,
      revokedAt: new Date().toISOString(),
      expiresAtMs: Date.now() + remainingTtlSeconds * 1000,
      reason: input.reason || `${input.plane}_logout`,
      backend: hasRedisRest ? "redis" : "memory_ttl",
    };

    this.purgeExpired();
    this.entries.set(input.jti, entry);

    if (hasRedisRest) {
      const payloadValue = JSON.stringify({
        jti: entry.jti,
        plane: entry.plane,
        sub: entry.sub,
        reason: entry.reason,
        revokedAt: entry.revokedAt,
        nonce: crypto.randomBytes(6).toString("hex"),
      });
      const endpoint = `${redisUrl.replace(/\/$/, "")}/set/${encodeURIComponent(key)}/${encodeURIComponent(payloadValue)}/EX/${remainingTtlSeconds}`;
      void fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
        },
        signal: AbortSignal.timeout(3000),
      }).catch(() => {
        entry.backend = "memory_ttl";
      });
    }

    return entry;
  }

  public isBlocked(jti: string): boolean {
    const entry = this.entries.get(jti);
    if (!entry) return false;
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(jti);
      return false;
    }
    return true;
  }

  public getEntry(jti: string): JwtBlocklistEntry | null {
    if (!this.isBlocked(jti)) return null;
    return this.entries.get(jti) || null;
  }

  public getStats(): {
    activeBlockedCount: number;
    userBlockedCount: number;
    adminBlockedCount: number;
    backend: "redis" | "memory_ttl";
    entries: Array<Omit<JwtBlocklistEntry, "expiresAtMs">>;
  } {
    this.purgeExpired();
    const all = Array.from(this.entries.values());
    const hasRedis = Boolean(
      (process.env.UPSTASH_REDIS_REST_URL || "").trim() &&
        (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()
    );
    return {
      activeBlockedCount: all.length,
      userBlockedCount: all.filter((e) => e.plane === "user").length,
      adminBlockedCount: all.filter((e) => e.plane === "admin").length,
      backend: hasRedis ? "redis" : "memory_ttl",
      entries: all.slice(0, 50).map(({ expiresAtMs: _expiresAtMs, ...rest }) => rest),
    };
  }
}
