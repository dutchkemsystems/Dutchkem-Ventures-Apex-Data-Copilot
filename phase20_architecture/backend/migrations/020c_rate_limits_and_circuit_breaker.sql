-- Phase 20C: Upstash Redis Rate Limiting & Daily AI Cost Circuit Breaker

CREATE TABLE IF NOT EXISTS ai_cost_daily_ledger (
  usage_date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  total_cost_usd NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  gemini_calls_count INTEGER NOT NULL DEFAULT 0,
  daily_limit_usd NUMERIC(12, 2) NOT NULL DEFAULT 100.00,
  circuit_breaker_tripped BOOLEAN NOT NULL DEFAULT FALSE,
  tripped_at TIMESTAMPTZ NULL,
  manually_paused BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limit_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('b2b_api_gateway', 'qa_agent_upload')),
  bucket_key TEXT NOT NULL,
  limit_per_hour INTEGER NOT NULL,
  count_in_window INTEGER NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  backend TEXT NOT NULL DEFAULT 'upstash_redis',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_audit_blocked_created
  ON rate_limit_audit_events (blocked, created_at DESC)
  WHERE blocked = TRUE;

ALTER TABLE ai_cost_daily_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_cost_daily_ledger_admin_only ON ai_cost_daily_ledger;
CREATE POLICY ai_cost_daily_ledger_admin_only ON ai_cost_daily_ledger
  FOR ALL
  USING (current_setting('app.current_plane', true) = 'admin')
  WITH CHECK (current_setting('app.current_plane', true) = 'admin');

DROP POLICY IF EXISTS rate_limit_audit_admin_only ON rate_limit_audit_events;
CREATE POLICY rate_limit_audit_admin_only ON rate_limit_audit_events
  FOR ALL
  USING (current_setting('app.current_plane', true) = 'admin')
  WITH CHECK (current_setting('app.current_plane', true) = 'admin');
