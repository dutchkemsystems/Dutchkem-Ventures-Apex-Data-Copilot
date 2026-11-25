-- Rollback for 0005_contract_legacy_escrow_col.up.sql
-- Restores legacy_currency_code and backfills from settlement_currency_v2 so older containers recover cleanly.

ALTER TABLE escrow_ledger
  ADD COLUMN IF NOT EXISTS legacy_currency_code TEXT NOT NULL DEFAULT 'NGN';

UPDATE escrow_ledger
SET legacy_currency_code = COALESCE(settlement_currency_v2, 'NGN')
WHERE settlement_currency_v2 IS NOT NULL;
