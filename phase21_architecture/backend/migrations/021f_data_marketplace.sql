-- =====================================================================
-- Phase 21F: Data Marketplace (datasets + Kora Pay 10% split purchases)
-- =====================================================================
-- 1. Stores QA-validated, PII-anonymized datasets listed by verified
--    freelancers and AI data agencies after QA gate clearance.
-- 2. Fail-closed constraints guarantee neither un-anonymized PII nor
--    unvalidated datasets can enter 'listed' status.
-- 3. Records AI Lab dataset purchases with a deterministic 10% platform
--    commission / 90% seller Kora Pay split.
-- =====================================================================

CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('audio_speech', 'vision_bbox', 'multilingual_text', 'red_team_eval')
  ),
  sample_count INTEGER NOT NULL CHECK (sample_count > 0),
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0.00),
  anonymized BOOLEAN NOT NULL DEFAULT FALSE CHECK (anonymized = TRUE),
  qa_validated BOOLEAN NOT NULL DEFAULT FALSE CHECK (qa_validated = TRUE),
  qa_score NUMERIC(5, 2) NOT NULL CHECK (qa_score >= 85.00 AND qa_score <= 100.00),
  qa_report_summary TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'Global',
  format_spec TEXT NOT NULL DEFAULT 'JSONL + 24kHz WAV',
  preview_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'listed' CHECK (status IN ('listed', 'archived')),
  purchases_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_datasets_category_created
  ON datasets (category, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_datasets_seller_org
  ON datasets (seller_id, org_id);

CREATE TABLE IF NOT EXISTS dataset_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  buyer_org_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  gross_price_usd NUMERIC(12, 2) NOT NULL CHECK (gross_price_usd > 0.00),
  commission_rate NUMERIC(4, 2) NOT NULL DEFAULT 0.10 CHECK (commission_rate = 0.10),
  platform_commission_10pct NUMERIC(12, 2) NOT NULL,
  seller_payout_90pct NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'NGN', 'GBP')),
  charge_amount NUMERIC(14, 2) NOT NULL,
  kora_reference TEXT NOT NULL UNIQUE,
  kora_split_reference TEXT NOT NULL UNIQUE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  download_token_sha256 CHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_dataset_purchases_dataset_status
  ON dataset_purchases (dataset_id, payment_status, created_at DESC);

ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS datasets_public_validated_read ON datasets;
CREATE POLICY datasets_public_validated_read ON datasets
  FOR SELECT
  USING (
    status = 'listed'
    AND qa_validated = TRUE
    AND anonymized = TRUE
  );

DROP POLICY IF EXISTS datasets_seller_insert ON datasets;
CREATE POLICY datasets_seller_insert ON datasets
  FOR INSERT
  WITH CHECK (
    seller_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND qa_validated = TRUE
    AND anonymized = TRUE
  );

ALTER TABLE dataset_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_purchases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dataset_purchases_seller_select ON dataset_purchases;
CREATE POLICY dataset_purchases_seller_select ON dataset_purchases
  FOR SELECT
  USING (
    seller_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
