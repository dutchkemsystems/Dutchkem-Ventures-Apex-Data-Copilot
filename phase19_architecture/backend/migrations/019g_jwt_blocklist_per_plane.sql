-- Phase 19G: Durable Per-Plane JWT Revocation Blocklist (mirrors Redis SET EX remaining_ttl)

CREATE TABLE IF NOT EXISTS jwt_blocklist (
  jti TEXT PRIMARY KEY,
  plane TEXT NOT NULL CHECK (plane IN ('user', 'admin')),
  subject_id TEXT NOT NULL,
  ttl_seconds INTEGER NOT NULL CHECK (ttl_seconds >= 1),
  reason TEXT NOT NULL DEFAULT 'logout',
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jwt_blocklist_expires_at ON jwt_blocklist (expires_at);
CREATE INDEX IF NOT EXISTS idx_jwt_blocklist_plane ON jwt_blocklist (plane, revoked_at DESC);

ALTER TABLE jwt_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jwt_blocklist_admin_read ON jwt_blocklist;
CREATE POLICY jwt_blocklist_admin_read ON jwt_blocklist
  FOR SELECT
  USING (current_setting('app.current_plane', true) = 'admin');
