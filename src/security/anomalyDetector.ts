import crypto from "node:crypto";
import type express from "express";

export const ANOMALY_SCORE_BLOCK_THRESHOLD = Math.max(
  1,
  Math.min(100, Number(process.env.ANOMALY_SCORE_BLOCK_THRESHOLD || "80") || 80)
);
export const IMPOSSIBLE_TRAVEL_DISTANCE_KM = Math.max(
  50,
  Number(process.env.IMPOSSIBLE_TRAVEL_KM || "500") || 500
);
export const IMPOSSIBLE_TRAVEL_WINDOW_MINUTES = Math.max(
  5,
  Number(process.env.IMPOSSIBLE_TRAVEL_MINUTES || "60") || 60
);

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  countryCode: string;
  city: string;
}

export interface IpReputationAssessment {
  ipAddress: string;
  rawScore: number; // 0 (clean) -> 100 (known attacker)
  provider: "ipqualityscore" | "abuseipdb" | "local_threat_intel" | "fail_closed";
  isProxyOrTor: boolean;
  countryCode: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface AnomalyScoreBreakdown {
  ipReputation: number; // 0 - 40
  geoAnomaly: number; // 0 - 25
  userAgentDrift: number; // 0 - 15
  rateDeviation: number; // 0 - 20
}

export interface AnomalyEvaluationResult {
  id: string;
  score: number;
  blocked: boolean;
  requiresCaptcha: boolean;
  captchaCleared: boolean;
  breakdown: AnomalyScoreBreakdown;
  reasons: string[];
  ipReputation: IpReputationAssessment;
  geoLocation: GeoCoordinates;
  userAgentFamily: string;
  requestsLastMinute: number;
  baselineRequestsPerMinute: number;
  evaluatedAt: string;
  actorPlane: "public" | "user" | "admin";
  actorId: string | null;
  route: string;
}

export interface ActorLoginGeoAnchor {
  actorKey: string;
  actorPlane: "user" | "admin";
  actorId: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  userAgentFamily: string;
  geo: GeoCoordinates;
  loggedInAtMs: number;
  loggedInAt: string;
}

export interface ImpossibleTravelCheckResult {
  allowed: boolean;
  triggered: boolean;
  distanceKm: number | null;
  elapsedMinutes: number | null;
  previousAnchor: ActorLoginGeoAnchor | null;
  attemptedGeo: GeoCoordinates;
  requiresReauthentication: boolean;
}

export interface CaptchaChallengeRecord {
  challengeToken: string;
  promptQuestion: string;
  expectedAnswerHash: string;
  ipAddress: string;
  userAgentHash: string;
  expiresAtMs: number;
  provider: "turnstile" | "signed_challenge";
}

interface HighRiskIpEntry {
  rawScore: number;
  countryCode: string;
  city: string;
  latitude: number;
  longitude: number;
}

const KNOWN_THREAT_IPS: Record<string, HighRiskIpEntry> = {
  "185.220.101.1": {
    rawScore: 98,
    countryCode: "DE",
    city: "Frankfurt (TOR Exit)",
    latitude: 50.1109,
    longitude: 8.6821,
  },
  "185.220.102.240": {
    rawScore: 96,
    countryCode: "NL",
    city: "Amsterdam (TOR Exit)",
    latitude: 52.3676,
    longitude: 4.9041,
  },
  "45.155.205.91": {
    rawScore: 94,
    countryCode: "RU",
    city: "Moscow (Scanner ASN)",
    latitude: 55.7558,
    longitude: 37.6173,
  },
  "194.26.135.22": {
    rawScore: 91,
    countryCode: "BG",
    city: "Sofia (Credential Stuffing)",
    latitude: 42.6977,
    longitude: 23.3219,
  },
  "103.214.112.14": {
    rawScore: 89,
    countryCode: "SG",
    city: "Singapore (Botnet Proxy)",
    latitude: 1.3521,
    longitude: 103.8198,
  },
};

const SAFE_LOCAL_GEO: GeoCoordinates = {
  latitude: 52.3676,
  longitude: 4.9041,
  countryCode: "NL",
  city: "Amsterdam",
};

const KNOWN_CITY_COORDS: Record<string, GeoCoordinates> = {
  amsterdam: { latitude: 52.3676, longitude: 4.9041, countryCode: "NL", city: "Amsterdam" },
  london: { latitude: 51.5072, longitude: -0.1276, countryCode: "GB", city: "London" },
  lagos: { latitude: 6.5244, longitude: 3.3792, countryCode: "NG", city: "Lagos" },
  abuja: { latitude: 9.0765, longitude: 7.3986, countryCode: "NG", city: "Abuja" },
  newyork: { latitude: 40.7128, longitude: -74.006, countryCode: "US", city: "New York" },
  sanfrancisco: { latitude: 37.7749, longitude: -122.4194, countryCode: "US", city: "San Francisco" },
  tokyo: { latitude: 35.6762, longitude: 139.6503, countryCode: "JP", city: "Tokyo" },
  singapore: { latitude: 1.3521, longitude: 103.8198, countryCode: "SG", city: "Singapore" },
  moscow: { latitude: 55.7558, longitude: 37.6173, countryCode: "RU", city: "Moscow" },
};

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371.0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function normalizeUserAgentFamily(userAgent: string): string {
  const ua = (userAgent || "").toLowerCase();
  if (
    ua.includes("sqlmap") ||
    ua.includes("masscan") ||
    ua.includes("nuclei") ||
    ua.includes("nikto") ||
    ua.includes("python-requests") ||
    ua.includes("curl/") ||
    ua.includes("zgrab")
  ) {
    return "automated_scanner";
  }
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("chrome/") && ua.includes("safari/")) return "chrome";
  if (ua.includes("firefox/")) return "firefox";
  if (ua.includes("safari/")) return "safari";
  if (ua.includes("node") || ua.includes("undici") || ua.includes("axios")) {
    return "node_sdk";
  }
  return "browser_generic";
}

