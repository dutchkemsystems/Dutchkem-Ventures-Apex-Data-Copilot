-- Phase 20A: In-App Ticketing & AI Support Agent (PostgreSQL Schema + Row-Level Security)

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'ai_resolved', 'escalated', 'admin_replied', 'closed')),
  ai_response TEXT,
  ai_confidence NUMERIC(4, 2),
  ai_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
  escalated_to_admin BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_reason TEXT,
  escalated_at TIMESTAMPTZ,
  admin_id TEXT,
  admin_reply TEXT,
  admin_replied_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created
  ON support_tickets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_queue
  ON support_tickets (escalated_to_admin, status, updated_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_user_isolation ON support_tickets;
CREATE POLICY support_tickets_user_isolation ON support_tickets
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
