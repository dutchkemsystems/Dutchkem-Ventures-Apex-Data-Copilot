import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { UserPlaneProvider, type UserPlaneState } from "./UserPlaneContext";

interface DashboardLayoutProps {
  session: UserPlaneState;
  sidebar: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  mobileBottomNav?: React.ReactNode;
  mobileMenuOpen?: boolean;
  onMobileMenuOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * Isolated User Plane Layout (/dashboard/*)
 * Desktop (lg+): persistent left sidebar.
 * Mobile (<lg): hides sidebar, uses shadcn/ui Sheet slide-out menu + sticky bottom nav bar.
 */
export function DashboardLayout({
  session,
  sidebar,
  header,
  footer,
  mobileBottomNav,
  mobileMenuOpen = false,
  onMobileMenuOpenChange,
  children,
}: DashboardLayoutProps) {
  return (
    <UserPlaneProvider session={session}>
      <div
        data-security-plane="user"
        className="min-h-screen flex bg-gradient-to-br from-[#F8FAFF] via-[#F4F8FF] to-[#F4FCF9] text-[#0F172A] overflow-x-clip"
      >
        <div className="hidden lg:flex lg:shrink-0">{sidebar}</div>

        {sidebar && onMobileMenuOpenChange && (
          <Sheet open={mobileMenuOpen} onOpenChange={onMobileMenuOpenChange}>
            <SheetContent side="left" className="p-0 lg:hidden">
              <SheetHeader className="sr-only">
                <SheetTitle>Workspace Navigation</SheetTitle>
                <SheetDescription>
                  Switch workspace modules, tenant organization, or account settings.
                </SheetDescription>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>
        )}

        <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
          {header}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 2xl:p-10 max-w-[1440px] 2xl:max-w-[1840px] w-full mx-auto min-w-0">
            {children}
          </main>
          {footer}
        </div>

        {mobileBottomNav}
      </div>
    </UserPlaneProvider>
  );
}

export default DashboardLayout;
