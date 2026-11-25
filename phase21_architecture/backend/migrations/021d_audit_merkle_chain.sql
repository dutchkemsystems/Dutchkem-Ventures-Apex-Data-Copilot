-- =====================================================================
-- Phase 21D: Immutable Audit Ledger (audit_merkle_chain) + S3 WORM Lock
-- =====================================================================
-- 1. Stores tamper-evident SHA-256 hash chain entries where:
--      entry_hash = sha256(canonical_entry_data || previous_hash)
-- 2. Enforces append-only immutability at the PostgreSQL trigger layer
--    (UPDATE and DELETE are unconditionally rejected).
-- 3. Mirrors every entry to AWS S3 Object Lock (COMPLIANCE WORM mode).
-- 4. Protected by Admin-plane Row-Level Security (fail closed).
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_merkle_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_index BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  entry_hash CHAR(64) NOT NULL UNIQUE,
  previous_hash CHAR(64) NOT NULL,
  merkle_root CHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  admin_id TEXT NULL,
  plane TEXT NOT NULL DEFAULT 'admin' CHECK (plane IN ('public', 'user', 'admin')),
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  worm_s3_bucket TEXT NOT NULL,
  worm_s3_key TEXT NOT NULL,
  worm_object_lock_mode TEXT NOT NULL DEFAULT 'COMPLIANCE' CHECK (worm_object_lock_mode IN ('COMPLIANCE', 'GOVERNANCE')),
  worm_retain_until TIMESTAMPTZ NOT NULL,
  worm_content_md5 TEXT NOT NULL,
  worm_status TEXT NOT NULL DEFAULT 's3_worm_locked'
);

CREATE INDEX IF NOT EXISTS ix_audit_merkle_chain_seq
  ON audit_merkle_chain (sequence_index ASC);

CREATE INDEX IF NOT EXISTS ix_audit_merkle_chain_user_ts
  ON audit_merkle_chain (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS ix_audit_merkle_chain_action_ts
  ON audit_merkle_chain (action, timestamp DESC);

-- Prevent ANY modification or deletion at the PostgreSQL database engine level
CREATE OR REPLACE FUNCTION reject_audit_merkle_chain_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY_VIOLATION: audit_merkle_chain is an immutable WORM ledger; % is forbidden.', TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_merkle_chain_no_update ON audit_merkle_chain;
CREATE TRIGGER trg_audit_merkle_chain_no_update
  BEFORE UPDATE OR DELETE ON audit_merkle_chain
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_merkle_chain_mutation();

-- Admin-Plane-Only Row-Level Security (Fail Closed)
ALTER TABLE audit_merkle_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_merkle_chain FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_merkle_chain_admin_select ON audit_merkle_chain;
CREATE POLICY audit_merkle_chain_admin_select ON audit_merkle_chain
  FOR SELECT
  USING (NULLIF(current_setting('app.current_plane', true), '') = 'admin');

DROP POLICY IF EXISTS audit_merkle_chain_system_insert ON audit_merkle_chain;
CREATE POLICY audit_merkle_chain_system_insert ON audit_merkle_chain
  FOR INSERT
  WITH CHECK (NULLIF(current_setting('app.current_plane', true), '') IN ('admin', 'system'));
