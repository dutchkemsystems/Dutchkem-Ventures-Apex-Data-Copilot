import crypto from "node:crypto";

export type EnvelopeScope = "user" | "admin";

export interface EncryptedEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  scope: EnvelopeScope;
  kek_id: string;
  kek_version: number;
  wrapped_dek: string; // base64url AES-256-GCM wrapped 32-byte DEK
  wrap_iv: string; // base64url 12-byte IV for KEK wrapping
  wrap_tag: string; // base64url 16-byte GCM auth tag for KEK wrapping
  iv: string; // base64url 12-byte IV for DEK payload encryption
  tag: string; // base64url 16-byte GCM auth tag for payload
  ciphertext: string; // base64url ciphertext
  aad: string;
  encrypted_at: string;
}

export interface KekRotationState {
  scope: EnvelopeScope;
  kekId: string;
  version: number;
  rotationIntervalDays: 90;
  createdAt: string;
  lastRotatedAt: string;
  nextRotationAt: string;
}

export class EnvelopeScopeMismatchError extends Error {
  constructor(expected: EnvelopeScope, actual: EnvelopeScope) {
    super(
      `KEK plane mismatch: expected KEK_${expected.toUpperCase()} but envelope was sealed with KEK_${actual.toUpperCase()}.`
    );
    this.name = "EnvelopeScopeMismatchError";
  }
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function resolveKekMasterSeed(scope: EnvelopeScope): string {
  if (scope === "admin") {
    return (
      process.env.KMS_KEK_ADMIN_SECRET ||
      process.env.ADMIN_JWT_SECRET ||
      "dev_kek_admin_fallback_32bytes_seed"
    );
  }
  return (
    process.env.KMS_KEK_USER_SECRET ||
    process.env.USER_JWT_SECRET ||
    process.env.KORA_ENCRYPTION_KEY ||
    "dev_kek_user_fallback_32bytes_seed"
  );
}

export function getConfiguredKekId(scope: EnvelopeScope): string {
  if (scope === "admin") {
    return (process.env.KMS_KEK_ADMIN_ID || "kms-kek-admin-v1").trim();
  }
  return (process.env.KMS_KEK_USER_ID || "kms-kek-user-v1").trim();
}

export class EnvelopeKmsCrypto {
  private readonly kekStates: Record<EnvelopeScope, KekRotationState>;

  constructor() {
    const now = Date.now();
    const createdIso = new Date(now).toISOString();
    const nextIso = new Date(now + NINETY_DAYS_MS).toISOString();

    this.kekStates = {
      user: {
        scope: "user",
        kekId: getConfiguredKekId("user"),
        version: 1,
        rotationIntervalDays: 90,
        createdAt: createdIso,
        lastRotatedAt: createdIso,
        nextRotationAt: nextIso,
      },
      admin: {
        scope: "admin",
        kekId: getConfiguredKekId("admin"),
        version: 1,
        rotationIntervalDays: 90,
        createdAt: createdIso,
        lastRotatedAt: createdIso,
        nextRotationAt: nextIso,
      },
    };
  }

  private deriveKekBytes(scope: EnvelopeScope, kekId: string, version: number): Buffer {
    const seed = resolveKekMasterSeed(scope);
    const derived = crypto.hkdfSync(
      "sha256",
      Buffer.from(seed, "utf8"),
      Buffer.from(`apex:${scope}:${kekId}`, "utf8"),
      Buffer.from(`envelope-kek:v${version}:${scope}`, "utf8"),
      32
    );
    return Buffer.from(derived);
  }

  public getStatus(): {
    algorithm: "AES-256-GCM";
    envelopeEncryption: true;
    rotationPolicyDays: 90;
    keks: Record<EnvelopeScope, KekRotationState>;
  } {
    return {
      algorithm: "AES-256-GCM",
      envelopeEncryption: true,
      rotationPolicyDays: 90,
      keks: {
        user: { ...this.kekStates.user },
        admin: { ...this.kekStates.admin },
      },
    };
  }

  public encryptField(
    scope: EnvelopeScope,
    plaintext: string,
    aadContext = "sensitive_field"
  ): EncryptedEnvelope {
    const state = this.kekStates[scope];
    // 1. Unique per-field 256-bit DEK
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const wrapIv = crypto.randomBytes(12);
    const kek = this.deriveKekBytes(scope, state.kekId, state.version);
    const fullAad = `apex:${scope}:${aadContext}`;

    try {
      // 2. Encrypt plaintext with DEK using AES-256-GCM
      const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
      cipher.setAAD(Buffer.from(fullAad, "utf8"));
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();

      // 3. Wrap DEK with scoped KEK (KEK_USER or KEK_ADMIN)
      const wrapCipher = crypto.createCipheriv("aes-256-gcm", kek, wrapIv);
      wrapCipher.setAAD(Buffer.from(`${scope}:${state.kekId}:v${state.version}`, "utf8"));
      const wrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
      const wrapTag = wrapCipher.getAuthTag();

      return {
        v: 1,
        alg: "AES-256-GCM",
        scope,
        kek_id: state.kekId,
        kek_version: state.version,
        wrapped_dek: wrappedDek.toString("base64url"),
        wrap_iv: wrapIv.toString("base64url"),
        wrap_tag: wrapTag.toString("base64url"),
        iv: iv.toString("base64url"),
        tag: tag.toString("base64url"),
        ciphertext: encrypted.toString("base64url"),
        aad: fullAad,
        encrypted_at: new Date().toISOString(),
      };
    } finally {
      dek.fill(0);
      kek.fill(0);
    }
  }

