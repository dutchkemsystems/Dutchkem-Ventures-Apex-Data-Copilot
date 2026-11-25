import crypto from "node:crypto";
import type express from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type CredentialDeviceType,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

export type PasskeyActorPlane = "user" | "admin";

export interface UserPasskeyRecord {
  id: string;
  actor_plane: PasskeyActorPlane;
  user_id: string | null;
  admin_id: string | null;
  actor_email: string;
  actor_name: string;
  credential_id: string;
  public_key: string; // Base64URL serialized COSE public key for PostgreSQL storage
  publicKeyBytes: Uint8Array<ArrayBuffer>;
  counter: number;
  device_name: string;
  aaguid: string | null;
  yubikey_model: string | null;
  is_hardware_yubikey: boolean;
  transports: AuthenticatorTransport[];
  device_type: CredentialDeviceType;
  backed_up: boolean;
  rp_id: string;
  origin: string;
  last_used_at: string | null;
  created_at: string;
}

interface PendingChallengeRecord {
  challenge: string;
  actorPlane: PasskeyActorPlane;
  actorId: string | null;
  ceremony: "registration" | "authentication";
  rpId: string;
  expectedOrigins: string[];
  requireHardwareKey: boolean;
  expiresAtMs: number;
}

export const YUBIKEY_AAGUID_CATALOG: Record<string, string> = {
  "cb69481e-8ff7-4093-99ec-53f6c295e128": "YubiKey 5 Series / 5C NFC",
  "73bb0cd4-e502-49b8-9c6f-b59445bf720b": "YubiKey 5 FIPS Series",
  "c5ef55ff-ad9a-4b9f-b580-adebafe026d0": "YubiKey 5Ci / Enterprise",
  "ee882879-721c-4913-9775-3dfcce97072a": "YubiKey 5 NFC",
  "d8522d9f-575b-4866-88a9-ba99fa02f35b": "YubiKey Bio Series",
  "a4e9fc6d-4cbe-4758-b8ba-37598bb5bbaa": "Security Key by Yubico NFC",
  "fa2b99dc-9e39-4257-8f92-4a30d23c4118": "YubiKey 5 USB-C / Lightning",
  "2fc0579f-8113-47ea-b116-bb5a8db9202a": "YubiKey 5 Series (FIDO2)",
};

export function detectYubikeyHardware(params: {
  aaguid?: string | null;
  transports?: AuthenticatorTransport[];
  deviceName?: string;
}): { isHardwareYubikey: boolean; modelLabel: string | null } {
  const normalizedAaguid = (params.aaguid || "").trim().toLowerCase();
  if (normalizedAaguid && YUBIKEY_AAGUID_CATALOG[normalizedAaguid]) {
    return {
      isHardwareYubikey: true,
      modelLabel: YUBIKEY_AAGUID_CATALOG[normalizedAaguid],
    };
  }
  const transports = params.transports || [];
  const hasRoamingTransport =
    transports.includes("usb") || transports.includes("nfc") || transports.includes("ble");
  const nameLower = (params.deviceName || "").toLowerCase();
  if (nameLower.includes("yubikey") || (hasRoamingTransport && !transports.includes("internal"))) {
    return {
      isHardwareYubikey: true,
      modelLabel: nameLower.includes("yubikey")
        ? params.deviceName?.trim() || "YubiKey Hardware Security Key"
        : "FIDO2 Roaming Hardware Security Key",
    };
  }
  return { isHardwareYubikey: false, modelLabel: null };
}

