-- Phase 4 Migration: Synthetic Data Factory & Red-Teaming Tables with PostgreSQL RLS

CREATE TABLE synthetic_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    voice_engine VARCHAR(64) NOT NULL,
    target_count INTEGER NOT NULL DEFAULT 10000,
    generated_count INTEGER NOT NULL DEFAULT 0,
    languages JSONB NOT NULL DEFAULT '[]'::jsonb,
    accents JSONB NOT NULL DEFAULT '[]'::jsonb,
    tones JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'ready',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE synthetic_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES synthetic_datasets(id) ON DELETE CASCADE,
    locale VARCHAR(24) NOT NULL,
    accent VARCHAR(80) NOT NULL,
    tone VARCHAR(80) NOT NULL,
    phonetic_complexity VARCHAR(80) NOT NULL,
    script_text TEXT NOT NULL,
    ipa_hint TEXT NOT NULL,
    audio_uri TEXT,
    duration_sec NUMERIC(6, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE red_team_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_model VARCHAR(255) NOT NULL,
    total_probes INTEGER NOT NULL,
    failed_count INTEGER NOT NULL,
    vulnerability_rate NUMERIC(5, 2) NOT NULL,
    breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    report_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE synthetic_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_datasets FORCE ROW LEVEL SECURITY;
CREATE POLICY synthetic_datasets_org_isolation ON synthetic_datasets
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());

ALTER TABLE synthetic_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_samples FORCE ROW LEVEL SECURITY;
CREATE POLICY synthetic_samples_org_isolation ON synthetic_samples
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());

ALTER TABLE red_team_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_team_campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY red_team_campaigns_org_isolation ON red_team_campaigns
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
