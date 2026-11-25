# Phase 23H: Deployment Runbook & Public Status Page

## 1. Public Status Page (`status.yourdomain.com` / `/status`)
- Dedicated subdomain configuration: `phase23_architecture/vercel.status.json` (`status.dutchkemventures.com`).
- Live SPA route `/status` (and automatic host detection for `status.*` subdomains) streams real-time status from:
  - `GET /api/status` (composite subsystem health, 60-second heartbeat timeline, uptime %, and public incident notices)
  - `GET /api/status/stream` (Server-Sent Events emitting updates every 60 seconds and immediately on status transitions/rollbacks)
- Automated 60-second probe loop runs inside `server.ts` (`setInterval(..., 60_000)`) and is also exposed at `POST /api/cron/status-heartbeat`.

## 2. Deployment Log & Rollback UI (`/admin/deployments`)
- Accessible in the isolated Admin Control Plane at `/admin/deployments`.
- Lists every deployment across User Frontend, Backend API, and Admin Console with active/superseded/rolled-back status, commit SHA, 5xx rate, and a one-click **Rollback** button.

## 3. One-Command CLI Rollback
```bash
chmod +x scripts/rollback.sh
./scripts/rollback.sh <deploy_id>
```
- Triggers Vercel / Railway deployment promotion when platform tokens exist, updates the Apex deployment ledger via `POST /api/devops/deployments/<deploy_id>/rollback`, publishes a status update, and polls `/api/health` for HTTP 200 verification.

## 4. Incident Postmortem Template
- Located at `docs/INCIDENTS/TEMPLATE.md` for blameless post-incident reviews.
