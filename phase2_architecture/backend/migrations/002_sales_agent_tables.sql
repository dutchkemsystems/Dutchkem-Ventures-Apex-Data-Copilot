-- Phase 2 Migration: Auto-Bidder Sales Agent Tables with PostgreSQL RLS
-- Ensures scraped leads, proposals, and bid submissions remain strictly isolated per org_id.

CREATE TYPE job_board_enum AS ENUM ('upwork', 'mercor', 'afterquery', 'telus_digital');
CREATE TYPE lead_status_enum AS ENUM ('scraped', 'proposal_drafted', 'submitted', 'won', 'archived');

CREATE TABLE job_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_board job_board_enum NOT NULL,
    external_job_id VARCHAR(128) NOT NULL,
    title VARCHAR(320) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    budget_display VARCHAR(80) NOT NULL,
    matched_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_description TEXT NOT NULL,
    extracted_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    status lead_status_enum NOT NULL DEFAULT 'scraped',
    job_url TEXT NOT NULL,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, source_board, external_job_id)
);

CREATE INDEX ix_job_leads_org_status ON job_leads (org_id, status);

CREATE TABLE bid_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL UNIQUE REFERENCES job_leads(id) ON DELETE CASCADE,
    proposal_text TEXT NOT NULL,
    proposed_rate NUMERIC(10, 2) NOT NULL,
    turnaround_days INTEGER NOT NULL DEFAULT 7,
    form_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce strict tenant RLS on Phase 2 sales tables (Admin-only write & read)
ALTER TABLE job_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_leads FORCE ROW LEVEL SECURITY;

CREATE POLICY job_leads_admin_isolation ON job_leads
  USING (org_id = app_current_org_id() AND app_current_user_role() = 'admin')
  WITH CHECK (org_id = app_current_org_id() AND app_current_user_role() = 'admin');

ALTER TABLE bid_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_submissions FORCE ROW LEVEL SECURITY;

CREATE POLICY bid_submissions_admin_isolation ON bid_submissions
  USING (org_id = app_current_org_id() AND app_current_user_role() = 'admin')
  WITH CHECK (org_id = app_current_org_id() AND app_current_user_role() = 'admin');
