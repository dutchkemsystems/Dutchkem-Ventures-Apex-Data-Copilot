import crypto from "node:crypto";
import type { BlockchainEscrowRecord } from "../types/tenant.js";

export const MIN_ENTERPRISE_ESCROW_USD = 10_000;
export const POLYGON_CHAIN_ID = 137 as const;
export const POLYGON_USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
export const POLYGON_ESTIMATED_GAS_USD = 0.04;

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function resolveContractAddress(): string {
  const configured = (process.env.POLYGON_ESCROW_CONTRACT_ADDRESS || "").trim();
  if (EVM_ADDRESS_RE.test(configured)) {
    return configured;
  }
  return "0x7A4eD91c3B8F2E4918cA50D41B8e93F2104c9E18";
}

function getOracleSigningKey(): Buffer {
  const configured = (process.env.POLYGON_QA_ORACLE_SECRET || "").trim();
  if (configured) {
    return crypto.createHash("sha256").update(configured, "utf8").digest();
  }
  // Process-scoped ephemeral fallback when POLYGON_QA_ORACLE_SECRET is not set
  return fallbackOracleKey;
}

const fallbackOracleKey = crypto.randomBytes(32);

export function isEnterpriseBlockchainEligible(amountUsd: number): boolean {
  return Number.isFinite(amountUsd) && amountUsd > MIN_ENTERPRISE_ESCROW_USD;
}

export class BlockchainEscrowService {
  private readonly contractsByJob = new Map<string, BlockchainEscrowRecord>();
  private readonly contractAddress: string;

  constructor() {
    this.contractAddress = resolveContractAddress();
    this.seedEnterpriseContract();
  }

  private seedEnterpriseContract(): void {
    const nowIso = "2026-11-16T09:30:00Z";
    const amountUsd = 24_500;
    const seedRecord: BlockchainEscrowRecord = {
      id: "poly-escrow-seed-1504",
      job_id: "jb-1504-enterprise-polygon",
      org_id: "8a1f3c20-4b11-4d9a-9f12-000000000001",
      client_org_name: "Meridian Autonomous Systems",
      client_wallet_address: "0x4B91C2aE7410F9812D0e76A3b18C59d340118e21",
      freelancer_name: "Elena Rostova (Verified Audio Cohort)",
      freelancer_wallet_address: "0x91D3F08E22b44c9A7512C0f8D2B4a3C88142E90A",
      network: "polygon",
      chain_id: POLYGON_CHAIN_ID,
      contract_address: this.contractAddress,
      usdc_token_address: POLYGON_USDC_ADDRESS,
      amount_usd: amountUsd,
      amount_usdc_units: String(BigInt(Math.round(amountUsd * 1_000_000))),
      freelancer_payout_usdc: null,
      platform_fee_usdc: null,
      estimated_gas_usd: POLYGON_ESTIMATED_GAS_USD,
      deposit_tx_hash:
        "0x8a4f2c90e1b7d31456890f12a4d7c8910e3f4b5a6c7d8e9f0123456789abcdef",
      settlement_tx_hash: null,
      qa_oracle_report_hash: null,
      qa_oracle_signature: null,
      qa_passed: null,
      status: "locked",
      block_number: 64_182_904,
      locked_at: nowIso,
      settled_at: null,
      created_at: nowIso,
    };
    this.contractsByJob.set(seedRecord.job_id, seedRecord);
  }

  public getMetadata() {
    return {
      network: "polygon" as const,
      chainId: POLYGON_CHAIN_ID,
      usdcTokenAddress: POLYGON_USDC_ADDRESS,
      contractAddress: this.contractAddress,
      minContractUsd: MIN_ENTERPRISE_ESCROW_USD,
      estimatedGasUsd: POLYGON_ESTIMATED_GAS_USD,
      rpcConfigured: Boolean((process.env.POLYGON_RPC_URL || "").trim()),
    };
  }

  public getContractByJobId(jobId: string): BlockchainEscrowRecord | null {
    return this.contractsByJob.get(jobId) || null;
  }

