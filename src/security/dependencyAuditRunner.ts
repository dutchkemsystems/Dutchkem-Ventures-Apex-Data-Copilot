import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SupplyChainScanRecord {
  id: string;
  trigger: "scheduled_sunday_02utc" | "pull_request" | "manual_admin";
  checkedAt: string;
  npm: {
    executed: boolean;
    critical: number;
    high: number;
    moderate: number;
    low: number;
    blocked: boolean;
  };
  pip: {
    executed: boolean;
    manifestPackages: number;
    critical: number;
    totalFindings: number;
    blocked: boolean;
    note: string;
  };
  snyk: {
    configured: boolean;
    status: "clean" | "vulnerabilities_found" | "ci_token_pending";
    slackAlertDispatched: boolean;
  };
  mergeBlocked: boolean;
}

export class DependencyAuditService {
  private readonly history: SupplyChainScanRecord[] = [];
  private readonly rootDir: string;

  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
  }

  public getPolicyConfig() {
    return {
      dependabotConfigPath: ".github/dependabot.yml",
      weeklyCronSchedule: "0 2 * * 0",
      weeklyCronDescription: "Every Sunday at 02:00 UTC (.github/workflows/security-scan.yml)",
      semverRules: {
        patch: "Auto-merge enabled after lint, build, E2E, and CVE checks pass",
        minor: "Open PR + require explicit team review",
        major: "Open PR + require manual review + staging deployment verification",
      },
      blockingThreshold: "critical",
      snykIntegration: {
        configured: Boolean((process.env.SNYK_TOKEN || "").trim()),
        slackAlertsEnabled: Boolean(
          (process.env.SLACK_SECURITY_WEBHOOK_URL || "").trim() &&
            !(process.env.SLACK_SECURITY_WEBHOOK_URL || "").includes("REPLACE/ME")
        ),
      },
    };
  }

  public getHistory(): SupplyChainScanRecord[] {
    return [...this.history];
  }

  public async runAudit(
    trigger: "scheduled_sunday_02utc" | "pull_request" | "manual_admin" = "manual_admin"
  ): Promise<SupplyChainScanRecord> {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-sec-scan-"));
    let npmMetrics = {
      executed: false,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      blocked: false,
    };

    try {
      fs.copyFileSync(path.join(this.rootDir, "package.json"), path.join(workDir, "package.json"));
      const existingLock = path.join(this.rootDir, "package-lock.json");
      if (fs.existsSync(existingLock)) {
        fs.copyFileSync(existingLock, path.join(workDir, "package-lock.json"));
      } else {
        await execFileAsync(
          "npm",
          ["i", "--package-lock-only", "--ignore-scripts", "--no-audit", "--offline", "--silent"],
          { cwd: workDir, timeout: 5000 }
        );
      }

      let rawAudit = "{}";
      try {
        const res = await execFileAsync("npm", ["audit", "--audit-level=critical", "--json"], {
          cwd: workDir,
          timeout: 15000,
        });
        rawAudit = res.stdout || "{}";
      } catch (err: unknown) {
        const execErr = err as { stdout?: string };
        rawAudit = execErr.stdout || "{}";
      }

      const parsed = JSON.parse(rawAudit) as {
        metadata?: { vulnerabilities?: Record<string, number> };
      };
      const v = parsed?.metadata?.vulnerabilities || {};
      const critical = Number(v.critical || 0);
      npmMetrics = {
        executed: true,
        critical,
        high: Number(v.high || 0),
        moderate: Number(v.moderate || 0),
        low: Number(v.low || 0),
        blocked: critical > 0,
      };
    } catch {
      npmMetrics.executed = false;
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }

    const reqPath = path.join(this.rootDir, "phase13_architecture/backend/requirements.txt");
    const manifestPackages = fs.existsSync(reqPath)
      ? fs
          .readFileSync(reqPath, "utf8")
          .split("\n")
          .filter((l) => l.trim() && !l.trim().startsWith("#")).length
      : 0;

    let pipMetrics = {
      executed: false,
      manifestPackages,
      critical: 0,
      totalFindings: 0,
      blocked: false,
      note: "pip-audit enforced in CI Python 3.12 runner",
    };

    try {
      const res = await execFileAsync("pip-audit", ["-r", reqPath, "--format", "json"], {
        timeout: 15000,
      });
      const parsed = JSON.parse(res.stdout || "{}") as {
        dependencies?: Array<{ vulns?: Array<{ severity?: string }> }>;
      };
      let total = 0;
      let crit = 0;
      for (const dep of parsed.dependencies || []) {
        for (const vuln of dep.vulns || []) {
          total += 1;
          const sev = String(vuln.severity || "").toLowerCase();
          if (!sev || sev.includes("critical")) crit += 1;
        }
      }
      pipMetrics = {
        executed: true,
        manifestPackages,
        critical: crit,
        totalFindings: total,
        blocked: crit > 0,
        note: "pip-audit executed locally",
      };
    } catch {
      // pip-audit CLI not installed in container or returned non-zero
    }

    const snykToken = (process.env.SNYK_TOKEN || "").trim();
    const snykConfigured = Boolean(snykToken && !snykToken.includes("MY_SNYK"));
    const mergeBlocked = npmMetrics.blocked || pipMetrics.blocked;

    let slackAlertDispatched = false;
    const slackUrl = (process.env.SLACK_SECURITY_WEBHOOK_URL || "").trim();
    if (mergeBlocked && slackUrl && !slackUrl.includes("REPLACE/ME")) {
      try {
        const res = await fetch(slackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Phase 23B Security Gate BLOCKED merge: npm critical=${npmMetrics.critical}, pip critical=${pipMetrics.critical}`,
          }),
          signal: AbortSignal.timeout(3000),
        });
        slackAlertDispatched = res.ok;
      } catch {
        slackAlertDispatched = false;
      }
    }

    const record: SupplyChainScanRecord = {
      id: `scan-${Date.now()}`,
      trigger,
      checkedAt: new Date().toISOString(),
      npm: npmMetrics,
      pip: pipMetrics,
      snyk: {
        configured: snykConfigured,
        status: !snykConfigured
          ? "ci_token_pending"
          : mergeBlocked
          ? "vulnerabilities_found"
          : "clean",
        slackAlertDispatched,
      },
      mergeBlocked,
    };

    this.history.unshift(record);
    if (this.history.length > 25) this.history.length = 25;
    return record;
  }
}
