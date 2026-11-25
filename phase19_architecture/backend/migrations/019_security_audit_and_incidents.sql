-- =====================================================================
-- Phase 19A: Three-Plane Security Audit Logs & Security Incidents
-- PostgreSQL 16 + Row-Level Security (Neon Serverless Compatible)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Immutable Security Audit Trail (all /admin/*, /api/admin/*, and privileged plane events)
CREATE TABLE IF NOT EXISTS security_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id         UUID NULL,
    admin_id        UUID NULL,
    plane           TEXT NOT NULL CHECK (plane IN ('public', 'user', 'admin')),
    route           TEXT NOT NULL,
    method          TEXT NOT NULL DEFAULT 'GET',
    ip_address      TEXT NOT NULL,
    user_agent      TEXT NOT NULL DEFAULT '',
    action          TEXT NOT NULL,
    result          TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_security_audit_logs_ts
    ON security_audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS ix_security_audit_logs_plane_ts
    ON security_audit_logs (plane, timestamp DESC);
CREATE INDEX IF NOT EXISTS ix_security_audit_logs_user
    ON security_audit_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_security_audit_logs_admin
    ON security_audit_logs (admin_id) WHERE admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_security_audit_logs_route
    ON security_audit_logs (route);

-- 2. Security Incidents Registry (cross_plane_attempt, repeated_failed_logins, rls_violation_attempt)
CREATE TABLE IF NOT EXISTS security_incidents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    incident_type           TEXT NOT NULL CHECK (
                                incident_type IN (
                                    'cross_plane_attempt',
                                    'repeated_failed_logins',
                                    'rls_violation_attempt',
                                    'invalid_jwt_audience',
                                    'session_hijack_suspect'
                                )
                            ),
    severity                TEXT NOT NULL DEFAULT 'high' CHECK (
                                severity IN ('low', 'medium', 'high', 'critical')
                            ),
    source_plane            TEXT NULL CHECK (source_plane IN ('public', 'user', 'admin')),
    target_plane            TEXT NULL CHECK (target_plane IN ('public', 'user', 'admin')),
    user_id                 UUID NULL,
    admin_id                UUID NULL,
    route                   TEXT NOT NULL,
    ip_address              TEXT NOT NULL,
    user_agent              TEXT NOT NULL DEFAULT '',
    details                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    super_admin_notified    BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at             TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_security_incidents_ts
    ON security_incidents (timestamp DESC);
CREATE INDEX IF NOT EXISTS ix_security_incidents_type_open
    ON security_incidents (incident_type, timestamp DESC)
    WHERE resolved_at IS NULL;

-- 3. Strict Row-Level Security (Only Admin Plane Role Can Query Security Telemetry)
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_admin_only_audit_read ON security_audit_logs;
CREATE POLICY p_admin_only_audit_read ON security_audit_logs
    FOR SELECT
    USING (current_setting('app.current_plane', true) = 'admin');

DROP POLICY IF EXISTS p_system_audit_insert ON security_audit_logs;
CREATE POLICY p_system_audit_insert ON security_audit_logs
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS p_admin_only_incident_access ON security_incidents;
CREATE POLICY p_admin_only_incident_access ON security_incidents
    FOR ALL
    USING (current_setting('app.current_plane', true) = 'admin')
    WITH CHECK (true);
