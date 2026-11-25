-- Migration-Phase: expand
-- Step 1 (Expand): Add auditable automation_logs and curriculum_plans tables for Phase 23F crons.
-- Drops zero columns or tables.

CREATE TABLE IF NOT EXISTS curriculum_sources (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  latest_version TEXT NOT NULL,
  checksum TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS curriculum_plans (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES curriculum_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  installed_version TEXT NOT NULL,
  outdated BOOLEAN NOT NULL DEFAULT FALSE,
  flagged_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_logs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'retrying')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  max_retries INTEGER NOT NULL DEFAULT 3,
  backoff_delays_ms JSONB NOT NULL DEFAULT '[]'::jsonb,
  records_processed INTEGER NOT NULL DEFAULT 0,
  outdated_flagged INTEGER NOT NULL DEFAULT 0,
  articles_published INTEGER NOT NULL DEFAULT 0,
  qa_recomputed INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  error_message TEXT,
  slack_alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_job_started
  ON automation_logs (job_name, started_at DESC);
