-- Phase 20D: Onboarding Wizard Gate & Empty State Retention Metadata

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS ix_users_onboarding_incomplete
  ON users (id)
  WHERE onboarding_completed = FALSE;

-- Existing provisioned tenants with historical tasks are grandfathered as onboarded
UPDATE users u
SET onboarding_completed = TRUE,
    onboarding_step = 3,
    onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
WHERE EXISTS (
  SELECT 1 FROM tasks t WHERE t.org_id = u.org_id
);
