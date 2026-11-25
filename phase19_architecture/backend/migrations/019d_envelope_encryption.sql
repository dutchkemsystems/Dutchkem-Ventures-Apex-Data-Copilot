-- Phase 19D: End-to-End Envelope Encryption (At-Rest + Separate KEK_USER & KEK_ADMIN + 90-Day Rotation)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. KMS Key Encryption Key (KEK) Rotation Registry (90-day policy)
CREATE TABLE IF NOT EXISTS kms_kek_registry (
  scope TEXT PRIMARY KEY CHECK (scope IN ('user', 'admin')),
  kek_id TEXT NOT NULL,
  kek_version INTEGER NOT NULL DEFAULT 1,
  rotation_interval_days INTEGER NOT NULL DEFAULT 90,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_rotation_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

INSERT INTO kms_kek_registry (scope, kek_id, kek_version, rotation_interval_days)
VALUES
  ('user', 'kms-kek-user-v1', 1, 90),
  ('admin', 'kms-kek-admin-v1', 1, 90)
ON CONFLICT (scope) DO NOTHING;

-- 2. User-plane encrypted columns (encrypted with unique per-field DEKs wrapped by KEK_USER)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kora_recipient_id_enc JSONB NULL;

ALTER TABLE escrow_ledger
  ADD COLUMN IF NOT EXISTS kora_recipient_id_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS kora_split_reference_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS escrow_amount_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS tax_receipt_url_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS dek_kek_scope TEXT NOT NULL DEFAULT 'user' CHECK (dek_kek_scope = 'user');

ALTER TABLE tax_receipts
  ADD COLUMN IF NOT EXISTS tax_receipt_url_enc JSONB NULL;

-- 3. Admin-plane encrypted columns (encrypted with unique per-field DEKs wrapped by KEK_ADMIN)
ALTER TABLE security_audit_logs
  ADD COLUMN IF NOT EXISTS audit_payload_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS dek_kek_scope TEXT NOT NULL DEFAULT 'admin' CHECK (dek_kek_scope = 'admin');

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS totp_secret_enc JSONB NULL;

-- 4. Index KEK rotation due checks
CREATE INDEX IF NOT EXISTS ix_kms_kek_next_rotation
  ON kms_kek_registry (next_rotation_at ASC);

-- 5. Enforce RLS so audit_payload_enc and kms_kek_registry are readable only inside Admin Plane
ALTER TABLE kms_kek_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kms_kek_admin_policy ON kms_kek_registry;
CREATE POLICY kms_kek_admin_policy ON kms_kek_registry
  FOR ALL
  USING (current_setting('app.current_plane', true) = 'admin')
  WITH CHECK (current_setting('app.current_plane', true) = 'admin');
