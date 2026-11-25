-- Rollback for 0003_add_escrow.up.sql
-- Cleanly reverses additive escrow table, indexes, and V2 columns.

DROP INDEX IF EXISTS idx_escrow_ledger_kora_ref;
DROP INDEX IF EXISTS idx_escrow_ledger_org_status;

ALTER TABLE escrow_ledger
  DROP COLUMN IF EXISTS qa_verdict_locked,
  DROP COLUMN IF EXISTS freelancer_net_bps,
  DROP COLUMN IF EXISTS platform_fee_bps,
  DROP COLUMN IF EXISTS settlement_currency_v2;

DROP TABLE IF EXISTS escrow_ledger;
