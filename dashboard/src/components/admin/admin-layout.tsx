import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Footer } from "@/components/layout/footer";
import { AdminSidebar } from "./admin-sidebar";
import { AdminNotificationsDrawer } from "./admin-notifications-drawer";
import { AdminBottomNav } from "./admin-bottom-nav";

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased transition-colors">
      {/* Skip link */}
      <a
        href="#admin-main"
        className="skip-link sr-only focus:not-sr-only focus:p-2 focus:bg-card focus:text-foreground"
      >
        Skip to admin content
      </a>

      {/* Admin Sidebar (Desktop only) */}
      <AdminSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 transition-all duration-200">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 sm:px-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs font-medium">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              <span>Operator Session</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <AdminNotificationsDrawer />
            <ThemeToggle />
          </div>
        </header>

        {/* Dynamic Admin Page Outlet */}
        <main id="admin-main" tabIndex={-1} className="flex-1 outline-none p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>

        {/* Floating Mobile Bottom Navigation */}
        <AdminBottomNav />

        {/* Global Branding Footer */}
        <Footer />
      </div>
    </div>
  );
}
