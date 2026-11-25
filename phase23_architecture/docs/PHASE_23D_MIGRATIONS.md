# Phase 23D: Zero-Downtime Database Migrations (Expand-Contract + Neon Shadow DB)

## 1. Expand-Contract Pattern
Every schema evolution is broken into 3 backward-compatible deploys:
1. **Expand (`-- Migration-Phase: expand`)**: Add new nullable/defaulted columns or new tables (e.g., `migrations/0003_add_escrow.up.sql`). Running v1 containers continue operating without errors.
2. **Migrate (`-- Migration-Phase: migrate`)**: Idempotently backfill data and install dual-write triggers (`migrations/0004_backfill_escrow_splits.up.sql`) so v1 and v2 containers stay consistent during rolling updates.
3. **Contract (`-- Migration-Phase: contract`)**: Drop deprecated legacy columns (`migrations/0005_contract_legacy_escrow_col.up.sql`) only in a separate future deploy once zero containers reference the old column.

## 2. Hard CI Guardrails
- **Never drop a column in the same deploy as adding another** (enforced by `scripts/verify-migrations.mjs` and `src/devops/migrationGuard.ts`).
- **Every migration requires a rollback script** (`*.up.sql` + `*.down.sql` pairs).
- **Neon Shadow DB + Up -> Down -> Up CI Check** (`.github/workflows/migration-ci.yml`): spins up an isolated Neon shadow branch (or CI Postgres 16 container), applies every `up` migration, applies every `down` rollback in reverse order, and re-applies `up` with `ON_ERROR_STOP=1`.
