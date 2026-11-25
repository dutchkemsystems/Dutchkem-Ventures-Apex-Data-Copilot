# Incident Postmortem Report — [INCIDENT-YYYY-MM-DD-XXX]

> **Severity:** SEV-1 / SEV-2 / SEV-3  
> **Status:** Resolved / Monitoring  
> **Date:** YYYY-MM-DD  
> **Incident Commander:** `<engineer-name>`  
> **Author(s):** `<sre-team>`  
> **Affected Planes:** Public Status | User Dashboard | Backend API | Admin Control Plane  
> **Deployment ID(s):** `<active-deploy-id>` -> Rolled back to `<target-deploy-id>` (if applicable)

---

## 1. Executive Summary
Concisely describe what happened, which customer workflows or background pipelines were impacted, the total duration from detection to full recovery, and whether automated self-healing or manual rollback resolved the incident.

- **Customer-Facing Impact:** e.g., `1.4% HTTP 5xx error rate on /api/qa/audio for 62 seconds before autonomous rollback restored 0.0% 5xx.`
- **Data Loss / Escrow Integrity:** `None — Kora Pay 85/15 split ledger and 7-day Redis sessions remained intact.`
- **MTTR (Mean Time to Resolution):** `<minutes>m <seconds>s`

---

## 2. Detection & Automated Response Metrics
| Signal | Timestamp (UTC) | Outcome |
| :--- | :--- | :--- |
| Sentry 5xx Alert (`> 10 errors/min`) | `YYYY-MM-DDTHH:MM:SSZ` | Fired / Escalated |
| PagerDuty / Slack Notification | `YYYY-MM-DDTHH:MM:SSZ` | Acknowledged |
| Circuit Breaker State Change | `YYYY-MM-DDTHH:MM:SSZ` | Fallback activated |
| Auto-Rollback / `./scripts/rollback.sh <id>` | `YYYY-MM-DDTHH:MM:SSZ` | `/api/health` returned `200 OK` |
| Public Status Page Updated (`status.dutchkemventures.com`) | `YYYY-MM-DDTHH:MM:SSZ` | Resolved notice published |

---

## 3. Chronological Timeline (UTC)
- `HH:MM:SS` — Deployment `<deploy_id>` promoted to production.
- `HH:MM:SS` — Elevated latency / 5xx error rate observed on `<endpoint>`.
- `HH:MM:SS` — Automated 60-second probe flagged degraded component on public status page.
- `HH:MM:SS` — Rollback executed (`./scripts/rollback.sh <previous_deploy_id>` or automatic >1% 60s rollback).
- `HH:MM:SS` — `/api/health` verified 30s consecutive healthy checks; incident marked resolved.

---

## 4. Root Cause Analysis (5 Whys)
1. **Why did the failure occur?** ...
2. **Why wasn't it caught in CI / Shadow Staging?** ...
3. **Why did it affect production traffic?** ...
4. **Why did recovery take the observed duration?** ...
5. **Root Cause:** Clear technical explanation of the underlying defect or infrastructure trigger.

---

## 5. What Went Well vs. What Can Be Improved
### Went Well
- Zero user session loss (7-day Redis store preserved active sessions across container drain).
- Admin control plane (`admin.dutchkemventures.com`) remained isolated and operational.

### Needs Improvement
- `<Specific monitoring gap, test assertion, or circuit threshold adjustment>`

---

## 6. Corrective & Preventive Action Items
| Action Item | Owner | Priority | Target Date | Tracking Link |
| :--- | :--- | :--- | :--- | :--- |
| Add regression test to CI PR gate | `@owner` | P0 | YYYY-MM-DD | `#issue-id` |
| Tighten canary threshold or migration check | `@owner` | P1 | YYYY-MM-DD | `#issue-id` |

---

## 7. Sign-Off
- **SRE Reviewer:** _______________________  
- **Engineering Lead:** ____________________
