-- Rollback for 0004_backfill_escrow_splits.up.sql
-- Removes dual-write sync trigger while preserving existing columns cleanly.

DROP TRIGGER IF EXISTS trg_sync_escrow_currency_dual_write ON escrow_ledger;
DROP FUNCTION IF EXISTS sync_escrow_currency_dual_write();
