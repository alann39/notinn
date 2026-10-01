import { Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";
import { SearchProvider } from "@/hooks/use-search";
import { ThemeProvider } from "@/hooks/use-theme";
import { useIsMobile } from "@/hooks/use-media-query";
import { ToastProvider } from "@/components/ui/toast";

export function DashboardAppLayout(): React.ReactElement {
  const isMobile = useIsMobile();

  return (
    <ThemeProvider>
      <SearchProvider>
        <AuthProvider>
          <ToastProvider position={isMobile ? "top-right" : "bottom-right"}>
            <Outlet />
          </ToastProvider>
        </AuthProvider>
      </SearchProvider>
    </ThemeProvider>
  );
}
