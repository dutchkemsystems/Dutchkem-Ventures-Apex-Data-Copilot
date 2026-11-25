import crypto from "node:crypto";

export type EnvelopeScope = "user" | "admin";

export interface EncryptedEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  scope: EnvelopeScope;
  kek_id: string;
  kek_version: number;
  wrapped_dek: string;
  wrap_iv: string;
  wrap_tag: string;
  iv: string;
  tag: string;
  ciphertext: string;
  aad: string;
  encrypted_at: string;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function getKekId(scope: EnvelopeScope): string {
  return scope === "admin"
    ? process.env.KMS_KEK_ADMIN_ID || "kms-kek-admin-v1"
    : process.env.KMS_KEK_USER_ID || "kms-kek-user-v1";
}

function getMasterSeed(scope: EnvelopeScope): string {
  if (scope === "admin") {
    return process.env.KMS_KEK_ADMIN_SECRET || process.env.ADMIN_JWT_SECRET || "";
  }
  return (
    process.env.KMS_KEK_USER_SECRET ||
    process.env.USER_JWT_SECRET ||
    process.env.KORA_ENCRYPTION_KEY ||
    ""
  );
}

function deriveKek(scope: EnvelopeScope, kekId: string, version: number): Buffer {
  const seed = getMasterSeed(scope);
  if (!seed) {
    throw new Error(`Missing KMS master seed for KEK_${scope.toUpperCase()}.`);
  }
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(seed, "utf8"),
      Buffer.from(`apex:${scope}:${kekId}`, "utf8"),
      Buffer.from(`envelope-kek:v${version}:${scope}`, "utf8"),
      32
    )
  );
}

const activeKekVersions: Record<EnvelopeScope, { version: number; nextRotationAt: string }> = {
  user: {
    version: 1,
    nextRotationAt: new Date(Date.now() + NINETY_DAYS_MS).toISOString(),
  },
  admin: {
    version: 1,
    nextRotationAt: new Date(Date.now() + NINETY_DAYS_MS).toISOString(),
  },
};

export function encryptSensitiveField(
  scope: EnvelopeScope,
  plaintext: string,
  aadContext: string
): EncryptedEnvelope {
  const kekId = getKekId(scope);
  const version = activeKekVersions[scope].version;
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const wrapIv = crypto.randomBytes(12);
  const kek = deriveKek(scope, kekId, version);
  const aad = `apex:${scope}:${aadContext}`;

  try {
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const wrapCipher = crypto.createCipheriv("aes-256-gcm", kek, wrapIv);
    wrapCipher.setAAD(Buffer.from(`${scope}:${kekId}:v${version}`, "utf8"));
    const wrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
    const wrapTag = wrapCipher.getAuthTag();

    return {
      v: 1,
      alg: "AES-256-GCM",
      scope,
      kek_id: kekId,
      kek_version: version,
      wrapped_dek: wrappedDek.toString("base64url"),
      wrap_iv: wrapIv.toString("base64url"),
      wrap_tag: wrapTag.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: tag.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      aad,
      encrypted_at: new Date().toISOString(),
    };
  } finally {
    dek.fill(0);
    kek.fill(0);
  }
}

export function decryptSensitiveField(
  expectedScope: EnvelopeScope,
  envelope: EncryptedEnvelope
): string {
  if (envelope.scope !== expectedScope) {
    throw new Error(
      `Security violation: attempted to unwrap KEK_${envelope.scope.toUpperCase()} payload using KEK_${expectedScope.toUpperCase()}.`
    );
  }
  const kek = deriveKek(expectedScope, envelope.kek_id, envelope.kek_version);
  let dek: Buffer | null = null;
  try {
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

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      dek,
      Buffer.from(envelope.iv, "base64url")
    );
    decipher.setAAD(Buffer.from(envelope.aad, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } finally {
    if (dek) dek.fill(0);
    kek.fill(0);
  }
}

export function rotatePlaneKek(scope: EnvelopeScope) {
  activeKekVersions[scope].version += 1;
  activeKekVersions[scope].nextRotationAt = new Date(Date.now() + NINETY_DAYS_MS).toISOString();
  return activeKekVersions[scope];
}

export function maskSplitReference(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return `split_***_${ref.trim().slice(-4)}`;
}

export function maskRecipientId(id: string | null | undefined): string | null {
  if (!id) return null;
  return `rcpt_***_${id.trim().slice(-4)}`;
}