function hashValue(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, "").trim();
  return (
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "localhost" ||
    clean === "unknown" ||
    clean.startsWith("10.") ||
    clean.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(clean)
  );
}

export class ZeroTrustAnomalyService {
  private readonly ipqsKey: string;
  private readonly abuseIpDbKey: string;
  private readonly turnstileSecretKey: string;
  private readonly strictFailClosed: boolean;
  private readonly signingSecret: string;

  private readonly reputationCache = new Map<
    string,
    { result: IpReputationAssessment; expiresAtMs: number }
  >();
  private readonly loginGeoHistory = new Map<string, ActorLoginGeoAnchor>();
  private readonly requestBuckets = new Map<string, number[]>();
  private readonly rateBaselines = new Map<string, number>();
  private readonly activeChallenges = new Map<string, CaptchaChallengeRecord>();
  private readonly verifiedClearances = new Map<
    string,
    { ipAddress: string; userAgentHash: string; expiresAtMs: number }
  >();
  private readonly blockedIps = new Map<
    string,
    { ipAddress: string; score: number; blockedAt: string; reason: string }
  >();
  private readonly reauthChallenges = new Map<
    string,
    {
      actorPlane: "user" | "admin";
      actorId: string;
      geo: GeoCoordinates;
      ipAddress: string;
      userAgent: string;
      expiresAtMs: number;
    }
  >();
  private readonly recentAssessments: AnomalyEvaluationResult[] = [];

  constructor() {
    this.ipqsKey = (process.env.IPQS_API_KEY || "").trim();
    this.abuseIpDbKey = (process.env.ABUSEIPDB_API_KEY || "").trim();
    this.turnstileSecretKey = (process.env.TURNSTILE_SECRET_KEY || "").trim();
    this.strictFailClosed = process.env.ANOMALY_FAIL_CLOSED === "strict";
    this.signingSecret =
      process.env.SESSION_SIGNING_SECRET ||
      crypto.createHash("sha256").update("dutchkem-zero-trust-anomaly-secret").digest("hex");
  }

