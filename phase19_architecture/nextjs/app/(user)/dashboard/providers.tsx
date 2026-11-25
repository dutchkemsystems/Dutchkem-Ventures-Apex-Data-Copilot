"use client";

import React, { createContext, useContext, useMemo } from "react";

export interface UserPlaneSessionState {
  plane: "user";
  audience: "apex:user";
  userId: string;
  orgId: string;
  email: string;
  role: "freelancer" | "client" | "teacher" | "principal";
}

const UserPlaneContext = createContext<UserPlaneSessionState | null>(null);

/**
 * Isolated User-Plane Provider (/dashboard/*).
 * Strictly separated from AdminPlaneContext to prevent any cross-plane React state leakage.
 */
export function UserPlaneProvider({
  initialSession,
  children,
}: {
  initialSession: UserPlaneSessionState;
  children: React.ReactNode;
}) {
  const value = useMemo(() => initialSession, [initialSession]);
  return (
    <UserPlaneContext.Provider value={value}>{children}</UserPlaneContext.Provider>
  );
}

export function useUserPlane(): UserPlaneSessionState {
  const ctx = useContext(UserPlaneContext);
  if (!ctx) {
    throw new Error("useUserPlane must only be consumed inside /dashboard/* layout.");
  }
  return ctx;
}