export function resolveWebAuthnContext(req: express.Request): {
  rpName: string;
  rpID: string;
  expectedOrigins: string[];
  primaryOrigin: string;
} {
  const rpName = process.env.WEBAUTHN_RP_NAME || "Dutchkem Ventures Apex Data Copilot";
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const rawHost = forwardedHost || req.header("host") || req.hostname || "localhost:3000";
  const hostWithoutPort = rawHost.split(":")[0].trim().toLowerCase() || "localhost";
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = forwardedProto || req.protocol || (hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1" ? "http" : "https");

  const envRpId = (process.env.WEBAUTHN_RP_ID || "").trim().toLowerCase();
  const rpID = envRpId || hostWithoutPort;

  const origins = new Set<string>();
  const requestOriginHeader = (req.header("origin") || "").trim();
  // Only accept request Origin header if its hostname exactly matches rpID or subdomain of rpID (anti-phishing)
  if (requestOriginHeader) {
    try {
      const parsed = new URL(requestOriginHeader);
      const originHost = parsed.hostname.toLowerCase();
      if (originHost === rpID || originHost.endsWith(`.${rpID}`)) {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore invalid Origin header; fail closed
    }
  }

  origins.add(`${proto}://${rawHost}`);
  if (hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1") {
    const portPart = rawHost.includes(":") ? `:${rawHost.split(":")[1]}` : ":3000";
    origins.add(`http://localhost${portPart}`);
    origins.add(`http://127.0.0.1${portPart}`);
  }
  if (process.env.WEBAUTHN_ORIGIN) {
    origins.add(process.env.WEBAUTHN_ORIGIN.trim());
  }
  if (process.env.APP_URL) {
    try {
      origins.add(new URL(process.env.APP_URL.trim()).origin);
    } catch {
      // Ignore malformed APP_URL
    }
  }

  const expectedOrigins = [...origins];
  return {
    rpName,
    rpID,
    expectedOrigins,
    primaryOrigin: expectedOrigins[0] || `${proto}://${rawHost}`,
  };
}

function decodeClientDataJsonUnsafe(
  clientDataB64Url: string | undefined
): { origin?: string; type?: string; challenge?: string } | null {
  if (!clientDataB64Url || typeof clientDataB64Url !== "string") return null;
  try {
    const decoded = Buffer.from(clientDataB64Url, "base64url").toString("utf8");
    return JSON.parse(decoded) as { origin?: string; type?: string; challenge?: string };
  } catch {
    return null;
  }
}

export class WebAuthnPasskeyService {
  private readonly passkeys = new Map<string, UserPasskeyRecord>();
  private readonly challenges = new Map<string, PendingChallengeRecord>();
  private readonly challengeTtlMs = 5 * 60 * 1000;

  private pruneExpiredChallenges(): void {
    const now = Date.now();
    for (const [token, rec] of this.challenges.entries()) {
      if (rec.expiresAtMs <= now) {
        this.challenges.delete(token);
      }
    }
  }

  listPasskeysForActor(actorPlane: PasskeyActorPlane, actorId: string): UserPasskeyRecord[] {
    return [...this.passkeys.values()].filter((p) =>
      actorPlane === "admin"
        ? p.actor_plane === "admin" && p.admin_id === actorId
        : p.actor_plane === "user" && p.user_id === actorId
    );
  }

  listAllAdminPasskeys(): UserPasskeyRecord[] {
    return [...this.passkeys.values()].filter((p) => p.actor_plane === "admin");
  }

  listPasskeyStats(): {
    totalPasskeys: number;
    userPasskeysCount: number;
    adminYubikeysCount: number;
    hardwareYubikeyCount: number;
  } {
    const all = [...this.passkeys.values()];
    return {
      totalPasskeys: all.length,
      userPasskeysCount: all.filter((p) => p.actor_plane === "user").length,
      adminYubikeysCount: all.filter((p) => p.actor_plane === "admin").length,
      hardwareYubikeyCount: all.filter((p) => p.is_hardware_yubikey).length,
    };
  }

  getByCredentialId(credentialId: string): UserPasskeyRecord | undefined {
    return this.passkeys.get(credentialId);
  }

  deletePasskey(params: {
    actorPlane: PasskeyActorPlane;
    actorId: string;
    credentialId: string;
  }): boolean {
    const existing = this.passkeys.get(params.credentialId);
    if (!existing || existing.actor_plane !== params.actorPlane) return false;
    const ownerMatches =
      params.actorPlane === "admin"
        ? existing.admin_id === params.actorId
        : existing.user_id === params.actorId;
    if (!ownerMatches) return false;
    return this.passkeys.delete(params.credentialId);
  }

  async beginRegistration(params: {
    req: express.Request;
    actorPlane: PasskeyActorPlane;
    actorId: string;
    email: string;
    displayName: string;
    requireHardwareKey?: boolean;
  }): Promise<{
    challengeToken: string;
    options: PublicKeyCredentialCreationOptionsJSON;
    rpId: string;
    expectedOrigins: string[];
    requireHardwareKey: boolean;
  }> {
    this.pruneExpiredChallenges();
    const { rpName, rpID, expectedOrigins } = resolveWebAuthnContext(params.req);
    const existing = this.listPasskeysForActor(params.actorPlane, params.actorId);
    const enforceHardwareKey =
      params.actorPlane === "admin" && (params.requireHardwareKey ?? true);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: params.email,
      userID: new TextEncoder().encode(`${params.actorPlane}:${params.actorId}`),
      userDisplayName: params.displayName,
      timeout: 60000,
      attestationType: enforceHardwareKey ? "direct" : "none",
      excludeCredentials: existing.map((cred) => ({
        id: cred.credential_id,
        transports: cred.transports,
      })),
      authenticatorSelection: enforceHardwareKey
        ? {
            authenticatorAttachment: "cross-platform",
            residentKey: "required",
            requireResidentKey: true,
            userVerification: "required",
          }
        : {
            residentKey: "preferred",
            userVerification: "preferred",
          },
      preferredAuthenticatorType: enforceHardwareKey ? "securityKey" : "localDevice",
    });

    const challengeToken = crypto.randomUUID();
    this.challenges.set(challengeToken, {
      challenge: options.challenge,
      actorPlane: params.actorPlane,
      actorId: params.actorId,
      ceremony: "registration",
      rpId: rpID,
      expectedOrigins,
      requireHardwareKey: enforceHardwareKey,
      expiresAtMs: Date.now() + this.challengeTtlMs,
    });

    return {
      challengeToken,
      options,
      rpId: rpID,
      expectedOrigins,
      requireHardwareKey: enforceHardwareKey,
    };
  }

  async finishRegistration(params: {
    actorPlane: PasskeyActorPlane;
    actorId: string;
    email: string;
    displayName: string;
    deviceName?: string;
    challengeToken: string;
    response: RegistrationResponseJSON;
    requireHardwareKey?: boolean;
  }): Promise<
    | { ok: true; passkey: UserPasskeyRecord }
    | {
        ok: false;
        status: 400 | 401 | 403 | 409;
        code: string;
        detail: string;
        phishingOriginDetected?: boolean;
        attemptedOrigin?: string | null;
      }
  > {
    this.pruneExpiredChallenges();
    const pending = this.challenges.get(params.challengeToken);
    if (
      !pending ||
      pending.ceremony !== "registration" ||
      pending.actorPlane !== params.actorPlane ||
      pending.actorId !== params.actorId ||
      pending.expiresAtMs <= Date.now()
    ) {
      return {
        ok: false,
        status: 401,
        code: "WEBAUTHN_CHALLENGE_EXPIRED",
        detail: "WebAuthn registration challenge is missing, expired, or bound to another session.",
      };
    }

    // Consume single-use challenge immediately (fail-closed anti-replay)
    this.challenges.delete(params.challengeToken);

    const clientData = decodeClientDataJsonUnsafe(params.response?.response?.clientDataJSON);
    if (clientData?.origin && !pending.expectedOrigins.includes(clientData.origin)) {
      return {
        ok: false,
        status: 403,
        code: "WEBAUTHN_PHISHING_ORIGIN_MISMATCH",
        detail: `Phishing protection blocked registration: untrusted origin "${clientData.origin}" does not match RP "${pending.rpId}".`,
        phishingOriginDetected: true,
        attemptedOrigin: clientData.origin,
      };
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: params.response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.expectedOrigins,
        expectedRPID: pending.rpId,
        requireUserPresence: true,
        requireUserVerification: params.actorPlane === "admin",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "WebAuthn registration verification failed.";
      const isOriginOrRp =
        msg.toLowerCase().includes("origin") || msg.toLowerCase().includes("rp id");
      return {
        ok: false,
        status: 403,
        code: isOriginOrRp ? "WEBAUTHN_PHISHING_ORIGIN_MISMATCH" : "WEBAUTHN_REGISTRATION_REJECTED",
        detail: msg,
        phishingOriginDetected: isOriginOrRp,
        attemptedOrigin: clientData?.origin ?? null,
      };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return {
        ok: false,
        status: 403,
        code: "WEBAUTHN_REGISTRATION_REJECTED",
        detail: "WebAuthn attestation could not be cryptographically verified.",
      };
    }

    const { credential, credentialDeviceType, credentialBackedUp, aaguid, origin, rpID } =
      verification.registrationInfo;

    if (this.passkeys.has(credential.id)) {
      return {
        ok: false,
        status: 409,
        code: "PASSKEY_ALREADY_REGISTERED",
        detail: "This authenticator credential ID is already registered.",
      };
    }

    const transports = (credential.transports ||
      params.response.response.transports ||
      (params.actorPlane === "admin" ? ["usb", "nfc"] : ["internal"])) as AuthenticatorTransport[];

    const yubikeyInfo = detectYubikeyHardware({
      aaguid,
      transports,
      deviceName: params.deviceName,
    });

    const enforceHardware =
      params.actorPlane === "admin" &&
      (params.requireHardwareKey ?? pending.requireHardwareKey) &&
      process.env.ADMIN_ALLOW_PLATFORM_PASSKEY !== "true";

    if (enforceHardware) {
      const hasRoamingTransport =
        transports.includes("usb") ||
        transports.includes("nfc") ||
        transports.includes("ble") ||
        transports.includes("hybrid");
      if (!yubikeyInfo.isHardwareYubikey && !hasRoamingTransport && params.response.authenticatorAttachment === "platform") {
        return {
          ok: false,
          status: 403,
          code: "ADMIN_HARDWARE_YUBIKEY_REQUIRED",
          detail:
            "Admin Plane policy requires a cross-platform hardware security key (e.g., YubiKey USB/NFC). Platform synced passkeys are disallowed for Admins.",
        };
      }
    }

    const defaultName =
      params.deviceName?.trim() ||
      yubikeyInfo.modelLabel ||
      (params.actorPlane === "admin" ? "YubiKey Hardware Key" : "Platform Passkey");

    const record: UserPasskeyRecord = {
      id: `pk_${crypto.randomUUID().slice(0, 12)}`,
      actor_plane: params.actorPlane,
      user_id: params.actorPlane === "user" ? params.actorId : null,
      admin_id: params.actorPlane === "admin" ? params.actorId : null,
      actor_email: params.email,
      actor_name: params.displayName,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString("base64url"),
      publicKeyBytes: (() => {
        const copy = new Uint8Array(new ArrayBuffer(credential.publicKey.byteLength));
        copy.set(credential.publicKey);
        return copy;
      })(),
      counter: credential.counter,
      device_name: defaultName,
      aaguid: aaguid || null,
      yubikey_model: yubikeyInfo.modelLabel,
      is_hardware_yubikey: yubikeyInfo.isHardwareYubikey || params.actorPlane === "admin",
      transports,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      rp_id: rpID || pending.rpId,
      origin: origin || pending.expectedOrigins[0],
      last_used_at: null,
      created_at: new Date().toISOString(),
    };

    this.passkeys.set(record.credential_id, record);
    return { ok: true, passkey: record };
  }

  async beginAuthentication(params: {
    req: express.Request;
    actorPlane: PasskeyActorPlane;
    actorId?: string | null;
  }): Promise<{
    challengeToken: string;
    options: PublicKeyCredentialRequestOptionsJSON;
    rpId: string;
    expectedOrigins: string[];
  }> {
    this.pruneExpiredChallenges();
    const { rpID, expectedOrigins } = resolveWebAuthnContext(params.req);
    const matchingCreds = params.actorId
      ? this.listPasskeysForActor(params.actorPlane, params.actorId)
      : [...this.passkeys.values()].filter((p) => p.actor_plane === params.actorPlane);

    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60000,
      allowCredentials: matchingCreds.map((cred) => ({
        id: cred.credential_id,
        transports: cred.transports,
      })),
      userVerification: params.actorPlane === "admin" ? "required" : "preferred",
    });

    const challengeToken = crypto.randomUUID();
    this.challenges.set(challengeToken, {
      challenge: options.challenge,
      actorPlane: params.actorPlane,
      actorId: params.actorId || null,
      ceremony: "authentication",
      rpId: rpID,
      expectedOrigins,
      requireHardwareKey: params.actorPlane === "admin",
      expiresAtMs: Date.now() + this.challengeTtlMs,
    });

    return {
      challengeToken,
      options,
      rpId: rpID,
      expectedOrigins,
    };
  }

  async finishAuthentication(params: {
    actorPlane: PasskeyActorPlane;
    challengeToken: string;
    response: AuthenticationResponseJSON;
  }): Promise<
    | { ok: true; passkey: UserPasskeyRecord; newCounter: number }
    | {
        ok: false;
        status: 400 | 401 | 403 | 404;
        code: string;
        detail: string;
        phishingOriginDetected?: boolean;
        attemptedOrigin?: string | null;
        replayDetected?: boolean;
        crossPlaneOwnerId?: string | null;
      }
  > {
    this.pruneExpiredChallenges();
    const pending = this.challenges.get(params.challengeToken);
    if (
      !pending ||
      pending.ceremony !== "authentication" ||
      pending.actorPlane !== params.actorPlane ||
      pending.expiresAtMs <= Date.now()
    ) {
      return {
        ok: false,
        status: 401,
        code: "WEBAUTHN_CHALLENGE_EXPIRED",
        detail: "Passkey login challenge is missing or expired. Request a new challenge.",
      };
    }

    // Consume single-use challenge immediately (fail closed)
    this.challenges.delete(params.challengeToken);

    // 1. Inspect clientDataJSON origin BEFORE credential verification so phishing attempts are caught & logged
    const clientData = decodeClientDataJsonUnsafe(params.response?.response?.clientDataJSON);
    if (!clientData?.origin || !pending.expectedOrigins.includes(clientData.origin)) {
      return {
        ok: false,
        status: 403,
        code: "WEBAUTHN_PHISHING_ORIGIN_MISMATCH",
        detail: `Phishing protection blocked passkey assertion: origin "${clientData?.origin || "unknown"}" does not match verified domain "${pending.rpId}".`,
        phishingOriginDetected: true,
        attemptedOrigin: clientData?.origin || null,
      };
    }

    // 2. Lookup stored credential in user_passkeys
    const credId = params.response?.id || params.response?.rawId;
    const stored = credId ? this.passkeys.get(credId) : undefined;
    if (!stored) {
      return {
        ok: false,
        status: 404,
        code: "PASSKEY_NOT_FOUND",
        detail: "No matching passkey found in user_passkeys for this credential ID.",
      };
    }

    // 3. Enforce strict three-plane isolation
    if (stored.actor_plane !== params.actorPlane) {
      return {
        ok: false,
        status: 403,
        code: "CROSS_PLANE_FORBIDDEN",
        detail: `Cross-plane passkey blocked: credential belongs to "${stored.actor_plane}" plane and cannot authenticate "${params.actorPlane}" plane.`,
        crossPlaneOwnerId: stored.user_id || stored.admin_id,
      };
    }

    if (pending.actorId) {
      const expectedOwner =
        params.actorPlane === "admin" ? stored.admin_id : stored.user_id;
      if (expectedOwner !== pending.actorId) {
        return {
          ok: false,
          status: 403,
          code: "PASSKEY_IDENTITY_MISMATCH",
          detail: "Presented passkey does not belong to the requested account.",
        };
      }
    }

    // 4. Verify cryptographic assertion + RP ID + origin via @simplewebauthn/server
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: params.response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.expectedOrigins,
        expectedRPID: pending.rpId,
        credential: {
          id: stored.credential_id,
          publicKey: stored.publicKeyBytes,
          counter: stored.counter,
          transports: stored.transports,
        },
        requireUserVerification: params.actorPlane === "admin",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey signature verification failed.";
      const lower = msg.toLowerCase();
      const isPhishing = lower.includes("origin") || lower.includes("rp id");
      const isCounter = lower.includes("counter");
      return {
        ok: false,
        status: 403,
        code: isPhishing
          ? "WEBAUTHN_PHISHING_ORIGIN_MISMATCH"
          : isCounter
            ? "WEBAUTHN_REPLAY_DETECTED"
            : "WEBAUTHN_ASSERTION_FAILED",
        detail: msg,
        phishingOriginDetected: isPhishing,
        attemptedOrigin: clientData?.origin ?? null,
        replayDetected: isCounter,
      };
    }

    if (!verification.verified) {
      return {
        ok: false,
        status: 403,
        code: "WEBAUTHN_ASSERTION_FAILED",
        detail: "Cryptographic passkey signature failed verification.",
      };
    }

    // 5. Explicit counter monotonicity check against cloned authenticators
    const newCounter = verification.authenticationInfo.newCounter;
    if (stored.counter > 0 && newCounter <= stored.counter) {
      return {
        ok: false,
        status: 403,
        code: "WEBAUTHN_REPLAY_DETECTED",
        detail: `Cloned passkey / replay detected: signature counter (${newCounter}) did not advance past stored counter (${stored.counter}).`,
        replayDetected: true,
      };
    }

    stored.counter = newCounter;
    stored.last_used_at = new Date().toISOString();

    return { ok: true, passkey: stored, newCounter };
  }
}

export function serializePasskeyForResponse(record: UserPasskeyRecord) {
  return {
    id: record.id,
    actor_plane: record.actor_plane,
    user_id: record.user_id,
    admin_id: record.admin_id,
    actor_email: record.actor_email,
    actor_name: record.actor_name,
    credential_id: record.credential_id,
    public_key: record.public_key,
    counter: record.counter,
    device_name: record.device_name,
    aaguid: record.aaguid,
    yubikey_model: record.yubikey_model,
    is_hardware_yubikey: record.is_hardware_yubikey,
    transports: record.transports,
    device_type: record.device_type,
    backed_up: record.backed_up,
    rp_id: record.rp_id,
    origin: record.origin,
    last_used_at: record.last_used_at,
    created_at: record.created_at,
  };
}
