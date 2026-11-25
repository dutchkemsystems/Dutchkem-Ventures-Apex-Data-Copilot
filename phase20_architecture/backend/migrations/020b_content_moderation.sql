-- Phase 20B: Content Moderation, Abuse Prevention & 3-Strike Auto-Ban Schema

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS moderation_strikes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT NULL;

CREATE TABLE IF NOT EXISTS moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'video', 'audio', 'text')),
  file_name TEXT NULL,
  scanner TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('approved', 'flagged', 'blocked')),
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000,
  reason TEXT NULL,
  strike_number INTEGER NOT NULL DEFAULT 0,
  auto_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_events_user_created
  ON moderation_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_events_blocked
  ON moderation_events (verdict, created_at DESC)
  WHERE verdict = 'blocked';

ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moderation_events_plane_isolation ON moderation_events;
CREATE POLICY moderation_events_plane_isolation ON moderation_events
  FOR ALL
  USING (
    current_setting('app.current_plane', true) = 'admin'
    OR (
      org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
      AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.current_plane', true) = 'admin'
    OR (
      org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
      AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );
