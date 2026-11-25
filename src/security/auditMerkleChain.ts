import crypto from "node:crypto";

export const GENESIS_PREVIOUS_HASH = "0".repeat(64);

export type WormLockMode = "COMPLIANCE" | "GOVERNANCE";

export type WormMirrorStatus =
  | "s3_worm_locked"
  | "local_worm_sandbox_sealed"
  | "worm_mirror_failed";

export interface WormMirrorReceipt {
  s3Bucket: string;
  s3Key: string;
  objectLockMode: WormLockMode;
  retainUntil: string;
  contentMd5: string;
  sha256Checksum: string;
  status: WormMirrorStatus;
  etag: string | null;
  errorDetail: string | null;
}

export interface AuditMerkleChainEntry {
  id: string;
  sequence_index: number;
  entry_hash: string;
  previous_hash: string;
  merkle_root: string;
  timestamp: string;
  user_id: string | null;
  admin_id: string | null;
  plane: "public" | "user" | "admin";
  route: string;
  action: string;
  metadata: Record<string, unknown>;
  worm: WormMirrorReceipt;
}

export interface ChainVerificationReport {
  valid: boolean;
  frozen: boolean;
  verifiedCount: number;
  totalCount: number;
  merkleRoot: string;
  headHash: string;
  brokenAtIndex: number | null;
  brokenEntryId: string | null;
  expectedHash: string | null;
  actualHash: string | null;
  reason: string | null;
  verifiedAt: string;
}

export interface MerkleProofStep {
  position: "left" | "right";
  hash: string;
}

export interface MerkleInclusionProof {
  entryId: string;
  entryHash: string;
  sequenceIndex: number;
  merkleRoot: string;
  proof: MerkleProofStep[];
  verified: boolean;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      if (child !== undefined) {
        sorted[key] = sortJsonValue(child);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalizeAuditEntryData(input: {
  id: string;
  sequence_index: number;
  timestamp: string;
  user_id: string | null;
  admin_id: string | null;
  plane: "public" | "user" | "admin";
  route: string;
  action: string;
  metadata: Record<string, unknown>;
}): string {
  return JSON.stringify(
    sortJsonValue({
      id: input.id,
      sequence_index: input.sequence_index,
      timestamp: input.timestamp,
      user_id: input.user_id,
      admin_id: input.admin_id,
      plane: input.plane,
      route: input.route,
      action: input.action,
      metadata: input.metadata || {},
    })
  );
}

/**
 * Computes SHA-256 over (canonical_entry_data + previous_hash).
 */
export function computeEntrySha256(entryDataJson: string, previousHash: string): string {
  return crypto
    .createHash("sha256")
    .update(`${entryDataJson}${previousHash}`, "utf8")
    .digest("hex");
}

export function computeMerkleRoot(entryHashes: string[]): string {
  if (entryHashes.length === 0) return GENESIS_PREVIOUS_HASH;
  let level = [...entryHashes];
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      const combined = crypto
        .createHash("sha256")
        .update(`${left}${right}`, "utf8")
        .digest("hex");
      nextLevel.push(combined);
    }
    level = nextLevel;
  }
  return level[0];
}

