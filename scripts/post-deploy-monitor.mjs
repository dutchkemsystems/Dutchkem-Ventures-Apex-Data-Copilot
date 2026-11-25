#!/usr/bin/env node
/**
 * Phase 23E Post-Deploy 60s Self-Healing & Auto-Rollback Monitor
 * Polls /api/health every 5 seconds for 60 seconds after deployment.
 * If 5xx rate > 1% or /api/health reports unhealthy/rollback, exits non-zero so CI reverts immediately.
 */

const baseUrl = (process.env.TARGET_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const totalWindowSec = Number(process.env.SOAK_SECONDS || 60);
const intervalSec = Number(process.env.POLL_INTERVAL_SECONDS || 5);
const iterations = Math.max(1, Math.ceil(totalWindowSec / intervalSec));

let totalChecks = 0;
let failedChecks = 0;

for (let i = 1; i <= iterations; i += 1) {
  totalChecks += 1;
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(4000),
    });
    const body = await res.json().catch(() => ({}));
    const fiveXxRate = Number(body?.selfHealing?.fiveXxRatePct60s ?? 0);

    if (res.status >= 500 || !res.ok || fiveXxRate > 1.0 || body?.selfHealing?.autoRollbackTriggered) {
      failedChecks += 1;
      console.error(
        `[Post-Deploy Monitor ${i}/${iterations}] Health/SLO breach: HTTP ${res.status}, 5xxRate=${fiveXxRate}%`
      );
      process.exit(1);
    }

    console.log(
      `[Post-Deploy Monitor ${i}/${iterations}] OK (HTTP ${res.status}, 5xxRate=${fiveXxRate}%, deployment=${body.deploymentId})`
    );
  } catch (err) {
    failedChecks += 1;
    console.error(`[Post-Deploy Monitor ${i}/${iterations}] Request error:`, err);
    process.exit(1);
  }

  if (i < iterations) {
    await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
  }
}

console.log(
  `Post-deploy 60s self-healing verification PASSED (${totalChecks} probes, ${failedChecks} failures).`
);
