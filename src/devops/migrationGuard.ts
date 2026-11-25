import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MigrationPhase = "expand" | "migrate" | "contract";

export interface MigrationPairStatus {
  version: string;
  upFile: string;
  downFile: string | null;
  hasRollbackScript: boolean;
  phase: MigrationPhase | "unspecified";
  checksum: string;
  addsObjects: string[];
  dropsObjects: string[];
  violations: string[];
  valid: boolean;
}

export interface MigrationPolicyAuditResult {
  passed: boolean;
  migrationsDir: string;
  totalMigrations: number;
  validCount: number;
  violationsCount: number;
  pairs: MigrationPairStatus[];
  globalViolations: string[];
}

export interface ShadowCycleStepResult {
  step: "apply_up_1" | "apply_down" | "apply_up_2";
  version: string;
  file: string;
  passed: boolean;
  detail: string;
}

export interface ShadowMigrationCycleReport {
  id: string;
  timestamp: string;
  shadowMode: "neon_branch" | "shadow_postgres_psql" | "deterministic_ddl_verifier";
  neonBranchName: string | null;
  neonBranchDeleted: boolean;
  policyAudit: MigrationPolicyAuditResult;
  cyclePassed: boolean;
  stepsExecuted: ShadowCycleStepResult[];
  finalSchemaTables: string[];
  error: string | null;
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function extractAddedObjects(sql: string): string[] {
  const clean = stripSqlComments(sql);
  const added: string[] = [];
  const createTableRe = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  const addColRe = /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;

  let m: RegExpExecArray | null;
  while ((m = createTableRe.exec(clean)) !== null) {
    added.push(`table:${m[1].replace(/"/g, "")}`);
  }
  while ((m = addColRe.exec(clean)) !== null) {
    added.push(`column:${m[1].replace(/"/g, "")}`);
  }
  return added;
}

function extractDroppedObjects(sql: string): string[] {
  const clean = stripSqlComments(sql);
  const dropped: string[] = [];
  const dropTableRe = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  const dropColRe = /\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;

  let m: RegExpExecArray | null;
  while ((m = dropTableRe.exec(clean)) !== null) {
    dropped.push(`table:${m[1].replace(/"/g, "")}`);
  }
  while ((m = dropColRe.exec(clean)) !== null) {
    dropped.push(`column:${m[1].replace(/"/g, "")}`);
  }
  return dropped;
}

function parseMigrationPhase(sql: string): MigrationPhase | "unspecified" {
  const m = sql.match(/--\s*Migration-Phase:\s*(expand|migrate|contract)/i);
  if (!m) return "unspecified";
  return m[1].toLowerCase() as MigrationPhase;
}

export function lintExpandContractSql(params: {
  version: string;
  upSql: string;
  downSql: string | null;
}): {
  phase: MigrationPhase | "unspecified";
  addsObjects: string[];
  dropsObjects: string[];
  violations: string[];
} {
  const violations: string[] = [];
  const phase = parseMigrationPhase(params.upSql);
  const addsObjects = extractAddedObjects(params.upSql);
  const dropsObjects = extractDroppedObjects(params.upSql);
  const cleanUp = stripSqlComments(params.upSql);

  if (!params.downSql || !stripSqlComments(params.downSql).trim()) {
    violations.push(`Missing or empty rollback script (${params.version}.down.sql).`);
  }

  if (phase === "unspecified") {
    violations.push(
      `Missing '-- Migration-Phase: expand | migrate | contract' header in ${params.version}.up.sql.`
    );
  }

  // Core Zero-Downtime Rule #2: Never drop a column/table in the same deploy/migration as adding another
  if (addsObjects.length > 0 && dropsObjects.length > 0) {
    violations.push(
      `EXPAND_CONTRACT_VIOLATION: ${params.version}.up.sql mixes additive (${addsObjects.join(
        ", "
      )}) and destructive (${dropsObjects.join(
        ", "
      )}) statements in the same migration. Split into separate expand -> migrate -> contract deploys.`
    );
  }

  if (phase === "expand" && dropsObjects.length > 0) {
    violations.push(
      `Expand migration ${params.version}.up.sql must not drop columns or tables (${dropsObjects.join(
        ", "
      )}).`
    );
  }

  if (phase === "contract" && addsObjects.length > 0) {
    violations.push(
      `Contract migration ${params.version}.up.sql must only remove deprecated objects, not add new ones (${addsObjects.join(
        ", "
      )}).`
    );
  }

  // Guard against blocking NOT NULL column additions lacking a DEFAULT
  const addNotNullNoDefaultRe =
    /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-zA-Z0-9_."]+\s+[a-zA-Z0-9_()]+\s+NOT\s+NULL\b(?![^,;]*\bDEFAULT\b)/gi;
  if (addNotNullNoDefaultRe.test(cleanUp)) {
    violations.push(
      `Unsafe blocking DDL in ${params.version}.up.sql: ADD COLUMN ... NOT NULL without DEFAULT locks table writes. Use nullable expand + backfill + constraint.`
    );
  }

  return { phase, addsObjects, dropsObjects, violations };
}

export function auditMigrationsDirectory(
  migrationsDir = path.resolve(process.cwd(), "migrations")
): MigrationPolicyAuditResult {
  if (!fs.existsSync(migrationsDir)) {
    return {
      passed: false,
      migrationsDir,
      totalMigrations: 0,
      validCount: 0,
      violationsCount: 1,
      pairs: [],
      globalViolations: [`Migrations directory not found: ${migrationsDir}`],
    };
  }

  const entries = fs.readdirSync(migrationsDir).sort();
  const upFiles = entries.filter((f) => f.endsWith(".up.sql"));
  const downSet = new Set(entries.filter((f) => f.endsWith(".down.sql")));

  const pairs: MigrationPairStatus[] = [];
  const globalViolations: string[] = [];

  for (const upFile of upFiles) {
    const version = upFile.replace(/\.up\.sql$/, "");
    const expectedDown = `${version}.down.sql`;
    const hasRollbackScript = downSet.has(expectedDown);
    const upSql = fs.readFileSync(path.join(migrationsDir, upFile), "utf8");
    const downSql = hasRollbackScript
      ? fs.readFileSync(path.join(migrationsDir, expectedDown), "utf8")
      : null;

    const checksum = crypto.createHash("sha256").update(upSql).digest("hex").slice(0, 16);
    const analysis = lintExpandContractSql({ version, upSql, downSql });

    pairs.push({
      version,
      upFile,
      downFile: hasRollbackScript ? expectedDown : null,
      hasRollbackScript,
      phase: analysis.phase,
      checksum,
      addsObjects: analysis.addsObjects,
      dropsObjects: analysis.dropsObjects,
      violations: analysis.violations,
      valid: analysis.violations.length === 0,
    });
  }

  // Enforce batch rule across ordered expand + contract migrations if any orphan down scripts exist
  for (const downFile of downSet) {
    const version = downFile.replace(/\.down\.sql$/, "");
    if (!upFiles.includes(`${version}.up.sql`)) {
      globalViolations.push(`Orphan rollback script without matching .up.sql: ${downFile}`);
    }
  }

  if (upFiles.length === 0) {
    globalViolations.push("No *.up.sql migration files found.");
  }

  const validCount = pairs.filter((p) => p.valid).length;
  const pairViolations = pairs.reduce((sum, p) => sum + p.violations.length, 0);
  const totalViolations = pairViolations + globalViolations.length;

  return {
    passed: totalViolations === 0,
    migrationsDir,
    totalMigrations: pairs.length,
    validCount,
    violationsCount: totalViolations,
    pairs,
    globalViolations,
  };
}

async function runPsqlFile(connectionUri: string, filePath: string): Promise<void> {
  await execFileAsync(
    "psql",
    [connectionUri, "-v", "ON_ERROR_STOP=1", "-f", filePath],
    { timeout: 15000 }
  );
}

async function queryPostgresTables(connectionUri: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "psql",
    [
      connectionUri,
      "-t",
      "-A",
      "-c",
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;",
    ],
    { timeout: 10000 }
  );
  return stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Verifies the mandatory Migration CI Cycle:
 * Apply UP (all migrations) -> Apply DOWN (reverse order) -> Apply UP (all migrations)
 * Runs against an ephemeral Neon shadow DB branch if configured, a shadow PostgreSQL URL via psql,
 * or deterministic DDL graph simulation when offline.
 */
export async function runShadowMigrationCycle(
  migrationsDir = path.resolve(process.cwd(), "migrations")
): Promise<ShadowMigrationCycleReport> {
  const id = `mig-ci-${Date.now()}`;
  const timestamp = new Date().toISOString();
  const policyAudit = auditMigrationsDirectory(migrationsDir);
  const stepsExecuted: ShadowCycleStepResult[] = [];

  if (!policyAudit.passed) {
    return {
      id,
      timestamp,
      shadowMode: "deterministic_ddl_verifier",
      neonBranchName: null,
      neonBranchDeleted: false,
      policyAudit,
      cyclePassed: false,
      stepsExecuted,
      finalSchemaTables: [],
      error: "Expand-Contract migration policy check failed before shadow DB execution.",
    };
  }

  const neonApiKey = (process.env.NEON_API_KEY || "").trim();
  const neonProjectId = (process.env.NEON_PROJECT_ID || "").trim();
  let shadowUrl = (process.env.NEON_SHADOW_DATABASE_URL || "").trim();
  let neonBranchId: string | null = null;
  let neonBranchName: string | null = null;
  let neonBranchDeleted = false;
  let shadowMode: ShadowMigrationCycleReport["shadowMode"] = "deterministic_ddl_verifier";

  try {
    // 1. Provision ephemeral Neon Shadow DB branch when API credentials are configured
    if (
      neonApiKey &&
      neonProjectId &&
      !neonApiKey.includes("MY_NEON") &&
      !neonProjectId.includes("MY_NEON")
    ) {
      neonBranchName = `ci-shadow-${Date.now()}`;
      const createRes = await fetch(
        `https://console.neon.tech/api/v2/projects/${encodeURIComponent(neonProjectId)}/branches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${neonApiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            branch: { name: neonBranchName },
            endpoints: [{ type: "read_write" }],
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!createRes.ok) {
        const errBody = await createRes.text();
        throw new Error(`Neon branch creation failed (${createRes.status}): ${errBody}`);
      }
      const created = (await createRes.json()) as {
        branch?: { id: string };
        connection_uris?: Array<{ connection_uri: string }>;
      };
      neonBranchId = created.branch?.id || null;
      if (created.connection_uris?.[0]?.connection_uri) {
        shadowUrl = created.connection_uris[0].connection_uri;
      }
      shadowMode = "neon_branch";
    } else if (shadowUrl && !shadowUrl.includes("HOST.neon.tech")) {
      shadowMode = "shadow_postgres_psql";
    }

    // 2. Execute UP -> DOWN -> UP via psql if we have a real PostgreSQL shadow connection URI
    if (shadowUrl && (shadowMode === "neon_branch" || shadowMode === "shadow_postgres_psql")) {
      for (const pair of policyAudit.pairs) {
        const upPath = path.join(migrationsDir, pair.upFile);
        await runPsqlFile(shadowUrl, upPath);
        stepsExecuted.push({
          step: "apply_up_1",
          version: pair.version,
          file: pair.upFile,
          passed: true,
          detail: `Applied ${pair.upFile} (${pair.phase})`,
        });
      }

      for (const pair of [...policyAudit.pairs].reverse()) {
        if (!pair.downFile) throw new Error(`Missing down file for ${pair.version}`);
        const downPath = path.join(migrationsDir, pair.downFile);
        await runPsqlFile(shadowUrl, downPath);
        stepsExecuted.push({
          step: "apply_down",
          version: pair.version,
          file: pair.downFile,
          passed: true,
          detail: `Rolled back ${pair.downFile}`,
        });
      }

      for (const pair of policyAudit.pairs) {
        const upPath = path.join(migrationsDir, pair.upFile);
        await runPsqlFile(shadowUrl, upPath);
        stepsExecuted.push({
          step: "apply_up_2",
          version: pair.version,
          file: pair.upFile,
          passed: true,
          detail: `Re-applied ${pair.upFile} (${pair.phase}) after rollback`,
        });
      }

      const finalSchemaTables = await queryPostgresTables(shadowUrl);
      return {
        id,
        timestamp,
        shadowMode,
        neonBranchName,
        neonBranchDeleted: false,
        policyAudit,
        cyclePassed: true,
        stepsExecuted,
        finalSchemaTables,
        error: null,
      };
    }

    // 3. Deterministic offline DDL graph simulation (Up -> Down -> Up) when sandbox has no live Postgres
    const simulatePass = (step: ShadowCycleStepResult["step"], pairs: MigrationPairStatus[], tableSet: Set<string>, colSet: Set<string>) => {
      const ordered = step === "apply_down" ? [...pairs].reverse() : pairs;
      for (const pair of ordered) {
        const fileName = step === "apply_down" ? pair.downFile! : pair.upFile;
        const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");
        for (const obj of extractAddedObjects(sql)) {
          if (obj.startsWith("table:")) tableSet.add(obj.slice(6));
          if (obj.startsWith("column:")) colSet.add(obj.slice(7));
        }
        for (const obj of extractDroppedObjects(sql)) {
          if (obj.startsWith("table:")) tableSet.delete(obj.slice(6));
          if (obj.startsWith("column:")) colSet.delete(obj.slice(7));
        }
        stepsExecuted.push({
          step,
          version: pair.version,
          file: fileName,
          passed: true,
          detail: `${step === "apply_down" ? "Rolled back" : "Applied"} ${fileName} (active tables: ${tableSet.size})`,
        });
      }
    };

    const tables = new Set<string>();
    const cols = new Set<string>();

    simulatePass("apply_up_1", policyAudit.pairs, tables, cols);
    const snapshotAfterUp1 = [...tables].sort().join(",");

    simulatePass("apply_down", policyAudit.pairs, tables, cols);
    if (tables.size !== 0) {
      throw new Error(
        `Rollback did not restore clean schema state: leftover tables [${[...tables].join(", ")}]`
      );
    }

    simulatePass("apply_up_2", policyAudit.pairs, tables, cols);
    const snapshotAfterUp2 = [...tables].sort().join(",");
    if (snapshotAfterUp1 !== snapshotAfterUp2) {
      throw new Error(
        `Idempotency mismatch between apply_up_1 (${snapshotAfterUp1}) and apply_up_2 (${snapshotAfterUp2})`
      );
    }

    return {
      id,
      timestamp,
      shadowMode: "deterministic_ddl_verifier",
      neonBranchName: null,
      neonBranchDeleted: false,
      policyAudit,
      cyclePassed: true,
      stepsExecuted,
      finalSchemaTables: [...tables].sort(),
      error: null,
    };
  } catch (err) {
    return {
      id,
      timestamp,
      shadowMode,
      neonBranchName,
      neonBranchDeleted,
      policyAudit,
      cyclePassed: false,
      stepsExecuted,
      finalSchemaTables: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (neonBranchId && neonApiKey && neonProjectId) {
      try {
        const delRes = await fetch(
          `https://console.neon.tech/api/v2/projects/${encodeURIComponent(
            neonProjectId
          )}/branches/${encodeURIComponent(neonBranchId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${neonApiKey}` },
            signal: AbortSignal.timeout(10000),
          }
        );
        neonBranchDeleted = delRes.ok;
      } catch {
        neonBranchDeleted = false;
      }
    }
  }
}