  public listContracts(): BlockchainEscrowRecord[] {
    return Array.from(this.contractsByJob.values()).sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    );
  }

  public validateThresholdFailClosed(amountUsd: number):
    | { ok: true }
    | { ok: false; status: number; code: string; detail: string } {
    if (!isEnterpriseBlockchainEligible(amountUsd)) {
      return {
        ok: false,
        status: 422,
        code: "POLYGON_ESCROW_MINIMUM_NOT_MET",
        detail: `Fail closed: Polygon USDC Smart Contract Escrow is restricted strictly to enterprise contracts > $${MIN_ENTERPRISE_ESCROW_USD.toLocaleString()} (received $${Number(amountUsd || 0).toLocaleString()}). Use standard Kora Pay Escrow for <= $${MIN_ENTERPRISE_ESCROW_USD.toLocaleString()}.`,
      };
    }
    return { ok: true };
  }

  public async depositUsdcEscrow(params: {
    jobId: string;
    orgId: string;
    clientOrgName: string;
    clientWallet?: string;
    freelancerName: string;
    freelancerWallet?: string;
    amountUsd: number;
  }): Promise<
    | { ok: true; escrow: BlockchainEscrowRecord }
    | { ok: false; status: number; code: string; detail: string }
  > {
    const thresholdCheck = this.validateThresholdFailClosed(params.amountUsd);
    if (!thresholdCheck.ok) return thresholdCheck;

    const existing = this.contractsByJob.get(params.jobId);
    if (existing && (existing.status === "locked" || existing.status === "released")) {
      return {
        ok: false,
        status: 409,
        code: "ESCROW_ALREADY_LOCKED",
        detail: `Polygon Escrow for job ${params.jobId} is already ${existing.status}.`,
      };
    }

    const clientWallet = (params.clientWallet || "").trim() || "0x4B91C2aE7410F9812D0e76A3b18C59d340118e21";
    const freelancerWallet =
      (params.freelancerWallet || "").trim() || "0x91D3F08E22b44c9A7512C0f8D2B4a3C88142E90A";

    if (!EVM_ADDRESS_RE.test(clientWallet) || !EVM_ADDRESS_RE.test(freelancerWallet)) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_POLYGON_WALLET",
        detail: "Client and freelancer wallets must be valid 42-character Polygon 0x EVM addresses.",
      };
    }

    const blockNumber = await this.fetchLiveBlockOrSimulated();
    const nowIso = new Date().toISOString();
    const roundedAmount = Math.round(params.amountUsd * 100) / 100;
    const usdcUnits = String(BigInt(Math.round(roundedAmount * 1_000_000)));
    const txHash =
      "0x" +
      crypto
        .createHash("sha256")
        .update(`polygon_deposit:${params.jobId}:${clientWallet}:${usdcUnits}:${nowIso}`)
        .digest("hex");

    const record: BlockchainEscrowRecord = {
      id: `poly-escrow-${crypto.randomUUID().slice(0, 8)}`,
      job_id: params.jobId,
      org_id: params.orgId,
      client_org_name: params.clientOrgName,
      client_wallet_address: clientWallet,
      freelancer_name: params.freelancerName,
      freelancer_wallet_address: freelancerWallet,
      network: "polygon",
      chain_id: POLYGON_CHAIN_ID,
      contract_address: this.contractAddress,
      usdc_token_address: POLYGON_USDC_ADDRESS,
      amount_usd: roundedAmount,
      amount_usdc_units: usdcUnits,
      freelancer_payout_usdc: null,
      platform_fee_usdc: null,
      estimated_gas_usd: POLYGON_ESTIMATED_GAS_USD,
      deposit_tx_hash: txHash,
      settlement_tx_hash: null,
      qa_oracle_report_hash: null,
      qa_oracle_signature: null,
      qa_passed: null,
      status: "locked",
      block_number: blockNumber,
      locked_at: nowIso,
      settled_at: null,
      created_at: nowIso,
    };

    this.contractsByJob.set(params.jobId, record);
    return { ok: true, escrow: record };
  }

  public async oracleConfirmAndRelease(params: {
    jobId: string;
    qaPassed: boolean;
    qaSummary: string;
  }): Promise<
    | { ok: true; escrow: BlockchainEscrowRecord }
    | { ok: false; status: number; code: string; detail: string }
  > {
    const escrow = this.contractsByJob.get(params.jobId);
    if (!escrow) {
      return {
        ok: false,
        status: 404,
        code: "POLYGON_ESCROW_NOT_FOUND",
        detail: "No Polygon USDC Smart Contract Escrow found for this job.",
      };
    }

    const thresholdCheck = this.validateThresholdFailClosed(escrow.amount_usd);
    if (!thresholdCheck.ok) return thresholdCheck;

    if (escrow.status !== "locked") {
      return {
        ok: false,
        status: 409,
        code: "ESCROW_NOT_LOCKED",
        detail: `Cannot settle escrow in '${escrow.status}' state (fail closed).`,
      };
    }

    if (!params.qaPassed) {
      return {
        ok: false,
        status: 422,
        code: "QA_ORACLE_REJECTED_RELEASE",
        detail: "QA Oracle rejected deliverable. On-chain release denied; trigger refund to client instead.",
      };
    }

    const nowIso = new Date().toISOString();
    const qaReportHash =
      "0x" +
      crypto
        .createHash("sha256")
        .update(`${escrow.job_id}|PASS|${params.qaSummary}|${nowIso}`)
        .digest("hex");

    const oracleSignature =
      "0x" +
      crypto
        .createHmac("sha256", getOracleSigningKey())
        .update(`confirmQaAndRelease:${POLYGON_CHAIN_ID}:${escrow.contract_address}:${escrow.job_id}:${qaReportHash}`)
        .digest("hex");

    const settlementTx =
      "0x" +
      crypto
        .createHash("sha256")
        .update(`polygon_release:${qaReportHash}:${oracleSignature}`)
        .digest("hex");

    const freelancer85 = Math.round(escrow.amount_usd * 0.85 * 100) / 100;
    const platform15 = Math.round((escrow.amount_usd - freelancer85) * 100) / 100;

    escrow.status = "released";
    escrow.qa_passed = true;
    escrow.qa_oracle_report_hash = qaReportHash;
    escrow.qa_oracle_signature = oracleSignature;
    escrow.settlement_tx_hash = settlementTx;
    escrow.freelancer_payout_usdc = freelancer85;
    escrow.platform_fee_usdc = platform15;
    escrow.block_number = await this.fetchLiveBlockOrSimulated(escrow.block_number ?? 64_182_904);
    escrow.settled_at = nowIso;

    return { ok: true, escrow };
  }

  public async oracleRefundClientOnQaFailure(params: {
    jobId: string;
    reason: string;
  }): Promise<
    | { ok: true; escrow: BlockchainEscrowRecord }
    | { ok: false; status: number; code: string; detail: string }
  > {
    const escrow = this.contractsByJob.get(params.jobId);
    if (!escrow) {
      return {
        ok: false,
        status: 404,
        code: "POLYGON_ESCROW_NOT_FOUND",
        detail: "No Polygon USDC Smart Contract Escrow found for this job.",
      };
    }

    const thresholdCheck = this.validateThresholdFailClosed(escrow.amount_usd);
    if (!thresholdCheck.ok) return thresholdCheck;

    if (escrow.status !== "locked") {
      return {
        ok: false,
        status: 409,
        code: "ESCROW_NOT_LOCKED",
        detail: `Cannot refund escrow in '${escrow.status}' state (fail closed).`,
      };
    }

    const nowIso = new Date().toISOString();
    const qaReportHash =
      "0x" +
      crypto
        .createHash("sha256")
        .update(`${escrow.job_id}|FAIL|${params.reason}|${nowIso}`)
        .digest("hex");

    const oracleSignature =
      "0x" +
      crypto
        .createHmac("sha256", getOracleSigningKey())
        .update(`refundOnQaFailure:${POLYGON_CHAIN_ID}:${escrow.contract_address}:${escrow.job_id}:${qaReportHash}`)
        .digest("hex");

    const refundTx =
      "0x" +
      crypto
        .createHash("sha256")
        .update(`polygon_refund:${qaReportHash}:${oracleSignature}`)
        .digest("hex");

    escrow.status = "refunded";
    escrow.qa_passed = false;
    escrow.qa_oracle_report_hash = qaReportHash;
    escrow.qa_oracle_signature = oracleSignature;
    escrow.settlement_tx_hash = refundTx;
    escrow.freelancer_payout_usdc = 0;
    escrow.platform_fee_usdc = 0;
    escrow.block_number = await this.fetchLiveBlockOrSimulated(escrow.block_number ?? 64_182_904);
    escrow.settled_at = nowIso;

    return { ok: true, escrow };
  }

  public getSummary() {
    const all = this.listContracts();
    const lockedUsdc = all
      .filter((c) => c.status === "locked")
      .reduce((s, c) => s + c.amount_usd, 0);
    const releasedUsdc = all
      .filter((c) => c.status === "released")
      .reduce((s, c) => s + c.amount_usd, 0);
    const refundedUsdc = all
      .filter((c) => c.status === "refunded")
      .reduce((s, c) => s + c.amount_usd, 0);

    return {
      ...this.getMetadata(),
      totalContracts: all.length,
      lockedCount: all.filter((c) => c.status === "locked").length,
      releasedCount: all.filter((c) => c.status === "released").length,
      refundedCount: all.filter((c) => c.status === "refunded").length,
      lockedUsdcUsd: lockedUsdc,
      releasedUsdcUsd: releasedUsdc,
      refundedUsdcUsd: refundedUsdc,
    };
  }

  private async fetchLiveBlockOrSimulated(previousBlock = 64_182_904): Promise<number> {
    const rpcUrl = (process.env.POLYGON_RPC_URL || "").trim();
    if (rpcUrl) {
      try {
        const resp = await fetch(rpcUrl, {
          method: "POST",
          signal: AbortSignal.timeout(2500),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        });
        const data = (await resp.json().catch(() => ({}))) as { result?: string };
        if (resp.ok && data.result && /^0x[0-9a-f]+$/i.test(data.result)) {
          return Number.parseInt(data.result, 16);
        }
      } catch {
        // Fallback to monotonic Polygon block height when RPC endpoint is offline
      }
    }
    return previousBlock + Math.floor(Math.random() * 14) + 2;
  }
}
