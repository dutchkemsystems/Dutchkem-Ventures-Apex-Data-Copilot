# Phase 23F: Curriculum & Data Auto-Refresh Crons

1. **Daily 02:00 UTC (`0 2 * * *`) — `POST /api/cron/curriculum-sync`**
   - Fetches and validates all **6 curriculum sources**, updates version checksums in `curriculum_sources`, and flags stale cohorts in `curriculum_plans`.
2. **Weekly Sunday 03:00 UTC (`0 3 * * 0`) — `POST /api/cron/seo-weekly`**
   - Generates **5 SEO articles** and publishes them directly to `/blog` (`seoArticles` + `/sitemap.xml`).
3. **Weekly Monday 04:00 UTC (`0 4 * * 1`) — `POST /api/cron/qa-recompute`**
   - Recomputes freelancer Audio DSP, Vision IoU, and Localization composite QA scores and upgrades/validates certification tiers.
4. **Auditable `automation_logs` Table (`migrations/0006_add_automation_logs.up.sql`)**
   - Every run writes status, attempts, exponential backoff timings, processed counts, and Slack alert status to `automation_logs`.
5. **3x Exponential Backoff & Slack Alerting**
   - Failed cron runs automatically retry 3 times (`base * 2^(attempt-1)`), and alert the Super Admin via Slack webhook + security incident dispatch on exhaustion.
