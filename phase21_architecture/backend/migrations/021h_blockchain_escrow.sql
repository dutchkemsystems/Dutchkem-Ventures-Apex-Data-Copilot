-- =====================================================================
-- Phase 21H: Enterprise Smart Contract Escrow (Polygon USDC > $10,000)
-- =====================================================================
-- Tracks on-chain USDC escrows managed by Escrow.sol on Polygon PoS.
-- Strictly enforces amount_usd > 10000.00 (gas-cost-effective threshold)
-- and binds every release or refund to a signed QA Oracle report digest.
-- =====================================================================

CREATE TABLE IF NOT EXISTS blockchain_escrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL UNIQUE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_org_name TEXT NOT NULL,
  client_wallet_address TEXT NOT NULL,
  freelancer_name TEXT NOT NULL,
  freelancer_wallet_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'polygon' CHECK (network IN ('polygon', 'polygon_amoy')),
  chain_id INTEGER NOT NULL DEFAULT 137 CHECK (chain_id IN (137, 80002)),
  contract_address TEXT NOT NULL,
  usdc_token_address TEXT NOT NULL DEFAULT '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  amount_usd NUMERIC(14, 2) NOT NULL CHECK (amount_usd > 10000.00),
  amount_usdc_units BIGINT NOT NULL CHECK (amount_usdc_units > 10000000000),
  freelancer_payout_usdc NUMERIC(14, 2) NULL,
  platform_fee_usdc NUMERIC(14, 2) NULL,
  estimated_gas_usd NUMERIC(8, 4) NOT NULL DEFAULT 0.0400,
  deposit_tx_hash TEXT NULL,
  settlement_tx_hash TEXT NULL,
  qa_oracle_report_hash CHAR(66) NULL,
  qa_oracle_signature TEXT NULL,
  qa_passed BOOLEAN NULL,
  status TEXT NOT NULL DEFAULT 'pending_deposit'
    CHECK (status IN ('pending_deposit', 'locked', 'released', 'refunded')),
  locked_at TIMESTAMPTZ NULL,
  settled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_blockchain_escrows_org_status
  ON blockchain_escrows (org_id, status, created_at DESC);

ALTER TABLE blockchain_escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_escrows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blockchain_escrows_tenant_select ON blockchain_escrows;
CREATE POLICY blockchain_escrows_tenant_select ON blockchain_escrows
  FOR SELECT
  USING (
    org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );
