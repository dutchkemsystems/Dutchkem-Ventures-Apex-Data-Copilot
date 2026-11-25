#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * Phase 23D CLI: Zero-Downtime Migration Policy Guard & Up -> Down -> Up Verifier
 * Usage:
 *   node scripts/verify-migrations.mjs
 *   node scripts/verify-migrations.mjs --policy-only
 *   node scripts/verify-migrations.mjs --json
 */

const args = new Set(process.argv.slice(2));
const policyOnly = args.has("--policy-only");
const asJson = args.has("--json");

const migrationsDir = path.resolve(process.cwd(), "migrations");

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

function extractAddedObjects(sql) {
  const clean = stripSqlComments(sql);
  const added = [];
  const createTableRe = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  const addColRe = /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  let m;
  while ((m = createTableRe.exec(clean)) !== null) added.push(`table:${m[1].replace(/"/g, "")}`);
  while ((m = addColRe.exec(clean)) !== null) added.push(`column:${m[1].replace(/"/g, "")}`);
  return added;
}

function extractDroppedObjects(sql) {
  const clean = stripSqlComments(sql);
  const dropped = [];
  const dropTableRe = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  const dropColRe = /\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_."]+)/gi;
  let m;
  while ((m = dropTableRe.exec(clean)) !== null) dropped.push(`table:${m[1].replace(/"/g, "")}`);
  while ((m = dropColRe.exec(clean)) !== null) dropped.push(`column:${m[1].replace(/"/g, "")}`);
  return dropped;
}

function parsePhase(sql) {
  const m = sql.match(/--\s*Migration-Phase:\s*(expand|migrate|contract)/i);
  return m ? m[1].toLowerCase() : "unspecified";
}

function auditMigrations() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  const files = fs.readdirSync(migrationsDir).sort();
  const upFiles = files.filter((f) => f.endsWith(".up.sql"));
  const downFiles = new Set(files.filter((f) => f.endsWith(".down.sql")));

  const results = [];
  const globalErrors = [];

  if (upFiles.length === 0) {
    globalErrors.push("No *.up.sql migration files found in migrations/.");
  }

  for (const downFile of downFiles) {
    const version = downFile.replace(/\.down\.sql$/, "");
    if (!upFiles.includes(`${version}.up.sql`)) {
      globalErrors.push(`Orphan rollback script without matching .up.sql: ${downFile}`);
    }
  }

  for (const upFile of upFiles) {
    const version = upFile.replace(/\.up\.sql$/, "");
    const downFile = `${version}.down.sql`;
    const upSql = fs.readFileSync(path.join(migrationsDir, upFile), "utf8");
    const hasDown = downFiles.has(downFile);
    const downSql = hasDown ? fs.readFileSync(path.join(migrationsDir, downFile), "utf8") : "";
    const phase = parsePhase(upSql);
    const adds = extractAddedObjects(upSql);
    const drops = extractDroppedObjects(upSql);
    const violations = [];

    if (!hasDown || !stripSqlComments(downSql).trim()) {
      violations.push(`Missing or empty rollback script ${downFile}`);
    }
    if (phase === "unspecified") {
      violations.push(`Missing '-- Migration-Phase: expand | migrate | contract' header`);
    }
    if (adds.length > 0 && drops.length > 0) {
      violations.push(
        `EXPAND_CONTRACT_VIOLATION: cannot ADD (${adds.join(", ")}) and DROP (${drops.join(", ")}) in the same migration`
      );
    }
    if (phase === "expand" && drops.length > 0) {
      violations.push(`Expand migration cannot drop objects (${drops.join(", ")})`);
    }
    if (phase === "contract" && adds.length > 0) {
      violations.push(`Contract migration cannot add objects (${adds.join(", ")})`);
    }
    const cleanUp = stripSqlComments(upSql);
    if (/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-zA-Z0-9_."]+\s+[a-zA-Z0-9_()]+\s+NOT\s+NULL\b(?![^,;]*\bDEFAULT\b)/i.test(cleanUp)) {
      violations.push("Blocking ADD COLUMN ... NOT NULL without DEFAULT detected");
    }

    results.push({ version, upFile, downFile: hasDown ? downFile : null, phase, adds, drops, violations });
  }

  const allViolations = [
    ...globalErrors,
    ...results.flatMap((r) => r.violations.map((v) => `${r.upFile}: ${v}`)),
  ];

  return { passed: allViolations.length === 0, results, allViolations };
}

function runDeterministicUpDownUp(pairs) {
  const tables = new Set();
  const steps = [];

  const execStep = (stepName, fileName) => {
    const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");
    for (const o of extractAddedObjects(sql)) {
      if (o.startsWith("table:")) tables.add(o.slice(6));
    }
    for (const o of extractDroppedObjects(sql)) {
      if (o.startsWith("table:")) tables.delete(o.slice(6));
    }
    steps.push({ step: stepName, file: fileName, activeTables: tables.size });
  };

  for (const p of pairs) execStep("apply_up_1", p.upFile);
  const up1Tables = [...tables].sort().join(",");

  for (const p of [...pairs].reverse()) execStep("apply_down", p.downFile);
  if (tables.size !== 0) {
    throw new Error(`Rollback failed to clean schema tables: ${[...tables].join(", ")}`);
  }

  for (const p of pairs) execStep("apply_up_2", p.upFile);
  const up2Tables = [...tables].sort().join(",");
  if (up1Tables !== up2Tables) {
    throw new Error(`Schema mismatch between apply_up_1 and apply_up_2`);
  }

  return { passed: true, steps, finalTables: [...tables].sort() };
}

const audit = auditMigrations();
let cycle = null;

if (audit.passed && !policyOnly) {
  cycle = runDeterministicUpDownUp(audit.results);
}

const output = {
  policyPassed: audit.passed,
  migrationsChecked: audit.results.length,
  violations: audit.allViolations,
  cycleVerified: cycle ? cycle.passed : null,
  stepsCount: cycle ? cycle.steps.length : 0,
  finalTables: cycle ? cycle.finalTables : [],
};

if (asJson) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(`Phase 23D Expand-Contract Audit: ${audit.results.length} migration pairs checked.`);
  for (const r of audit.results) {
    console.log(`  - ${r.upFile} [${r.phase}] <-> ${r.downFile || "MISSING"} (${r.violations.length === 0 ? "OK" : "FAIL"})`);
  }
  if (!audit.passed) {
    console.error("Policy violations:\n" + audit.allViolations.map((v) => `  * ${v}`).join("\n"));
    process.exit(1);
  }
  if (cycle) {
    console.log(
      `Shadow Up -> Down -> Up Cycle PASSED (${cycle.steps.length} steps, final tables: ${cycle.finalTables.join(", ")})`
    );
  }
}

if (!audit.passed) {
  process.exit(1);
}
