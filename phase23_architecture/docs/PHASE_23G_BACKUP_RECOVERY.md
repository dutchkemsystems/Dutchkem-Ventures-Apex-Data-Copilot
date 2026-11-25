# Phase 23G: Automated Backup & Recovery

## 1. Neon PostgreSQL Point-in-Time Recovery (7-Day Retention)
- Configuration: `phase23_architecture/backup/neon-pitr-config.json`
- `history_retention_seconds = 604800` (7 days of continuous WAL-backed PITR history).
- Allows zero-loss branch restoration to any second within the trailing 7-day window without interrupting production `main`.

## 2. Cloudflare R2 Bucket Versioning (90-Day Old-Version Retention)
- Configuration: `phase23_architecture/backup/r2-lifecycle-versioning.json`
- Target bucket: `apex-media-vault` (`audio/`, `video/`, `qa-submissions/`, `certifications/`).
- Bucket Versioning is set to `Enabled`, and `NoncurrentVersionExpiration` retains overwritten or deleted audio/video object versions for **90 days** before automated purge.

## 3. Weekly Automated Restore Drill
- Script: `scripts/weekly-restore-drill.mjs` (`npm run db:restore-drill`)
- Schedule: Weekly Sunday `05:00 UTC` via `.github/workflows/weekly-restore-drill.yml` (and manual trigger in `/admin/backups`).
- Execution flow:
  1. Provision temporary staging branch/database (`staging-restore-drill-<timestamp>`) from the latest Neon PITR snapshot.
  2. Verify schema completeness across all `migrations/*.up.sql` tables, escrow 85/15 split integrity, RLS policy presence, R2 90-day object version availability, and `automation_logs` continuity.
  3. Always delete the staging DB/branch after checks finish (`stagingDbDeleted: true`).

## 4. 24-Hour Backup Freshness Monitoring & Alerting
- Watchdog checks `lastSuccessfulBackupAt` every 6 hours (`0 */6 * * *`) and via `/api/cron/backup-monitor`.
- If `backupAgeHours > 24`, the system automatically dispatches a Slack alert (`SLACK_SECURITY_WEBHOOK_URL`) and creates a high-severity Super Admin incident.
