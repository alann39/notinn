import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { ModernLogin } from "@/components/ui/modern-login-signup";

export function LoginPage(): React.ReactElement {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <Loader2 className="size-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/notes" replace />;
  }

  return <ModernLogin />;
}

export default LoginPage;
