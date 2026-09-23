import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, useSidebar } from "@/hooks/use-sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { Footer } from "./footer";
import { cn } from "@/lib/utils";

function DashboardContent() {
  const { isCollapsed } = useSidebar();

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased transition-colors">
      {/* Skip to content link for keyboard navigation */}
      <a
        href="#main-content"
        className="skip-link sr-only focus:not-sr-only focus:p-2 focus:bg-card focus:text-foreground"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out",
          isCollapsed ? "lg:pl-16" : "lg:pl-64",
        )}
      >
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </main>

        {/* Global Branding Footer */}
        <Footer />
      </div>

      {/* Mobile Bottom Tab Bar */}
      <BottomNav />
    </div>
  );
}

export function DashboardLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground"
        role="status"
        aria-live="polite"
      >
        <Spinner className="size-6 text-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Loading your notes…</span>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SidebarProvider>
      <DashboardContent />
    </SidebarProvider>
  );
}
