-- =====================================================================
-- Phase 21E: Freelancer Certification Program (certifications + priority alerts)
-- =====================================================================
-- 1. Stores verified/expert QA certifications issued strictly after:
--      a) Verified $99 Kora Pay payment (payment_verified = TRUE)
--      b) Passing score > 90% on server-graded QA exam (CHECK score > 90)
-- 2. Powers Job Board priority ranking (Verified freelancers ranked first)
--    and Priority Job Notifications on new $500 Kora Pay listings.
-- =====================================================================

CREATE TABLE IF NOT EXISTS certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('verified', 'expert')),
  score NUMERIC(5, 2) NOT NULL CHECK (score > 90.00 AND score <= 100.00),
  exam_session_id UUID NOT NULL,
  payment_reference TEXT NOT NULL UNIQUE,
  payment_amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 99.00 CHECK (payment_amount_usd >= 99.00),
  payment_currency TEXT NOT NULL DEFAULT 'USD' CHECK (payment_currency IN ('NGN', 'USD', 'GBP')),
  payment_verified BOOLEAN NOT NULL DEFAULT FALSE CHECK (payment_verified = TRUE),
  badge_svg TEXT NOT NULL,
  credential_json JSONB NOT NULL,
  credential_sha256 CHAR(64) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS ix_certifications_tier_score
  ON certifications (tier DESC, score DESC, issued_at DESC);

CREATE TABLE IF NOT EXISTS certification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_reference TEXT NOT NULL UNIQUE,
  payment_currency TEXT NOT NULL DEFAULT 'USD',
  charge_amount NUMERIC(12, 2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  latest_score NUMERIC(5, 2) NULL,
  passed BOOLEAN NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS priority_job_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certification_id UUID NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  budget_usd NUMERIC(12, 2) NOT NULL,
  tier_required TEXT NOT NULL DEFAULT 'verified',
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_priority_notifications_user_created
  ON priority_job_notifications (user_id, created_at DESC);

ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certifications_public_verified_read ON certifications;
CREATE POLICY certifications_public_verified_read ON certifications
  FOR SELECT
  USING (
    payment_verified = TRUE
    AND score > 90
  );

ALTER TABLE priority_job_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_job_notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS priority_notifications_self_select ON priority_job_notifications;
CREATE POLICY priority_notifications_self_select ON priority_job_notifications
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
