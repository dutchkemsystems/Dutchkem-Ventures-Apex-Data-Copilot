import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "../../components/DashboardShell";
import { TenantSession } from "../../lib/tenant-context";

async function resolveTenantSession(): Promise<TenantSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("apex_access_token")?.value;
  if (!accessToken) {
    return null;
  }

  const res = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  return res.json();
}

export default async function MultiTenantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await resolveTenantSession();
  if (!session) {
    redirect("/login");
  }

  return <DashboardShell session={session}>{children}</DashboardShell>;
}
