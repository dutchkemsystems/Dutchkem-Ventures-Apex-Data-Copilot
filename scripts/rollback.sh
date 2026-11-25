#!/usr/bin/env bash
set -euo pipefail

# Phase 23H: One-Command Zero-Downtime Rollback Script
# Usage: ./scripts/rollback.sh <deploy_id>

if [ "${1:-}" = "" ]; then
  echo "Usage: ./scripts/rollback.sh <deploy_id>" >&2
  exit 1
fi

TARGET_DEPLOY_ID="$1"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3000}"
AUTH_TOKEN="${CRON_SECRET:-${ADMIN_JWT_SECRET:-}}"
ROLLBACK_REASON="${ROLLBACK_REASON:-One-command SRE rollback to ${TARGET_DEPLOY_ID}}"

echo "[Rollback] Initiating zero-downtime rollback to deployment '${TARGET_DEPLOY_ID}'..."

# 1. Optional Vercel atomic rollback if VERCEL_TOKEN + VERCEL_PROJECT_ID are configured
if [ -n "${VERCEL_TOKEN:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
  echo "[Rollback] Triggering Vercel production alias rollback -> ${TARGET_DEPLOY_ID}..."
  curl -sfS -X POST "https://api.vercel.com/v13/deployments/${TARGET_DEPLOY_ID}/promote" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" || true
fi

# 2. Optional Railway rolling deployment rollback if RAILWAY_TOKEN is configured
if [ -n "${RAILWAY_TOKEN:-}" ]; then
  echo "[Rollback] Triggering Railway service deployment rollback -> ${TARGET_DEPLOY_ID}..."
  curl -sfS -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer ${RAILWAY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { deploymentRollback(id: \\\"${TARGET_DEPLOY_ID}\\\") }\"}" || true
fi

# 3. Call Apex Backend Deployment Rollback API
if [ -n "${AUTH_TOKEN}" ]; then
  RESPONSE=$(curl -sfS -X POST "${API_BASE_URL}/api/devops/deployments/${TARGET_DEPLOY_ID}/rollback" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"reason\":\"${ROLLBACK_REASON}\",\"source\":\"cli_rollback_script\"}")
  echo "[Rollback] Backend API response: ${RESPONSE}"
else
  echo "[Rollback] Note: CRON_SECRET / ADMIN_JWT_SECRET not set in env; skipping authenticated backend API call."
fi

# 4. Verify zero-downtime health check returns HTTP 200
echo "[Rollback] Verifying health endpoint at ${API_BASE_URL}/api/health..."
for i in $(seq 1 10); do
  if curl -sf "${API_BASE_URL}/api/health" >/dev/null; then
    echo "[Rollback] SUCCESS: System healthy after rollback to '${TARGET_DEPLOY_ID}'."
    exit 0
  fi
  sleep 1
done

echo "[Rollback] WARNING: /api/health did not return 200 within 10s." >&2
exit 1
