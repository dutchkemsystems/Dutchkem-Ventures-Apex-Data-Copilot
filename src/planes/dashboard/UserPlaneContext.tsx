import React, { createContext, useContext, useMemo } from "react";

export interface UserPlaneState {
  plane: "user";
  audience: "apex:user";
  userId: string;
  orgId: string;
  userEmail: string;
  userName: string;
}

const UserPlaneContext = createContext<UserPlaneState | null>(null);

export function UserPlaneProvider({
  session,
  children,
}: {
  session: UserPlaneState;
  children: React.ReactNode;
}) {
  const value = useMemo(() => session, [session]);
  return (
    <UserPlaneContext.Provider value={value}>{children}</UserPlaneContext.Provider>
  );
}

export function useUserPlaneContext(): UserPlaneState {
  const ctx = useContext(UserPlaneContext);
  if (!ctx) {
    throw new Error("useUserPlaneContext must be used strictly inside /dashboard/* plane.");
  }
  return ctx;
}
