import React, { createContext, useContext, useMemo } from "react";

export interface AdminPlaneState {
  plane: "admin";
  audience: "apex:admin";
  adminId: string;
  orgId: string;
  adminEmail: string;
  adminName: string;
  adminRole: "super_admin" | "finance" | "dpo";
}

const AdminPlaneContext = createContext<AdminPlaneState | null>(null);

export function AdminPlaneProvider({
  session,
  children,
}: {
  session: AdminPlaneState;
  children: React.ReactNode;
}) {
  const value = useMemo(() => session, [session]);
  return (
    <AdminPlaneContext.Provider value={value}>{children}</AdminPlaneContext.Provider>
  );
}

export function useAdminPlaneContext(): AdminPlaneState {
  const ctx = useContext(AdminPlaneContext);
  if (!ctx) {
    throw new Error("useAdminPlaneContext must be used strictly inside /admin/* plane.");
  }
  return ctx;
}
