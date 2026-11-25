-- Migration-Phase: contract
-- Step 3 (Contract): Remove deprecated legacy_currency_code column ONLY after all containers
-- read/write settlement_currency_v2 exclusively. Never adds new columns in the same deploy.

DROP TRIGGER IF EXISTS trg_sync_escrow_currency_dual_write ON escrow_ledger;
DROP FUNCTION IF EXISTS sync_escrow_currency_dual_write();

ALTER TABLE escrow_ledger
  DROP COLUMN IF EXISTS legacy_currency_code;
