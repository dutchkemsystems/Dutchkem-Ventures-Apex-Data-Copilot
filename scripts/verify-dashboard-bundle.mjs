import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");
const INDEX_HTML = path.join(DIST_DIR, "index.html");

if (!fs.existsSync(INDEX_HTML) || !fs.existsSync(ASSETS_DIR)) {
  console.error(
    "BUNDLE VERIFICATION FAILED: dist/index.html or dist/assets missing. Run vite build first."
  );
  process.exit(1);
}

/**
 * Admin-only UI & logic strings that MUST NEVER be bundled inside /dashboard production JS chunks.
 */
const FORBIDDEN_DASHBOARD_STRINGS = [
  "Release Escrow",
  "Fund Escrow",
  "DPO Dashboard",
  "DPO Compliance",
  "NDPA Oversight",
  "Issue Admin Invite",
  "Release Full (85/15)",
  "Admin Control Plane",
  "Dispute Review Queue",
  "Failed QA Report Queue",
];

// Inspect entry scripts declared in dist/index.html + User/Dashboard chunks
const indexHtml = fs.readFileSync(INDEX_HTML, "utf8");
const entryScriptMatches = [...indexHtml.matchAll(/src="\/assets\/([^"]+\.js)"/g)].map(
  (m) => m[1]
);
const allJsAssets = fs.readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));

// Chunks loaded for the /dashboard User Plane
const userDashboardChunks = allJsAssets.filter(
  (file) =>
    entryScriptMatches.includes(file) ||
    file.startsWith("DashboardLayout-") ||
    file.startsWith("AnnotatorDashboardView-") ||
    file.startsWith("KoraPayoutStatusView-") ||
    file.startsWith("SettingsView-") ||
    file.startsWith("PricingView-") ||
    file.startsWith("EscrowLedgerView-")
);

if (userDashboardChunks.length === 0) {
  console.error(
    "BUNDLE VERIFICATION FAILED: No /dashboard production chunks found in dist/assets."
  );
  process.exit(1);
}

const leaks = [];
for (const chunkName of userDashboardChunks) {
  const content = fs.readFileSync(path.join(ASSETS_DIR, chunkName), "utf8");
  for (const needle of FORBIDDEN_DASHBOARD_STRINGS) {
    if (content.includes(needle)) {
      leaks.push({ chunk: chunkName, string: needle });
    }
  }
}

if (leaks.length > 0) {
  console.error("DASHBOARD BUNDLE LEAK DETECTED (Phase 19C FAILED):");
  for (const leak of leaks) {
    console.error(
      `  Chunk dist/assets/${leak.chunk} contains forbidden admin string: "${leak.string}"`
    );
  }
  process.exit(1);
}

// Confirm isolated admin chunks exist and actually hold the admin-only strings
const adminChunks = allJsAssets.filter((f) => f.startsWith("Admin"));
if (adminChunks.length === 0) {
  console.error(
    "BUNDLE VERIFICATION FAILED: Expected code-split Admin*.js chunks in dist/assets."
  );
  process.exit(1);
}

const combinedAdminBundle = adminChunks
  .map((f) => fs.readFileSync(path.join(ASSETS_DIR, f), "utf8"))
  .join("\n");

for (const requiredAdminString of ["Release Escrow", "Fund Escrow", "DPO Dashboard"]) {
  if (!combinedAdminBundle.includes(requiredAdminString)) {
    console.error(
      `ADMIN CHUNK SANITY CHECK FAILED: "${requiredAdminString}" missing from isolated Admin*.js chunks.`
    );
    process.exit(1);
  }
}

console.log(
  `DASHBOARD PRODUCTION BUNDLE VERIFIED: Scanned ${userDashboardChunks.length} /dashboard chunks (${userDashboardChunks.join(
    ", "
  )}) -> 0 admin strings leaked. Isolated admin chunks (${adminChunks.length}): ${adminChunks.join(
    ", "
  )}.`
);
