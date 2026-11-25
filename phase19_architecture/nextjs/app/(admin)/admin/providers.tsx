"use client";

import React, { createContext, useContext, useMemo } from "react";

export type AdminPlaneRole = "super_admin" | "finance" | "dpo";

export interface AdminPlaneSessionState {
  plane: "admin";
  audience: "apex:admin";
  adminId: string;
  email: string;
  adminRole: AdminPlaneRole;
  totpVerified: boolean;
}

const AdminPlaneContext = createContext<AdminPlaneSessionState | null>(null);

/**
 * Isolated Admin-Plane Provider (/admin/*).
 * Never exported to or imported by /dashboard/* or Public routes.
 */
export function AdminPlaneProvider({
  initialSession,
  children,
}: {
  initialSession: AdminPlaneSessionState;
  children: React.ReactNode;
}) {
  const value = useMemo(() => initialSession, [initialSession]);
  return (
    <AdminPlaneContext.Provider value={value}>{children}</AdminPlaneContext.Provider>
  );
}

export function useAdminPlane(): AdminPlaneSessionState {
  const ctx = useContext(AdminPlaneContext);
  if (!ctx) {
    throw new Error("useAdminPlane must only be consumed inside /admin/* layout.");
  }
  return ctx;
}
