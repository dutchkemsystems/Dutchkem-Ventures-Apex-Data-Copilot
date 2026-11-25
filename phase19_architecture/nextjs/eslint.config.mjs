/**
 * Phase 19A — Build-Time Cross-Plane Import Guard (ESLint Flat Config)
 * Fails CI / Next.js builds if any file inside the User (/dashboard) plane imports
 * from the Admin (/admin) plane or vice versa.
 */
export default [
  {
    files: ["app/(user)/**/*.{ts,tsx}", "src/planes/dashboard/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/admin/**",
                "**/(admin)/**",
                "@/admin/**",
                "@/app/(admin)/**",
                "@/planes/admin/**",
                "**/AdminDashboard*",
                "**/AdminPlane*",
                "**/AdminLayout*",
                "**/AdminPortalShell*",
                "**/AdminAuthView*",
                "**/AdminEscrowControls*",
                "**/AdminDisputeReviewPanel*",
              ],
              message:
                "SECURITY VIOLATION (Phase 19A): User/Dashboard plane components MUST NEVER import from the Admin plane.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/(admin)/**/*.{ts,tsx}", "src/planes/admin/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/dashboard/**",
                "**/(user)/**",
                "@/dashboard/**",
                "@/app/(user)/**",
                "@/planes/dashboard/**",
                "**/UserPlane*",
                "**/DashboardLayout*",
              ],
              message:
                "SECURITY VIOLATION (Phase 19A): Admin plane components MUST NEVER import from the User/Dashboard plane.",
            },
          ],
        },
      ],
    },
  },
];
