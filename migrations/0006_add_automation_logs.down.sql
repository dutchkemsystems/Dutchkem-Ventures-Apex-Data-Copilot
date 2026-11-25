-- Rollback for 0006_add_automation_logs.up.sql

DROP INDEX IF EXISTS idx_automation_logs_job_started;
DROP TABLE IF EXISTS automation_logs;
DROP TABLE IF EXISTS curriculum_plans;
DROP TABLE IF EXISTS curriculum_sources;
