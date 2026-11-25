-- Phase 1 Migration: Enable & Force PostgreSQL Row-Level Security (RLS)
-- Guarantees Organization A can never read or mutate Organization B's records.

CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION app_current_user_role() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_user_role', true), '');
$$ LANGUAGE SQL STABLE;

-- 1. Organizations: tenant can only view/update its own organization record
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY org_self_isolation ON organizations
  USING (id = app_current_org_id())
  WITH CHECK (id = app_current_org_id());

-- 2. Users: tenant isolation + annotators can only view their own profile
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_org_isolation ON users
  FOR SELECT
  USING (
    org_id = app_current_org_id()
    AND (
      app_current_user_role() IN ('admin', 'client')
      OR id = app_current_user_id()
    )
  );

CREATE POLICY users_admin_write ON users
  FOR ALL
  USING (org_id = app_current_org_id() AND app_current_user_role() = 'admin')
  WITH CHECK (org_id = app_current_org_id() AND app_current_user_role() = 'admin');

-- 3. Projects: strictly scoped to active org_id
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY projects_org_isolation ON projects
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());

-- 4. Tasks: org isolation + annotator assignee-level row restriction
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY tasks_org_select ON tasks
  FOR SELECT
  USING (
    org_id = app_current_org_id()
    AND (
      app_current_user_role() IN ('admin', 'client')
      OR assignee_id = app_current_user_id()
    )
  );

CREATE POLICY tasks_org_mutate ON tasks
  FOR ALL
  USING (
    org_id = app_current_org_id()
    AND (
      app_current_user_role() = 'admin'
      OR assignee_id = app_current_user_id()
    )
  )
  WITH CHECK (org_id = app_current_org_id());

-- 5. Escrow Ledger: strictly isolated by org_id; annotators see only their own task payouts
ALTER TABLE escrow_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY escrow_org_select ON escrow_ledger
  FOR SELECT
  USING (
    org_id = app_current_org_id()
    AND (
      app_current_user_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = escrow_ledger.task_id
          AND t.assignee_id = app_current_user_id()
      )
    )
  );

CREATE POLICY escrow_admin_write ON escrow_ledger
  FOR ALL
  USING (org_id = app_current_org_id() AND app_current_user_role() = 'admin')
  WITH CHECK (org_id = app_current_org_id() AND app_current_user_role() = 'admin');
