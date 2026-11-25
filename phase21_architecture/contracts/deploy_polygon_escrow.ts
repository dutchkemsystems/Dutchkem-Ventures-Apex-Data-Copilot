/**
 * Polygon PoS / Amoy Deployment Script for phase21_architecture/contracts/Escrow.sol
 *
 * Production Parameters:
 *   - Polygon Mainnet USDC (Circle Native, 6 decimals): 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
 *   - Minimum Contract Value: > 10,000 USDC (10_000 * 1e6 base units)
 *   - QA Oracle Signer: Dedicated HSM/KMS backend key (process.env.POLYGON_QA_ORACLE_PRIVATE_KEY)
 */

export const POLYGON_NETWORK_CONFIG = {
  mainnet: {
    chainId: 137,
    name: "Polygon PoS Mainnet",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    explorerBaseUrl: "https://polygonscan.com",
  },
  amoy: {
    chainId: 80002,
    name: "Polygon Amoy Testnet",
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    explorerBaseUrl: "https://amoy.polygonscan.com",
  },
} as const;

export const MIN_ENTERPRISE_CONTRACT_USD = 10_000;

export function buildDeployConstructorArgs() {
  const network = process.env.POLYGON_NETWORK === "amoy" ? "amoy" : "mainnet";
  const cfg = POLYGON_NETWORK_CONFIG[network];
  const qaOracle =
    process.env.POLYGON_QA_ORACLE_ADDRESS ||
    "0x000000000000000000000000000000000000dEaD";
  const treasury =
    process.env.POLYGON_TREASURY_ADDRESS ||
    "0x000000000000000000000000000000000000dEaD";

  return {
    network: cfg.name,
    chainId: cfg.chainId,
    constructorArgs: [cfg.usdcAddress, qaOracle, treasury] as const,
    minEnterpriseUsdcUnits: BigInt(MIN_ENTERPRISE_CONTRACT_USD) * BigInt(1_000_000),
  };
}
