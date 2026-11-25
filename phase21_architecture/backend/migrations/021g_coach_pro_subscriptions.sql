-- =====================================================================
-- Phase 21G: AI Coach (Freelancer Upsell) — $19/mo "Coach Pro" Tier
-- =====================================================================
-- 1. Stores active recurring Kora Pay $19/month "Coach Pro" subscriptions.
-- 2. Stores pre-flight QA coaching runs submitted BEFORE real jobs,
--    including predicted QA pass rate, specific metric deltas, and fixes.
-- 3. Fail-closed RLS + backend enforcement ensure unsubscribed users
--    cannot run /api/coach/analyze (HTTP 402 PAYMENT_REQUIRED).
-- =====================================================================

CREATE TABLE IF NOT EXISTS coach_pro_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier_name TEXT NOT NULL DEFAULT 'coach_pro' CHECK (tier_name = 'coach_pro'),
  monthly_price_usd NUMERIC(8, 2) NOT NULL DEFAULT 19.00 CHECK (monthly_price_usd = 19.00),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'NGN', 'GBP')),
  charge_amount NUMERIC(12, 2) NOT NULL,
  kora_reference TEXT NOT NULL UNIQUE,
  kora_subscription_code TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'canceled', 'past_due')),
  current_period_start TIMESTAMPTZ NULL,
  current_period_end TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_coach_pro_user_status
  ON coach_pro_subscriptions (user_id, status, current_period_end DESC);

CREATE TABLE IF NOT EXISTS coach_preflight_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES coach_pro_subscriptions(id) ON DELETE RESTRICT,
  modality TEXT NOT NULL CHECK (modality IN ('audio', 'vision', 'text')),
  files_count INTEGER NOT NULL CHECK (files_count > 0),
  predicted_pass_rate NUMERIC(5, 2) NOT NULL CHECK (predicted_pass_rate >= 0 AND predicted_pass_rate <= 100),
  verdict TEXT NOT NULL CHECK (verdict IN ('ready_for_job', 'needs_remediation')),
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_coach_preflight_user_created
  ON coach_preflight_runs (user_id, created_at DESC);

ALTER TABLE coach_pro_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_pro_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_pro_self_policy ON coach_pro_subscriptions;
CREATE POLICY coach_pro_self_policy ON coach_pro_subscriptions
  FOR ALL
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );

ALTER TABLE coach_preflight_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_preflight_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_preflight_self_policy ON coach_preflight_runs;
CREATE POLICY coach_preflight_self_policy ON coach_preflight_runs
  FOR ALL
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  );
