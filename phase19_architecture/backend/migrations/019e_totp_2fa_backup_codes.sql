-- Phase 19E: Mandatory Admin TOTP Enrollment + 10 Backup Codes (KEK_ADMIN) & Optional User 2FA
-- Targets PostgreSQL 15+ with pgcrypto and row-level isolation

ALTER TABLE IF EXISTS admin_users
  ADD COLUMN IF NOT EXISTS totp_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_secret_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS backup_codes_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS totp_enrolled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN admin_users.totp_secret_enc IS
  'AES-256-GCM envelope ciphertext wrapped exclusively by KMS KEK_ADMIN. Plaintext TOTP secrets must never be persisted.';
COMMENT ON COLUMN admin_users.backup_codes_hashes IS
  'Array of 10 salted SHA-256 hashes for single-use admin recovery backup codes.';

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_secret_enc JSONB NULL,
  ADD COLUMN IF NOT EXISTS backup_codes_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN users.totp_secret_enc IS
  'Optional User Plane TOTP secret wrapped with KMS KEK_USER; verified at /login when two_factor_enabled = TRUE.';

CREATE INDEX IF NOT EXISTS idx_admin_users_totp_enrolled
  ON admin_users (totp_enrolled);

CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled
  ON users (two_factor_enabled)
  WHERE two_factor_enabled = TRUE;
