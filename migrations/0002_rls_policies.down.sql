-- Rollback for 0002_rls_policies.up.sql

DROP POLICY IF EXISTS tasks_org_isolation ON tasks;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_self_isolation ON organizations;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS app_current_user_role();
DROP FUNCTION IF EXISTS app_current_user_id();
DROP FUNCTION IF EXISTS app_current_org_id();
