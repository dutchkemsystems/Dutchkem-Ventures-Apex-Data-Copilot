import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const PLANE_RULES = [
  {
    name: "User/Dashboard Plane",
    dirs: [
      path.join(ROOT, "src/planes/dashboard"),
      path.join(ROOT, "phase19_architecture/nextjs/app/(user)"),
    ],
    forbiddenSubstrings: [
      "/admin",
      "(admin)",
      "AdminLayout",
      "AdminPlane",
      "AdminDashboard",
      "AdminPortalShell",
      "AdminAuthView",
      "AdminEscrowControls",
      "AdminDisputeReviewPanel",
      "ADMIN_JWT_SECRET",
      "apex_admin_session",
    ],
    forbiddenAdminStrings: [
      "Release Escrow",
      "Fund Escrow",
      "DPO Dashboard",
    ],
  },
  {
    name: "Admin Plane",
    dirs: [
      path.join(ROOT, "src/planes/admin"),
      path.join(ROOT, "phase19_architecture/nextjs/app/(admin)"),
    ],
    forbiddenSubstrings: [
      "/dashboard",
      "(user)",
      "DashboardLayout",
      "UserPlane",
      "USER_JWT_SECRET",
      "apex_user_session",
    ],
    forbiddenAdminStrings: [],
  },
];

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const IMPORT_RE =
  /(?:import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\))/g;

const violations = [];

for (const rule of PLANE_RULES) {
  for (const dir of rule.dirs) {
    for (const filePath of walkFiles(dir)) {
      const content = fs.readFileSync(filePath, "utf8");
      IMPORT_RE.lastIndex = 0;
      let match;
      while ((match = IMPORT_RE.exec(content)) !== null) {
        const importTarget = match[1] || match[2] || match[3] || "";
        for (const forbidden of rule.forbiddenSubstrings) {
          if (importTarget.includes(forbidden)) {
            violations.push({
              plane: rule.name,
              file: path.relative(ROOT, filePath),
              reason: `forbidden import "${importTarget}" (matched "${forbidden}")`,
            });
          }
        }
      }
      for (const forbiddenText of rule.forbiddenAdminStrings) {
        if (content.includes(forbiddenText)) {
          violations.push({
            plane: rule.name,
            file: path.relative(ROOT, filePath),
            reason: `forbidden admin UI string "${forbiddenText}" inside User/Dashboard plane`,
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("CROSS-PLANE ISOLATION VIOLATIONS DETECTED:");
  for (const v of violations) {
    console.error(`  [${v.plane}] ${v.file} -> ${v.reason}`);
  }
  process.exit(1);
}

console.log(
  "PLANE ISOLATION VERIFIED: 0 cross-plane imports or admin string leaks between /admin and /dashboard."
);
