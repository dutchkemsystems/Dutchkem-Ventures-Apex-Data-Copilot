-- Migration-Phase: expand
-- Step 1 (Expand): Add escrow_ledger table and nullable/defaulted V2 split columns.
-- Old application containers continue operating against legacy_currency_code untouched.
-- ZERO columns or tables are dropped in this migration.

CREATE TABLE IF NOT EXISTS escrow_ledger (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  freelancer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gross_amount NUMERIC(14, 2) NOT NULL CHECK (gross_amount >= 0),
  legacy_currency_code TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'held_in_escrow',
  kora_transaction_reference TEXT NOT NULL,
  kora_split_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Non-blocking additive columns (PostgreSQL 11+ metadata-only default / nullable)
ALTER TABLE escrow_ledger
  ADD COLUMN IF NOT EXISTS settlement_currency_v2 TEXT,
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS freelancer_net_bps INTEGER DEFAULT 8500,
  ADD COLUMN IF NOT EXISTS qa_verdict_locked BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_escrow_ledger_org_status
  ON escrow_ledger (org_id, status);

CREATE INDEX IF NOT EXISTS idx_escrow_ledger_kora_ref
  ON escrow_ledger (kora_transaction_reference);
