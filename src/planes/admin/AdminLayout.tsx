import React from "react";
import { AdminPlaneProvider, type AdminPlaneState } from "./AdminPlaneContext";

interface AdminLayoutProps {
  session: AdminPlaneState;
  sidebar: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Isolated Admin Plane Layout (/admin/*)
 * Enforces a dedicated AdminPlaneProvider boundary with zero User/Dashboard imports.
 */
export function AdminLayout({
  session,
  sidebar,
  header,
  footer,
  children,
}: AdminLayoutProps) {
  return (
    <AdminPlaneProvider session={session}>
      <div
        data-security-plane="admin"
        className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]"
      >
        {sidebar}
        <div className="flex-1 flex flex-col min-w-0">
          {header}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 2xl:p-10 pb-24 lg:pb-8 max-w-[1440px] 2xl:max-w-[1840px] w-full mx-auto">
            {children}
          </main>
          {footer}
        </div>
      </div>
    </AdminPlaneProvider>
  );
}

export default AdminLayout;