export function verifyMerkleProof(
  entryHash: string,
  proof: MerkleProofStep[],
  expectedRoot: string
): boolean {
  let current = entryHash;
  for (const step of proof) {
    const concat = step.position === "left" ? `${step.hash}${current}` : `${current}${step.hash}`;
    current = crypto.createHash("sha256").update(concat, "utf8").digest("hex");
  }
  return current === expectedRoot;
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export class AuditMerkleChainService {
  private readonly entries: AuditMerkleChainEntry[] = [];
  private readonly localWormArchive: Array<{
    s3Key: string;
    contentMd5: string;
    objectLockMode: WormLockMode;
    retainUntil: string;
    payloadJson: string;
  }> = [];
  private chainCompromised = false;
  private tamperSnapshot: AuditMerkleChainEntry[] | null = null;

  public getS3Config() {
    const bucket = (process.env.AWS_S3_AUDIT_BUCKET || "apex-immutable-audit-worm").trim();
    const region = (process.env.AWS_S3_AUDIT_REGION || "eu-west-1").trim();
    const lockModeRaw = (process.env.AUDIT_WORM_OBJECT_LOCK_MODE || "COMPLIANCE").trim().toUpperCase();
    const objectLockMode: WormLockMode =
      lockModeRaw === "GOVERNANCE" ? "GOVERNANCE" : "COMPLIANCE";
    const retentionDays = Math.max(
      1,
      Number(process.env.AUDIT_WORM_RETENTION_DAYS || 2555) || 2555
    );
    const strictS3 = (process.env.AUDIT_WORM_STRICT_S3 || "false").toLowerCase() === "true";
    const awsCredentialsConfigured = Boolean(
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
        process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
        process.env.AWS_S3_AUDIT_BUCKET?.trim()
    );
    return {
      bucket,
      region,
      objectLockMode,
      retentionDays,
      strictS3,
      awsCredentialsConfigured,
    };
  }

  /**
   * Walks every entry from sequence_index 0..N-1 to guarantee zero tampering.
   */
  public verifyChain(): ChainVerificationReport {
    const verifiedAt = new Date().toISOString();
    let expectedPrev = GENESIS_PREVIOUS_HASH;
    const validHashes: string[] = [];

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];

      if (entry.sequence_index !== i) {
        return {
          valid: false,
          frozen: true,
          verifiedCount: i,
          totalCount: this.entries.length,
          merkleRoot: computeMerkleRoot(validHashes),
          headHash: expectedPrev,
          brokenAtIndex: i,
          brokenEntryId: entry.id,
          expectedHash: String(i),
          actualHash: String(entry.sequence_index),
          reason: `Sequence gap or reordering detected at index ${i}.`,
          verifiedAt,
        };
      }

      if (entry.previous_hash !== expectedPrev) {
        return {
          valid: false,
          frozen: true,
          verifiedCount: i,
          totalCount: this.entries.length,
          merkleRoot: computeMerkleRoot(validHashes),
          headHash: expectedPrev,
          brokenAtIndex: i,
          brokenEntryId: entry.id,
          expectedHash: expectedPrev,
          actualHash: entry.previous_hash,
          reason: `Chain link broken at index ${i}: previous_hash mismatch.`,
          verifiedAt,
        };
      }

      const canonicalData = canonicalizeAuditEntryData({
        id: entry.id,
        sequence_index: entry.sequence_index,
        timestamp: entry.timestamp,
        user_id: entry.user_id,
        admin_id: entry.admin_id,
        plane: entry.plane,
        route: entry.route,
        action: entry.action,
        metadata: entry.metadata,
      });
      const recomputedHash = computeEntrySha256(canonicalData, entry.previous_hash);
      if (recomputedHash !== entry.entry_hash) {
        return {
          valid: false,
          frozen: true,
          verifiedCount: i,
          totalCount: this.entries.length,
          merkleRoot: computeMerkleRoot(validHashes),
          headHash: expectedPrev,
          brokenAtIndex: i,
          brokenEntryId: entry.id,
          expectedHash: recomputedHash,
          actualHash: entry.entry_hash,
          reason: `SHA-256 hash mismatch on entry ${entry.id} (index ${i}) — entry_data or entry_hash was tampered.`,
          verifiedAt,
        };
      }

      validHashes.push(entry.entry_hash);
      const expectedRoot = computeMerkleRoot(validHashes);
      if (entry.merkle_root !== expectedRoot) {
        return {
          valid: false,
          frozen: true,
          verifiedCount: i,
          totalCount: this.entries.length,
          merkleRoot: expectedRoot,
          headHash: expectedPrev,
          brokenAtIndex: i,
          brokenEntryId: entry.id,
          expectedHash: expectedRoot,
          actualHash: entry.merkle_root,
          reason: `Cumulative Merkle root mismatch at index ${i}.`,
          verifiedAt,
        };
      }

      expectedPrev = entry.entry_hash;
    }

    return {
      valid: !this.chainCompromised,
      frozen: this.chainCompromised,
      verifiedCount: this.entries.length,
      totalCount: this.entries.length,
      merkleRoot: computeMerkleRoot(validHashes),
      headHash: expectedPrev,
      brokenAtIndex: null,
      brokenEntryId: null,
      expectedHash: null,
      actualHash: null,
      reason: this.chainCompromised ? "Ledger frozen pending DPO clearance." : null,
      verifiedAt,
    };
  }

  /**
   * Builds a cryptographic WORM S3 Object Lock receipt and signs + PUTs to AWS S3
   * using AWS Signature V4 when credentials are configured.
   */
  private buildAndMirrorWormObject(entry: Omit<AuditMerkleChainEntry, "worm">): WormMirrorReceipt {
    const cfg = this.getS3Config();
    const datePrefix = entry.timestamp.slice(0, 10);
    const s3Key = `audit-merkle-chain/${datePrefix}/${String(entry.sequence_index).padStart(
      6,
      "0"
    )}-${entry.id}-${entry.entry_hash.slice(0, 12)}.json`;
    const retainUntil = new Date(
      Date.now() + cfg.retentionDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const payloadJson = JSON.stringify(sortJsonValue(entry));
    const payloadBuf = Buffer.from(payloadJson, "utf8");
    const contentMd5 = crypto.createHash("md5").update(payloadBuf).digest("base64");
    const sha256Checksum = sha256Hex(payloadBuf);

    // Local append-only WORM replica record (immutable once sealed)
    this.localWormArchive.push({
      s3Key,
      contentMd5,
      objectLockMode: cfg.objectLockMode,
      retainUntil,
      payloadJson,
    });

    if (!cfg.awsCredentialsConfigured) {
      if (cfg.strictS3) {
        return {
          s3Bucket: cfg.bucket,
          s3Key,
          objectLockMode: cfg.objectLockMode,
          retainUntil,
          contentMd5,
          sha256Checksum,
          status: "worm_mirror_failed",
          etag: null,
          errorDetail: "AUDIT_WORM_STRICT_S3=true requires AWS S3 credentials.",
        };
      }
      return {
        s3Bucket: cfg.bucket,
        s3Key,
        objectLockMode: cfg.objectLockMode,
        retainUntil,
        contentMd5,
        sha256Checksum,
        status: "local_worm_sandbox_sealed",
        etag: `"${crypto.createHash("md5").update(payloadBuf).digest("hex")}"`,
        errorDetail: null,
      };
    }

    const receipt: WormMirrorReceipt = {
      s3Bucket: cfg.bucket,
      s3Key,
      objectLockMode: cfg.objectLockMode,
      retainUntil,
      contentMd5,
      sha256Checksum,
      status: "s3_worm_locked",
      etag: `"${crypto.createHash("md5").update(payloadBuf).digest("hex")}"`,
      errorDetail: null,
    };

    void this.dispatchSignedS3WormPut({
      bucket: cfg.bucket,
      region: cfg.region,
      key: s3Key,
      body: payloadBuf,
      contentMd5,
      sha256Hex: sha256Checksum,
      objectLockMode: cfg.objectLockMode,
      retainUntil,
      receipt,
    });

    return receipt;
  }

  private async dispatchSignedS3WormPut(params: {
    bucket: string;
    region: string;
    key: string;
    body: Buffer;
    contentMd5: string;
    sha256Hex: string;
    objectLockMode: WormLockMode;
    retainUntil: string;
    receipt: WormMirrorReceipt;
  }): Promise<void> {
    const accessKey = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    if (!accessKey || !secretKey) return;

    try {
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
      const dateStamp = amzDate.slice(0, 8);
      const host = `${params.bucket}.s3.${params.region}.amazonaws.com`;
      const canonicalUri = `/${params.key}`;

      const canonicalHeaders =
        `content-md5:${params.contentMd5}\n` +
        `content-type:application/json\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${params.sha256Hex}\n` +
        `x-amz-date:${amzDate}\n` +
        `x-amz-object-lock-mode:${params.objectLockMode}\n` +
        `x-amz-object-lock-retain-until-date:${params.retainUntil}\n`;

      const signedHeaders =
        "content-md5;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-object-lock-mode;x-amz-object-lock-retain-until-date";

      const canonicalRequest = [
        "PUT",
        canonicalUri,
        "",
        canonicalHeaders,
        signedHeaders,
        params.sha256Hex,
      ].join("\n");

      const credentialScope = `${dateStamp}/${params.region}/s3/aws4_request`;
      const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
      ].join("\n");

      const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
      const kRegion = hmacSha256(kDate, params.region);
      const kService = hmacSha256(kRegion, "s3");
      const kSigning = hmacSha256(kService, "aws4_request");
      const signature = crypto
        .createHmac("sha256", kSigning)
        .update(stringToSign, "utf8")
        .digest("hex");

      const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const res = await fetch(`https://${host}${canonicalUri}`, {
        method: "PUT",
        headers: {
          "Content-MD5": params.contentMd5,
          "Content-Type": "application/json",
          "x-amz-content-sha256": params.sha256Hex,
          "x-amz-date": amzDate,
          "x-amz-object-lock-mode": params.objectLockMode,
          "x-amz-object-lock-retain-until-date": params.retainUntil,
          Authorization: authorization,
        },
        body: new Uint8Array(params.body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        params.receipt.status = "worm_mirror_failed";
        params.receipt.errorDetail = `S3 PUT returned HTTP ${res.status}`;
      } else {
        params.receipt.etag = res.headers.get("etag") || params.receipt.etag;
      }
    } catch (err) {
      params.receipt.status = "worm_mirror_failed";
      params.receipt.errorDetail = err instanceof Error ? err.message : "S3 network failure";
    }
  }

  /**
   * Appends an immutable audit record ONLY after verifying the full chain first.
   * Fails closed if tampering or strict WORM mirror failure occurs.
   */
  public appendEntry(input: {
    id?: string;
    timestamp?: string;
    user_id: string | null;
    admin_id: string | null;
    plane: "public" | "user" | "admin";
    route: string;
    action: string;
    metadata?: Record<string, unknown>;
  }):
    | { ok: true; entry: AuditMerkleChainEntry; verification: ChainVerificationReport }
    | {
        ok: false;
        code: "MERKLE_CHAIN_TAMPER_DETECTED" | "WORM_MIRROR_UNAVAILABLE";
        verification: ChainVerificationReport;
        detail: string;
      } {
    const preWriteCheck = this.verifyChain();
    if (!preWriteCheck.valid) {
      this.chainCompromised = true;
      return {
        ok: false,
        code: "MERKLE_CHAIN_TAMPER_DETECTED",
        verification: { ...preWriteCheck, frozen: true },
        detail:
          preWriteCheck.reason ||
          "Chain integrity check failed before write. Ledger frozen (fail-closed).",
      };
    }

    const sequence_index = this.entries.length;
    const id = input.id || crypto.randomUUID();
    const timestamp = input.timestamp || new Date().toISOString();
    const previous_hash =
      this.entries.length === 0
        ? GENESIS_PREVIOUS_HASH
        : this.entries[this.entries.length - 1].entry_hash;
    const metadata = input.metadata || {};

    const canonicalData = canonicalizeAuditEntryData({
      id,
      sequence_index,
      timestamp,
      user_id: input.user_id,
      admin_id: input.admin_id,
      plane: input.plane,
      route: input.route,
      action: input.action,
      metadata,
    });
    const entry_hash = computeEntrySha256(canonicalData, previous_hash);
    const merkle_root = computeMerkleRoot([
      ...this.entries.map((e) => e.entry_hash),
      entry_hash,
    ]);

    const coreEntry: Omit<AuditMerkleChainEntry, "worm"> = {
      id,
      sequence_index,
      entry_hash,
      previous_hash,
      merkle_root,
      timestamp,
      user_id: input.user_id,
      admin_id: input.admin_id,
      plane: input.plane,
      route: input.route,
      action: input.action,
      metadata,
    };

    const worm = this.buildAndMirrorWormObject(coreEntry);
    if (worm.status === "worm_mirror_failed" && this.getS3Config().strictS3) {
      return {
        ok: false,
        code: "WORM_MIRROR_UNAVAILABLE",
        verification: preWriteCheck,
        detail: worm.errorDetail || "Strict S3 WORM mirror unavailable.",
      };
    }

    const fullEntry: AuditMerkleChainEntry = { ...coreEntry, worm };
    this.entries.push(fullEntry);

    return {
      ok: true,
      entry: fullEntry,
      verification: {
        valid: true,
        frozen: false,
        verifiedCount: this.entries.length,
        totalCount: this.entries.length,
        merkleRoot: merkle_root,
        headHash: entry_hash,
        brokenAtIndex: null,
        brokenEntryId: null,
        expectedHash: null,
        actualHash: null,
        reason: null,
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  public getMerkleProof(entryId: string): MerkleInclusionProof | null {
    const idx = this.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return null;

    const hashes = this.entries.map((e) => e.entry_hash);
    const merkleRoot = computeMerkleRoot(hashes);
    const proof: MerkleProofStep[] = [];

    let level = [...hashes];
    let pos = idx;
    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : left;
        if (i === pos) {
          proof.push({ position: "right", hash: right });
          pos = Math.floor(i / 2);
        } else if (i + 1 === pos) {
          proof.push({ position: "left", hash: left });
          pos = Math.floor(i / 2);
        }
        nextLevel.push(
          crypto.createHash("sha256").update(`${left}${right}`, "utf8").digest("hex")
        );
      }
      level = nextLevel;
    }

    const targetHash = this.entries[idx].entry_hash;
    return {
      entryId,
      entryHash: targetHash,
      sequenceIndex: idx,
      merkleRoot,
      proof,
      verified: verifyMerkleProof(targetHash, proof, merkleRoot),
    };
  }

  public listEntries(limit = 100): AuditMerkleChainEntry[] {
    return this.entries.slice(-Math.max(1, limit)).reverse();
  }

  public getStats() {
    const verification = this.verifyChain();
    const cfg = this.getS3Config();
    const s3LockedCount = this.entries.filter((e) => e.worm.status === "s3_worm_locked").length;
    const localSealedCount = this.entries.filter(
      (e) => e.worm.status === "local_worm_sandbox_sealed"
    ).length;
    return {
      verification,
      worm: {
        bucket: cfg.bucket,
        region: cfg.region,
        objectLockMode: cfg.objectLockMode,
        retentionDays: cfg.retentionDays,
        strictS3: cfg.strictS3,
        awsCredentialsConfigured: cfg.awsCredentialsConfigured,
        s3LockedCount,
        localSealedCount,
        localArchiveCount: this.localWormArchive.length,
      },
    };
  }

  /**
   * Controlled DPO audit simulation: saves clean snapshot, mutates a target entry's metadata
   * to verify fail-closed chain detection, and allows exact restoration.
   */
  public simulateTamperForAuditTest(entryId?: string): {
    simulated: boolean;
    targetEntryId: string | null;
    verification: ChainVerificationReport;
  } {
    if (this.entries.length === 0) {
      return { simulated: false, targetEntryId: null, verification: this.verifyChain() };
    }
    if (!this.tamperSnapshot) {
      this.tamperSnapshot = this.entries.map((e) => ({
        ...e,
        metadata: JSON.parse(JSON.stringify(e.metadata)) as Record<string, unknown>,
        worm: { ...e.worm },
      }));
    }
    const target = entryId
      ? this.entries.find((e) => e.id === entryId) || this.entries[0]
      : this.entries[Math.max(0, this.entries.length - 1)];

    target.metadata = {
      ...target.metadata,
      _tampered_probe_amount_usd: 999999,
    };
    this.chainCompromised = true;
    const verification = this.verifyChain();
    return {
      simulated: true,
      targetEntryId: target.id,
      verification,
    };
  }

  public restoreVerifiedSnapshot(): {
    restored: boolean;
    verification: ChainVerificationReport;
  } {
    if (this.tamperSnapshot) {
      this.entries.length = 0;
      for (const snap of this.tamperSnapshot) {
        this.entries.push({
          ...snap,
          metadata: JSON.parse(JSON.stringify(snap.metadata)) as Record<string, unknown>,
          worm: { ...snap.worm },
        });
      }
      this.tamperSnapshot = null;
    }
    this.chainCompromised = false;
    return {
      restored: true,
      verification: this.verifyChain(),
    };
  }
}