  public getProviderStatus() {
    return {
      ipQualityScoreConfigured: Boolean(this.ipqsKey),
      abuseIpDbConfigured: Boolean(this.abuseIpDbKey),
      turnstileConfigured: Boolean(this.turnstileSecretKey),
      activeProvider: this.ipqsKey
        ? "ipqualityscore"
        : this.abuseIpDbKey
          ? "abuseipdb"
          : "local_threat_intel",
      failClosedStrict: this.strictFailClosed,
      anomalyBlockThreshold: ANOMALY_SCORE_BLOCK_THRESHOLD,
      impossibleTravelKm: IMPOSSIBLE_TRAVEL_DISTANCE_KM,
      impossibleTravelMinutes: IMPOSSIBLE_TRAVEL_WINDOW_MINUTES,
      trackedLoginAnchorsCount: this.loginGeoHistory.size,
      blockedIpsCount: this.blockedIps.size,
    };
  }

  public extractClientIp(req: express.Request): string {
    const testIp = req.header("x-anomaly-test-ip");
    if (testIp?.trim()) return testIp.trim();
    const cfIp = req.header("cf-connecting-ip");
    if (cfIp?.trim()) return cfIp.trim();
    const xff = req.header("x-forwarded-for");
    if (xff?.trim()) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    return (req.ip || req.socket.remoteAddress || "127.0.0.1").replace(/^::ffff:/, "");
  }

  public extractGeoFromRequest(
    req: express.Request,
    fallback?: Partial<GeoCoordinates>
  ): GeoCoordinates {
    const cityHeader = (
      req.header("x-geo-city") ||
      req.header("x-vercel-ip-city") ||
      fallback?.city ||
      ""
    ).trim();
    const normalizedCityKey = cityHeader.toLowerCase().replace(/\s+/g, "");
    const knownCity = normalizedCityKey ? KNOWN_CITY_COORDS[normalizedCityKey] : undefined;

    const rawLat =
      req.header("x-geo-lat") ||
      req.header("x-vercel-ip-latitude") ||
      (fallback?.latitude !== undefined ? String(fallback.latitude) : undefined);
    const rawLon =
      req.header("x-geo-lon") ||
      req.header("x-vercel-ip-longitude") ||
      (fallback?.longitude !== undefined ? String(fallback.longitude) : undefined);

    const parsedLat = rawLat !== undefined ? Number(rawLat) : NaN;
    const parsedLon = rawLon !== undefined ? Number(rawLon) : NaN;

    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
      return {
        latitude: parsedLat,
        longitude: parsedLon,
        countryCode: (
          req.header("cf-ipcountry") ||
          req.header("x-geo-country") ||
          knownCity?.countryCode ||
          fallback?.countryCode ||
          "NL"
        )
          .trim()
          .toUpperCase(),
        city: cityHeader || knownCity?.city || "Custom Coordinate",
      };
    }

    if (knownCity) {
      return { ...knownCity };
    }

