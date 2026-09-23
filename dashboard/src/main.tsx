import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { SearchProvider } from "@/hooks/use-search";
import { router } from "@/app/router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SearchProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </SearchProvider>
    </ThemeProvider>
  </StrictMode>,
);

