import { Navigate, Outlet } from "react-router-dom";
import { useAdmin } from "@/hooks/use-admin";
import { Spinner } from "@/components/ui/spinner";

export function AdminRouteGuard() {
  const { isAdmin, loading } = useAdmin();

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <Spinner className="size-6 text-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Verifying operator credentials…
        </span>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/notes" replace />;
  }

  return <Outlet />;
}
