-- Phase 5 Migration: Expert Marketplace (Human-in-the-Loop) & Automated Escrow Settlement
-- Enforces PostgreSQL Row-Level Security (RLS) scoped to app.current_org_id

CREATE TABLE IF NOT EXISTS expert_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    native_locale VARCHAR(32) NOT NULL,
    dialect VARCHAR(120) NOT NULL,
    specialty VARCHAR(160) NOT NULL DEFAULT 'Native Voice & Prosody',
    hourly_rate NUMERIC(10, 2) NOT NULL CHECK (hourly_rate > 0),
    payout_rail VARCHAR(32) NOT NULL CHECK (payout_rail IN ('kora_pay', 'kora_pay_global')),
    payout_account_ref VARCHAR(120) NOT NULL,
    vetting_status VARCHAR(32) NOT NULL DEFAULT 'vetted'
        CHECK (vetting_status IN ('pending_vetting', 'vetted', 'suspended')),
    sample_snr_db NUMERIC(6, 2) NOT NULL DEFAULT 42.0,
    completed_batches INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, email)
);

CREATE TABLE IF NOT EXISTS marketplace_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    assigned_expert_id UUID REFERENCES expert_profiles(id) ON DELETE SET NULL,
    client_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    target_locale VARCHAR(32) NOT NULL,
    script_text TEXT NOT NULL,
    budget_amount NUMERIC(12, 2) NOT NULL CHECK (budget_amount > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'assigned'
        CHECK (status IN ('open', 'assigned', 'qa_failed', 'delivered_and_paid')),
    last_qa_report JSONB,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES marketplace_batches(id) ON DELETE CASCADE,
    expert_id UUID NOT NULL REFERENCES expert_profiles(id) ON DELETE RESTRICT,
    escrow_entry_id UUID REFERENCES escrow_ledger(id) ON DELETE SET NULL,
    payout_rail VARCHAR(32) NOT NULL CHECK (payout_rail IN ('kora_pay', 'kora_pay_global')),
    gross_amount NUMERIC(12, 2) NOT NULL,
    platform_fee_20pct NUMERIC(12, 2) NOT NULL,
    expert_payout_80pct NUMERIC(12, 2) NOT NULL,
    external_transfer_id VARCHAR(120) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'settled'
        CHECK (status IN ('settled', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE expert_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE marketplace_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_batches FORCE ROW LEVEL SECURITY;

ALTER TABLE payout_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_expert_profiles ON expert_profiles
    USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
    WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_marketplace_batches ON marketplace_batches
    USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
    WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_payout_transactions ON payout_transactions
    USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
    WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
