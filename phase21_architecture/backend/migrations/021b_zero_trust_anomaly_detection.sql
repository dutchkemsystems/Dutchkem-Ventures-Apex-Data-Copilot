-- Phase 21B: Zero-Trust Anomaly Detection, IP Reputation, CAPTCHA Challenges & Impossible Travel
-- Fail-closed PostgreSQL Row-Level Security (RLS) enforced across telemetry and geo history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Authenticated Login Geo-Location History (for Impossible Travel & Baseline Geo Drift)
CREATE TABLE IF NOT EXISTS user_login_geo_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_plane TEXT NOT NULL CHECK (actor_plane IN ('user', 'admin')),
  actor_id UUID NOT NULL,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'UNKNOWN',
  city TEXT NOT NULL DEFAULT 'Unknown',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  user_agent_hash TEXT NOT NULL,
  user_agent_family TEXT NOT NULL,
  anomaly_score INTEGER NOT NULL DEFAULT 0 CHECK (anomaly_score BETWEEN 0 AND 100),
  captcha_verified BOOLEAN NOT NULL DEFAULT FALSE,
  reauthenticated BOOLEAN NOT NULL DEFAULT FALSE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_geo_actor_time
  ON user_login_geo_history (actor_plane, actor_id, login_at DESC);

ALTER TABLE user_login_geo_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_login_geo_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_geo_isolation ON user_login_geo_history;
CREATE POLICY login_geo_isolation
  ON user_login_geo_history
  FOR ALL
  USING (
    current_setting('app.plane', TRUE) = 'admin'
    OR (
      current_setting('app.plane', TRUE) = 'user'
      AND actor_plane = 'user'
      AND actor_id::TEXT = current_setting('app.current_user_id', TRUE)
    )
  )
  WITH CHECK (
    current_setting('app.plane', TRUE) IN ('admin', 'system_guard')
  );

-- 2. Request-Level Anomaly Assessments (0-100 Score Breakdown)
CREATE TABLE IF NOT EXISTS anomaly_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  actor_plane TEXT NOT NULL CHECK (actor_plane IN ('public', 'user', 'admin')),
  actor_id UUID,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  ip_reputation_raw INTEGER NOT NULL DEFAULT 0 CHECK (ip_reputation_raw BETWEEN 0 AND 100),
  ip_reputation_points INTEGER NOT NULL DEFAULT 0 CHECK (ip_reputation_points BETWEEN 0 AND 40),
  geo_mismatch_points INTEGER NOT NULL DEFAULT 0 CHECK (geo_mismatch_points BETWEEN 0 AND 25),
  user_agent_drift_points INTEGER NOT NULL DEFAULT 0 CHECK (user_agent_drift_points BETWEEN 0 AND 15),
  rate_deviation_points INTEGER NOT NULL DEFAULT 0 CHECK (rate_deviation_points BETWEEN 0 AND 20),
  total_anomaly_score INTEGER NOT NULL CHECK (total_anomaly_score BETWEEN 0 AND 100),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  requires_captcha BOOLEAN NOT NULL DEFAULT FALSE,
  captcha_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  impossible_travel_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  distance_km DOUBLE PRECISION,
  elapsed_minutes DOUBLE PRECISION,
  provider_used TEXT NOT NULL DEFAULT 'local_threat_intel',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_assessments_ip_created
  ON anomaly_assessments (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_assessments_score
  ON anomaly_assessments (total_anomaly_score DESC, created_at DESC);

ALTER TABLE anomaly_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_assessments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anomaly_assessments_admin_only ON anomaly_assessments;
CREATE POLICY anomaly_assessments_admin_only
  ON anomaly_assessments
  FOR ALL
  USING (
    current_setting('app.plane', TRUE) = 'admin'
    AND current_setting('app.admin_role', TRUE) IN ('super_admin', 'dpo')
  )
  WITH CHECK (
    current_setting('app.plane', TRUE) IN ('admin', 'system_guard')
  );

-- 3. Cryptographic CAPTCHA Challenges & Single-Use Clearance Nonces
CREATE TABLE IF NOT EXISTS captcha_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_token TEXT UNIQUE NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('turnstile', 'signed_challenge')),
  expected_answer_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captcha_challenges_expiry
  ON captcha_challenges (expires_at);
