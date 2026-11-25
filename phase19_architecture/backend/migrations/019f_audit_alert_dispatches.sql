-- Phase 19F: Security Audit Trail Coverage & Super Admin Email + Slack Alert Dispatches
-- Complements 019_security_audit_and_incidents.sql with outbound alert telemetry

ALTER TABLE IF EXISTS security_incidents
  ADD COLUMN IF NOT EXISTS alert_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS security_alert_dispatches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    UUID NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('email', 'slack')),
  recipient      TEXT NOT NULL,
  subject        TEXT NOT NULL,
  delivery_mode  TEXT NOT NULL DEFAULT 'sandbox_logged',
  status         TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'queued', 'failed')),
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  dispatched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alert_dispatches_incident
  ON security_alert_dispatches (incident_id, dispatched_at DESC);

ALTER TABLE security_alert_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_admin_only_alert_dispatches ON security_alert_dispatches;
CREATE POLICY p_admin_only_alert_dispatches ON security_alert_dispatches
  FOR ALL
  USING (current_setting('app.current_plane', true) = 'admin')
  WITH CHECK (true);
