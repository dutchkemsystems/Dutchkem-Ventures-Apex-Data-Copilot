-- Phase 21A: Prompt Vault Manifest, Security Incidents & Per-Tenant sk_live_org_ API Keys
-- Fail-closed PostgreSQL Row-Level Security (RLS) enforced across all security tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Prompt Vault Manifest (No plaintext prompts ever stored in SQL or Git; metadata only)
CREATE TABLE IF NOT EXISTS prompt_vault_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_key TEXT UNIQUE NOT NULL,
  vault_path TEXT NOT NULL,
  vault_backend TEXT NOT NULL CHECK (vault_backend IN ('hashicorp_vault_kv2', 'aws_secrets_manager', 'kms_sealed_enclave')),
  vault_version INTEGER NOT NULL DEFAULT 1,
  sha256_digest TEXT NOT NULL,
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_admin_id UUID,
  fail_closed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Security Incidents Table (Receives PromptGuard blocks, IP anomaly blocks, brute-force, & cross-plane probes)
CREATE TABLE IF NOT EXISTS security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type TEXT NOT NULL CHECK (
    incident_type IN (
      'prompt_injection_attempt',
      'cross_plane_attempt',
      'repeated_failed_logins',
      'rls_violation_attempt',
      'invalid_jwt_audience',
      'session_hijack_suspect',
      'moderation_auto_ban',
      'cost_circuit_breaker_tripped',
      'anomaly_blocked_ip',
      'impossible_travel_detected',
      'tampered_api_key'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  org_id UUID,
  user_id UUID,
  admin_id UUID,
  source_plane TEXT CHECK (source_plane IN ('public', 'user', 'admin')),
  target_plane TEXT CHECK (target_plane IN ('public', 'user', 'admin')),
  route TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT 'unknown',
  matched_patterns TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  classifier_stage TEXT, -- 'regex' | 'llm_classifier' | 'canary_scrub'
  classifier_confidence DOUBLE PRECISION,
  input_sha256 TEXT,
  sanitized_excerpt TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  super_admin_notified BOOLEAN NOT NULL DEFAULT FALSE,
  alert_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by_admin_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_type_created
  ON security_incidents (incident_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_incidents_org_user
  ON security_incidents (org_id, user_id, created_at DESC);

ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents FORCE ROW LEVEL SECURITY;

-- Fail closed: Only authenticated Admin Control Plane (super_admin / dpo) may read or resolve security_incidents
DROP POLICY IF EXISTS security_incidents_admin_only ON security_incidents;
CREATE POLICY security_incidents_admin_only
  ON security_incidents
  FOR ALL
  USING (
    current_setting('app.plane', TRUE) = 'admin'
    AND current_setting('app.admin_role', TRUE) IN ('super_admin', 'dpo')
  )
  WITH CHECK (
    current_setting('app.plane', TRUE) IN ('admin', 'system_guard')
  );

-- 3. Per-Tenant API Keys (sk_live_org_<org_slug>_... revocable from Admin Dashboard)
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id UUID NOT NULL,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- e.g. sk_live_org_dutchkem_9a8f...4c12
  key_hash_sha256 TEXT UNIQUE NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['audio', 'vision', 'text']::TEXT[],
  rate_limit_per_hour INTEGER NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revoked_at TIMESTAMPTZ,
  revoked_by_admin_id UUID,
  revoked_reason TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_org_status
  ON tenant_api_keys (org_id, status);

ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_api_keys_isolation ON tenant_api_keys;
CREATE POLICY tenant_api_keys_isolation
  ON tenant_api_keys
  FOR ALL
  USING (
    current_setting('app.plane', TRUE) = 'admin'
    OR org_id::TEXT = current_setting('app.current_org_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.plane', TRUE) = 'admin'
    OR org_id::TEXT = current_setting('app.current_org_id', TRUE)
  );
