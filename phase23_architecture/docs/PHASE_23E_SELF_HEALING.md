# Phase 23E: Self-Healing & Auto-Rollback Architecture

## 1. Composite Health Probe (`GET /api/health`)
- Validates Database, Upstash Redis (`7-day` session store), AI providers (Gemini/OpenAI circuit states), and Kora Pay readiness.
- Returns `200` when core services are healthy; `503` if unhealthy, draining, or an active post-deploy auto-rollback was triggered.

## 2. 60-Second Post-Deploy 5xx Auto-Rollback (`> 1%`)
- Sliding 60-second request counter tracks total requests vs `5xx` responses across `/api/*`.
- If `5xx rate > 1%` for `>= 60 seconds` post-deploy, `SelfHealingEngine` triggers automatic rollback to `PREVIOUS_DEPLOYMENT_ID` and dispatches PagerDuty + Slack alerts.
- `scripts/post-deploy-monitor.mjs` polls `/api/health` in CI after rolling deployment and exits `1` on SLO breach to invoke `railway deployment rollback` / `vercel rollback`.

## 3. 5-Failure Circuit Breakers (`kora_pay`, `openai`, `redis`)
- After **5 consecutive failures**, each dependency trips to `OPEN`:
  - **Kora Pay API** → switches to idempotent escrow/payout outbox retry queue.
  - **OpenAI** → fails over to Gemini primary + AI retry queue.
  - **Redis** → fails over to encrypted in-process TTL session/cache store.

## 4. Sentry 5xx Incident Capture + PagerDuty/Slack Escalation (`> 10 errors/min`)
- Every HTTP `5xx` error automatically creates a tracked incident and dispatches an envelope to `SENTRY_DSN` when configured.
- Exceeding **10 errors/minute** dispatches critical PagerDuty Events v2 (`PAGERDUTY_ROUTING_KEY`) and Slack (`SLACK_SECURITY_WEBHOOK_URL`) alerts.

## 5. Graceful Degradation
- **Slow DB**: `readWithDbCacheFallback` serves last-known-good cached read snapshots when DB latency spikes.
- **AI Down**: `enqueueAiTaskForRetry` queues AI evaluation/generation tasks for exponential-backoff retry and drains them upon recovery.
