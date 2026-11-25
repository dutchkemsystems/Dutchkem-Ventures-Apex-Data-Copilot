export type UserRole = "admin" | "annotator" | "client";
export type SubscriptionTier = "starter" | "growth" | "enterprise_whitelabel";

export interface TenantSession {
  orgId: string;
  orgName: string;
  subscriptionTier: SubscriptionTier;
  korapayCustomerRef: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  role: UserRole;
  hourlyRate: number;
}

export interface NavItem {
  label: string;
  href: string;
  roles: UserRole[];
}

export const MULTI_TENANT_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", roles: ["admin", "annotator", "client"] },
  { label: "Projects & Queue", href: "/dashboard/projects", roles: ["admin", "client"] },
  { label: "My Assigned Tasks", href: "/dashboard/tasks", roles: ["annotator"] },
  { label: "Expert Roster", href: "/dashboard/experts", roles: ["admin"] },
  { label: "Escrow Ledger", href: "/dashboard/escrow", roles: ["admin", "annotator"] },
  { label: "Billing & White-Label", href: "/dashboard/billing", roles: ["admin"] },
];