    return {
      latitude: SAFE_LOCAL_GEO.latitude,
      longitude: SAFE_LOCAL_GEO.longitude,
      countryCode: (
        req.header("cf-ipcountry") ||
        req.header("x-geo-country") ||
        SAFE_LOCAL_GEO.countryCode
      )
        .trim()
        .toUpperCase(),
      city: cityHeader || SAFE_LOCAL_GEO.city,
    };
  }

  public async lookupIpReputation(
    ipAddress: string,
    requestGeo: GeoCoordinates,
    overrideRawScore?: number
  ): Promise<IpReputationAssessment> {
    if (typeof overrideRawScore === "number" && Number.isFinite(overrideRawScore)) {
      const clamped = Math.max(0, Math.min(100, Math.round(overrideRawScore)));
      return {
        ipAddress,
        rawScore: clamped,
        provider: "local_threat_intel",
        isProxyOrTor: clamped >= 75,
        countryCode: requestGeo.countryCode,
        city: requestGeo.city,
        latitude: requestGeo.latitude,
        longitude: requestGeo.longitude,
      };
    }

    const threatMatch = KNOWN_THREAT_IPS[ipAddress];
    if (threatMatch) {
      return {
        ipAddress,
        rawScore: threatMatch.rawScore,
        provider: "local_threat_intel",
        isProxyOrTor: true,
        countryCode: requestGeo.city !== SAFE_LOCAL_GEO.city ? requestGeo.countryCode : threatMatch.countryCode,
        city: requestGeo.city !== SAFE_LOCAL_GEO.city ? requestGeo.city : threatMatch.city,
        latitude:
          requestGeo.latitude !== SAFE_LOCAL_GEO.latitude
            ? requestGeo.latitude
            : threatMatch.latitude,
        longitude:
          requestGeo.longitude !== SAFE_LOCAL_GEO.longitude
            ? requestGeo.longitude
            : threatMatch.longitude,
      };
    }

    if (isPrivateOrLoopbackIp(ipAddress)) {
      return {
        ipAddress,
        rawScore: 0,
        provider: "local_threat_intel",
        isProxyOrTor: false,
        countryCode: requestGeo.countryCode,
        city: requestGeo.city,
        latitude: requestGeo.latitude,
        longitude: requestGeo.longitude,
      };
    }

    const cached = this.reputationCache.get(ipAddress);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.result;
    }

    // Live IPQualityScore API integration
    if (this.ipqsKey) {
      try {
        const res = await fetch(
          `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(this.ipqsKey)}/${encodeURIComponent(ipAddress)}?strictness=1&allow_public_access_points=true`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            fraud_score?: number;
            proxy?: boolean;
            vpn?: boolean;
            tor?: boolean;
            country_code?: string;
            city?: string;
            latitude?: number;
            longitude?: number;
          };
          const rawScore = Math.max(0, Math.min(100, Math.round(Number(data.fraud_score || 0))));
          const assessment: IpReputationAssessment = {
            ipAddress,
            rawScore,
            provider: "ipqualityscore",
            isProxyOrTor: Boolean(data.tor || data.proxy || data.vpn),
            countryCode: requestGeo.countryCode || data.country_code || "NL",
            city: requestGeo.city || data.city || "Amsterdam",
            latitude:
              requestGeo.latitude !== SAFE_LOCAL_GEO.latitude
                ? requestGeo.latitude
                : Number(data.latitude || SAFE_LOCAL_GEO.latitude),
            longitude:
              requestGeo.longitude !== SAFE_LOCAL_GEO.longitude
                ? requestGeo.longitude
                : Number(data.longitude || SAFE_LOCAL_GEO.longitude),
          };
          this.reputationCache.set(ipAddress, {
            result: assessment,
            expiresAtMs: Date.now() + 5 * 60_000,
          });
          return assessment;
        }
      } catch {
        if (this.strictFailClosed) {
          return {
            ipAddress,
            rawScore: 100,
            provider: "fail_closed",
            isProxyOrTor: true,
            countryCode: requestGeo.countryCode,
            city: requestGeo.city,
            latitude: requestGeo.latitude,
            longitude: requestGeo.longitude,
          };
        }
      }
    }

    // Live AbuseIPDB API integration
    if (this.abuseIpDbKey) {
      try {
        const url = new URL("https://api.abuseipdb.com/api/v2/check");
        url.searchParams.set("ipAddress", ipAddress);
        url.searchParams.set("maxAgeInDays", "90");
        const res = await fetch(url.toString(), {
          headers: {
            Key: this.abuseIpDbKey,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            data?: {
              abuseConfidenceScore?: number;
              isTor?: boolean;
              countryCode?: string;
            };
          };
          const rawScore = Math.max(
            0,
            Math.min(100, Math.round(Number(body.data?.abuseConfidenceScore || 0)))
          );
          const assessment: IpReputationAssessment = {
            ipAddress,
            rawScore,
            provider: "abuseipdb",
            isProxyOrTor: Boolean(body.data?.isTor),
            countryCode: requestGeo.countryCode || body.data?.countryCode || "NL",
            city: requestGeo.city,
            latitude: requestGeo.latitude,
            longitude: requestGeo.longitude,
          };
          this.reputationCache.set(ipAddress, {
            result: assessment,
            expiresAtMs: Date.now() + 5 * 60_000,
          });
          return assessment;
        }
      } catch {
        if (this.strictFailClosed) {
          return {
            ipAddress,
            rawScore: 100,
            provider: "fail_closed",
            isProxyOrTor: true,
            countryCode: requestGeo.countryCode,
            city: requestGeo.city,
            latitude: requestGeo.latitude,
            longitude: requestGeo.longitude,
          };
        }
      }
    }

    return {
      ipAddress,
      rawScore: 0,
      provider: "local_threat_intel",
      isProxyOrTor: false,
      countryCode: requestGeo.countryCode,
      city: requestGeo.city,
      latitude: requestGeo.latitude,
      longitude: requestGeo.longitude,
    };
  }

  public issueCaptchaChallenge(ipAddress: string, userAgent: string): {
    challengeToken: string;
    promptQuestion: string;
    provider: "turnstile" | "signed_challenge";
    expiresInSeconds: number;
  } {
    const a = crypto.randomInt(3, 18);
    const b = crypto.randomInt(2, 15);
    const answer = String(a + b);
    const challengeToken = `cap_${crypto.randomBytes(18).toString("hex")}`;
    const provider: "turnstile" | "signed_challenge" = this.turnstileSecretKey
      ? "turnstile"
      : "signed_challenge";

    this.activeChallenges.set(challengeToken, {
      challengeToken,
      promptQuestion: `Zero-Trust Verification: What is ${a} + ${b}?`,
      expectedAnswerHash: hashValue(`${challengeToken}:${answer}:${this.signingSecret}`),
      ipAddress,
      userAgentHash: hashValue(userAgent || "unknown"),
      expiresAtMs: Date.now() + 5 * 60_000,
      provider,
    });

    if (this.activeChallenges.size > 1000) {
      const oldestKey = this.activeChallenges.keys().next().value;
      if (oldestKey) this.activeChallenges.delete(oldestKey);
    }

    return {
      challengeToken,
      promptQuestion: `Zero-Trust Verification: What is ${a} + ${b}?`,
      provider,
      expiresInSeconds: 300,
    };
  }

  public async verifyCaptchaSubmission(params: {
    challengeToken?: string;
    answer?: string;
    turnstileToken?: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<{ verified: boolean; clearanceToken: string | null; reason: string }> {
    const uaHash = hashValue(params.userAgent || "unknown");

    if (this.turnstileSecretKey && params.turnstileToken) {
      try {
        const form = new URLSearchParams();
        form.set("secret", this.turnstileSecretKey);
        form.set("response", params.turnstileToken);
        form.set("remoteip", params.ipAddress);
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(4000),
        });
        const body = (await res.json()) as { success?: boolean };
        if (body.success) {
          const clearanceToken = this.issueClearanceToken(params.ipAddress, uaHash);
          return { verified: true, clearanceToken, reason: "Cloudflare Turnstile verified." };
        }
        return { verified: false, clearanceToken: null, reason: "Turnstile verification failed." };
      } catch {
        return {
          verified: false,
          clearanceToken: null,
          reason: "Turnstile verification unavailable (fail closed).",
        };
      }
    }

    if (!params.challengeToken || !params.answer?.trim()) {
      return {
        verified: false,
        clearanceToken: null,
        reason: "Provide challengeToken and CAPTCHA answer.",
      };
    }

    const record = this.activeChallenges.get(params.challengeToken);
    if (!record || record.expiresAtMs < Date.now()) {
      this.activeChallenges.delete(params.challengeToken);
      return {
        verified: false,
        clearanceToken: null,
        reason: "CAPTCHA challenge expired or unknown.",
      };
    }

    const suppliedHash = hashValue(
      `${params.challengeToken}:${params.answer.trim()}:${this.signingSecret}`
    );
    const valid = crypto.timingSafeEqual(
      Buffer.from(suppliedHash, "utf8"),
      Buffer.from(record.expectedAnswerHash, "utf8")
    );
    if (!valid) {
      return { verified: false, clearanceToken: null, reason: "Incorrect CAPTCHA answer." };
    }

    this.activeChallenges.delete(params.challengeToken);
    this.blockedIps.delete(params.ipAddress);
    const clearanceToken = this.issueClearanceToken(params.ipAddress, uaHash);
    return { verified: true, clearanceToken, reason: "CAPTCHA challenge verified." };
  }

  private issueClearanceToken(ipAddress: string, userAgentHash: string): string {
    const clearanceToken = `clr_${crypto.randomBytes(20).toString("hex")}`;
    this.verifiedClearances.set(clearanceToken, {
      ipAddress,
      userAgentHash,
      expiresAtMs: Date.now() + 15 * 60_000,
    });
    return clearanceToken;
  }

  public isClearanceValid(
    token: string | undefined,
    ipAddress: string,
    userAgent: string
  ): boolean {
    if (!token) return false;
    const rec = this.verifiedClearances.get(token.trim());
    if (!rec) return false;
    if (rec.expiresAtMs < Date.now()) {
      this.verifiedClearances.delete(token.trim());
      return false;
    }
    const uaHash = hashValue(userAgent || "unknown");
    return rec.ipAddress === ipAddress && rec.userAgentHash === uaHash;
  }

  public async evaluateRequest(params: {
    req?: express.Request;
    ipAddress?: string;
    userAgent?: string;
    geo?: Partial<GeoCoordinates>;
    actorPlane: "public" | "user" | "admin";
    actorId: string | null;
    route: string;
    captchaClearanceToken?: string;
    overrideIpReputation?: number;
    simulatedRequestsPerMin?: number;
  }): Promise<AnomalyEvaluationResult> {
    const ipAddress =
      params.ipAddress || (params.req ? this.extractClientIp(params.req) : "127.0.0.1");
    const userAgent =
      params.userAgent || (params.req ? params.req.header("user-agent") || "unknown" : "unknown");
    const normalizedFallbackCity = (params.geo?.city || "").trim().toLowerCase().replace(/\s+/g, "");
    const knownFallbackCity = normalizedFallbackCity
      ? KNOWN_CITY_COORDS[normalizedFallbackCity]
      : undefined;
    const geoLocation = params.req
      ? this.extractGeoFromRequest(params.req, params.geo)
      : knownFallbackCity && params.geo?.latitude === undefined && params.geo?.longitude === undefined
        ? { ...knownFallbackCity }
        : {
            latitude: params.geo?.latitude ?? knownFallbackCity?.latitude ?? SAFE_LOCAL_GEO.latitude,
            longitude: params.geo?.longitude ?? knownFallbackCity?.longitude ?? SAFE_LOCAL_GEO.longitude,
            countryCode: (
              params.geo?.countryCode ||
              knownFallbackCity?.countryCode ||
              SAFE_LOCAL_GEO.countryCode
            ).toUpperCase(),
            city: params.geo?.city || knownFallbackCity?.city || SAFE_LOCAL_GEO.city,
          };

    const ipReputation = await this.lookupIpReputation(
      ipAddress,
      geoLocation,
      params.overrideIpReputation
    );

    const reasons: string[] = [];

    // 1. IP Reputation (0 - 40 pts; raw >= 85 known attacker guarantees score > 80 fail-closed)
    const ipPoints = Math.min(40, Math.round((ipReputation.rawScore / 100) * 40));
    if (ipReputation.rawScore >= 60 || ipReputation.isProxyOrTor) {
      reasons.push(
        `IP reputation risk ${ipReputation.rawScore}/100 via ${ipReputation.provider}`
      );
    }

    // 2. Geo-location vs user's last known location (0 - 25 pts)
    let geoPoints = 0;
    const anchorKey = params.actorId
      ? `${params.actorPlane === "admin" ? "admin" : "user"}:${params.actorId}`
      : null;
    const anchor = anchorKey ? this.loginGeoHistory.get(anchorKey) || null : null;
    if (anchor) {
      const distKm = haversineDistanceKm(
        anchor.geo.latitude,
        anchor.geo.longitude,
        geoLocation.latitude,
        geoLocation.longitude
      );
      if (distKm > 2000) {
        geoPoints = 25;
        reasons.push(
          `Geo-location jump ${distKm} km from last login (${anchor.geo.city} -> ${geoLocation.city})`
        );
      } else if (distKm > 500) {
        geoPoints = 18;
        reasons.push(`Regional geo deviation ${distKm} km from ${anchor.geo.city}`);
      } else if (geoLocation.countryCode !== anchor.geo.countryCode) {
        geoPoints = 12;
        reasons.push(
          `Country shift (${anchor.geo.countryCode} -> ${geoLocation.countryCode})`
        );
      }
    }

    // 3. User-Agent consistency check (0 - 15 pts)
    const currentUaFamily = normalizeUserAgentFamily(userAgent);
    let uaPoints = 0;
    if (currentUaFamily === "automated_scanner") {
      uaPoints = 15;
      reasons.push(`Automated exploit/scanner User-Agent (${userAgent.slice(0, 48)})`);
    } else if (anchor && anchor.userAgentFamily !== currentUaFamily) {
      uaPoints = 12;
      reasons.push(
        `User-Agent switched from ${anchor.userAgentFamily} to ${currentUaFamily}`
      );
    }

    // 4. Request rate deviation from baseline (0 - 20 pts)
    const nowMs = Date.now();
    const rateKey = `${ipAddress}:${params.actorId || "anon"}`;
    const bucket = (this.requestBuckets.get(rateKey) || []).filter((ts) => nowMs - ts <= 60_000);
    bucket.push(nowMs);
    this.requestBuckets.set(rateKey, bucket);

    const observedRate =
      typeof params.simulatedRequestsPerMin === "number"
        ? Math.max(1, Math.round(params.simulatedRequestsPerMin))
        : bucket.length;
    const baseline = this.rateBaselines.get(rateKey) ?? 15;
    if (typeof params.simulatedRequestsPerMin !== "number") {
      this.rateBaselines.set(rateKey, Math.round((baseline * 0.9 + bucket.length * 0.1) * 10) / 10);
    }

    let ratePoints = 0;
    const rateRatio = observedRate / Math.max(5, baseline);
    if (observedRate >= 120 || rateRatio >= 6) {
      ratePoints = 20;
      reasons.push(`Request rate spike (${observedRate} req/min vs ${baseline} baseline)`);
    } else if (observedRate >= 60 || rateRatio >= 3.5) {
      ratePoints = 14;
      reasons.push(`Elevated request rate (${observedRate} req/min vs ${baseline} baseline)`);
    } else if (observedRate >= 40 || rateRatio >= 2.5) {
      ratePoints = 8;
      reasons.push(`Moderate rate deviation (${observedRate} req/min)`);
    }

    const weightedSum = Math.min(100, ipPoints + geoPoints + uaPoints + ratePoints);
    const totalScore =
      ipReputation.rawScore >= 85 ? Math.min(100, Math.max(weightedSum, 88)) : weightedSum;

    const headerClearance = params.req?.header("x-captcha-clearance");
    const captchaCleared = this.isClearanceValid(
      params.captchaClearanceToken || headerClearance,
      ipAddress,
      userAgent
    );
    const blocked = totalScore > ANOMALY_SCORE_BLOCK_THRESHOLD && !captchaCleared;

    if (blocked) {
      this.blockedIps.set(ipAddress, {
        ipAddress,
        score: totalScore,
        blockedAt: new Date(nowMs).toISOString(),
        reason: reasons[0] || "Anomaly score exceeded threshold",
      });
    }

    const evaluation: AnomalyEvaluationResult = {
      id: `anom-${crypto.randomUUID().slice(0, 10)}`,
      score: totalScore,
      blocked,
      requiresCaptcha: blocked,
      captchaCleared,
      breakdown: {
        ipReputation: ipPoints,
        geoAnomaly: geoPoints,
        userAgentDrift: uaPoints,
        rateDeviation: ratePoints,
      },
      reasons: reasons.length > 0 ? reasons : ["Nominal traffic telemetry"],
      ipReputation,
      geoLocation,
      userAgentFamily: currentUaFamily,
      requestsLastMinute: observedRate,
      baselineRequestsPerMinute: baseline,
      evaluatedAt: new Date(nowMs).toISOString(),
      actorPlane: params.actorPlane,
      actorId: params.actorId,
      route: params.route,
    };

    this.recentAssessments.unshift(evaluation);
    if (this.recentAssessments.length > 150) {
      this.recentAssessments.length = 150;
    }

    return evaluation;
  }

  public checkImpossibleTravel(params: {
    actorPlane: "user" | "admin";
    actorId: string;
    email: string;
    ipAddress: string;
    userAgent: string;
    attemptedGeo: GeoCoordinates;
    simulatedPreviousMinutesAgo?: number;
  }): ImpossibleTravelCheckResult {
    const actorKey = `${params.actorPlane}:${params.actorId}`;
    const prev = this.loginGeoHistory.get(actorKey) || null;
    if (!prev) {
      return {
        allowed: true,
        triggered: false,
        distanceKm: null,
        elapsedMinutes: null,
        previousAnchor: null,
        attemptedGeo: params.attemptedGeo,
        requiresReauthentication: false,
      };
    }

    const elapsedMinutes =
      typeof params.simulatedPreviousMinutesAgo === "number"
        ? Math.max(0.1, params.simulatedPreviousMinutesAgo)
        : Math.max(0.1, Math.round(((Date.now() - prev.loggedInAtMs) / 60_000) * 100) / 100);

    const distanceKm = haversineDistanceKm(
      prev.geo.latitude,
      prev.geo.longitude,
      params.attemptedGeo.latitude,
      params.attemptedGeo.longitude
    );

    const impossible =
      distanceKm > IMPOSSIBLE_TRAVEL_DISTANCE_KM &&
      elapsedMinutes <= IMPOSSIBLE_TRAVEL_WINDOW_MINUTES;

    return {
      allowed: !impossible,
      triggered: impossible,
      distanceKm,
      elapsedMinutes,
      previousAnchor: prev,
      attemptedGeo: params.attemptedGeo,
      requiresReauthentication: impossible,
    };
  }

  public issueReauthChallenge(params: {
    actorPlane: "user" | "admin";
    actorId: string;
    geo: GeoCoordinates;
    ipAddress: string;
    userAgent: string;
  }): string {
    const token = `reauth_${crypto.randomBytes(20).toString("hex")}`;
    this.reauthChallenges.set(token, {
      ...params,
      expiresAtMs: Date.now() + 10 * 60_000,
    });
    return token;
  }

  public consumeReauthChallenge(params: {
    reauthToken?: string;
    actorPlane: "user" | "admin";
    actorId: string;
  }): boolean {
    if (!params.reauthToken) return false;
    const rec = this.reauthChallenges.get(params.reauthToken.trim());
    if (!rec) return false;
    if (rec.expiresAtMs < Date.now()) {
      this.reauthChallenges.delete(params.reauthToken.trim());
      return false;
    }
    if (rec.actorPlane !== params.actorPlane || rec.actorId !== params.actorId) {
      return false;
    }
    this.reauthChallenges.delete(params.reauthToken.trim());
    return true;
  }

  public recordVerifiedLoginGeo(params: {
    actorPlane: "user" | "admin";
    actorId: string;
    email: string;
    ipAddress: string;
    userAgent: string;
    geo: GeoCoordinates;
    timestampMs?: number;
  }): ActorLoginGeoAnchor {
    const actorKey = `${params.actorPlane}:${params.actorId}`;
    const ts = params.timestampMs ?? Date.now();
    const anchor: ActorLoginGeoAnchor = {
      actorKey,
      actorPlane: params.actorPlane,
      actorId: params.actorId,
      email: params.email,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      userAgentFamily: normalizeUserAgentFamily(params.userAgent),
      geo: params.geo,
      loggedInAtMs: ts,
      loggedInAt: new Date(ts).toISOString(),
    };
    this.loginGeoHistory.set(actorKey, anchor);
    return anchor;
  }

  public unblockIp(ipAddress: string): boolean {
    return this.blockedIps.delete(ipAddress);
  }

  public getAdminSnapshot() {
    return {
      ...this.getProviderStatus(),
      recentAssessments: this.recentAssessments.slice(0, 40),
      blockedIps: Array.from(this.blockedIps.values()),
      loginGeoAnchors: Array.from(this.loginGeoHistory.values()),
      threatIntelKnownIps: Object.entries(KNOWN_THREAT_IPS).map(([ip, info]) => ({
        ipAddress: ip,
        ...info,
      })),
    };
  }
}
