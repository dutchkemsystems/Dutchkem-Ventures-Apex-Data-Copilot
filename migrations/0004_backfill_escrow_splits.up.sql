-- Migration-Phase: migrate
-- Step 2 (Migrate / Backfill): Idempotently backfill settlement_currency_v2 and split basis points
-- and install a dual-write trigger so both old and new app replicas stay synchronized during rolling deploy.

UPDATE escrow_ledger
SET
  settlement_currency_v2 = COALESCE(settlement_currency_v2, UPPER(legacy_currency_code), 'NGN'),
  platform_fee_bps = COALESCE(platform_fee_bps, 1500),
  freelancer_net_bps = COALESCE(freelancer_net_bps, 8500),
  qa_verdict_locked = COALESCE(qa_verdict_locked, FALSE)
WHERE settlement_currency_v2 IS NULL
   OR platform_fee_bps IS NULL
   OR freelancer_net_bps IS NULL
   OR qa_verdict_locked IS NULL;

CREATE OR REPLACE FUNCTION sync_escrow_currency_dual_write() RETURNS trigger AS $$
BEGIN
  IF NEW.settlement_currency_v2 IS NULL AND NEW.legacy_currency_code IS NOT NULL THEN
    NEW.settlement_currency_v2 := UPPER(NEW.legacy_currency_code);
  ELSIF NEW.legacy_currency_code IS NULL AND NEW.settlement_currency_v2 IS NOT NULL THEN
    NEW.legacy_currency_code := UPPER(NEW.settlement_currency_v2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_escrow_currency_dual_write ON escrow_ledger;
CREATE TRIGGER trg_sync_escrow_currency_dual_write
  BEFORE INSERT OR UPDATE ON escrow_ledger
  FOR EACH ROW
  EXECUTE FUNCTION sync_escrow_currency_dual_write();