  public decryptField(expectedScope: EnvelopeScope, envelope: EncryptedEnvelope): string {
    if (envelope.scope !== expectedScope) {
      throw new EnvelopeScopeMismatchError(expectedScope, envelope.scope);
    }
    const kek = this.deriveKekBytes(expectedScope, envelope.kek_id, envelope.kek_version);
    let dek: Buffer | null = null;
    try {
      // Unwrap DEK using matching KEK version
      const unwrapDecipher = crypto.createDecipheriv(
        "aes-256-gcm",
        kek,
        Buffer.from(envelope.wrap_iv, "base64url")
      );
      unwrapDecipher.setAAD(
        Buffer.from(`${expectedScope}:${envelope.kek_id}:v${envelope.kek_version}`, "utf8")
      );
      unwrapDecipher.setAuthTag(Buffer.from(envelope.wrap_tag, "base64url"));
      dek = Buffer.concat([
        unwrapDecipher.update(Buffer.from(envelope.wrapped_dek, "base64url")),
        unwrapDecipher.final(),
      ]);

      // Decrypt ciphertext using DEK
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        dek,
        Buffer.from(envelope.iv, "base64url")
      );
      decipher.setAAD(Buffer.from(envelope.aad, "utf8"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
      const plaintextBuf = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]);
      return plaintextBuf.toString("utf8");
    } finally {
      if (dek) dek.fill(0);
      kek.fill(0);
    }
  }

  public rotateKek(scope: EnvelopeScope): KekRotationState {
    const state = this.kekStates[scope];
    const now = Date.now();
    state.version += 1;
    state.lastRotatedAt = new Date(now).toISOString();
    state.nextRotationAt = new Date(now + NINETY_DAYS_MS).toISOString();
    return { ...state };
  }

  public rewrapEnvelope(envelope: EncryptedEnvelope): EncryptedEnvelope {
    const state = this.kekStates[envelope.scope];
    if (envelope.kek_version === state.version && envelope.kek_id === state.kekId) {
      return envelope;
    }
    const oldKek = this.deriveKekBytes(envelope.scope, envelope.kek_id, envelope.kek_version);
    const newKek = this.deriveKekBytes(envelope.scope, state.kekId, state.version);
    let dek: Buffer | null = null;

    try {
      const unwrapDecipher = crypto.createDecipheriv(
        "aes-256-gcm",
        oldKek,
        Buffer.from(envelope.wrap_iv, "base64url")
      );
      unwrapDecipher.setAAD(
        Buffer.from(`${envelope.scope}:${envelope.kek_id}:v${envelope.kek_version}`, "utf8")
      );
      unwrapDecipher.setAuthTag(Buffer.from(envelope.wrap_tag, "base64url"));
      dek = Buffer.concat([
        unwrapDecipher.update(Buffer.from(envelope.wrapped_dek, "base64url")),
        unwrapDecipher.final(),
      ]);

      const nextWrapIv = crypto.randomBytes(12);
      const wrapCipher = crypto.createCipheriv("aes-256-gcm", newKek, nextWrapIv);
      wrapCipher.setAAD(
        Buffer.from(`${envelope.scope}:${state.kekId}:v${state.version}`, "utf8")
      );
      const nextWrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
      const nextWrapTag = wrapCipher.getAuthTag();

      return {
        ...envelope,
        kek_id: state.kekId,
        kek_version: state.version,
        wrapped_dek: nextWrappedDek.toString("base64url"),
        wrap_iv: nextWrapIv.toString("base64url"),
        wrap_tag: nextWrapTag.toString("base64url"),
      };
    } finally {
      if (dek) dek.fill(0);
      oldKek.fill(0);
      newKek.fill(0);
    }
  }
}

// ==================== SENSITIVE FIELD MASKING HELPERS ====================

export function maskKoraSplitReference(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const suffix = trimmed.slice(-4);
  return `split_***_${suffix}`;
}

export function maskKoraRecipientId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const suffix = trimmed.slice(-4);
  return `rcpt_***_${suffix}`;
}

export function maskKoraTransactionReference(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "tx_***_0000";
  const suffix = trimmed.slice(-4);
  return `tx_***_${suffix}`;
}

export function maskTaxReceiptUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/tax-receipts\/([^/]+)\/pdf/i);
  if (!match) {
    return `receipt_***_${url.slice(-4)}`;
  }
  const suffix = match[1].slice(-4);
  return `/api/kora-escrow/tax-receipts/rcpt_***_${suffix}/pdf`;
}
