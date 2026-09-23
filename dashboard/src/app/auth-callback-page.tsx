import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { NotinnLogo } from "@/components/brand/notinn-logo";

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestingRef = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Invalid or missing link token.");
      return;
    }

    if (requestingRef.current) return;
    requestingRef.current = true;

    // Exchange the magic token for a Supabase session
    async function exchangeToken(linkToken: string) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-auth`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: linkToken }),
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          if (response.status === 401) {
            setError(
              data?.error ||
                "This link has expired or has already been used. Please generate a new one with /web in Telegram.",
            );
          } else {
            setError(
              data?.error ||
                "Authentication service is temporarily unavailable. Please try again in a moment.",
            );
          }
          return;
        }

        const { access_token, refresh_token } = await response.json();

        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          setError("Failed to establish session. Please try again.");
          return;
        }

        navigate("/notes", { replace: true });
      } catch {
        setError("Something went wrong. Please try again from Telegram.");
      }
    }

    exchangeToken(token);
  }, [searchParams, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-4 py-12 transition-colors">
      <div className="w-full max-w-md space-y-6">
        {/* Brand mark */}
        <NotinnLogo size="lg" className="mx-auto" />

        {error ? (
          <div className="coss-card p-6 sm:p-8 space-y-5 text-center shadow-sm border-border">
            <div className="flex flex-col items-center gap-2">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground border border-border">
                <AlertCircle className="size-6" />
              </div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight pt-1">
                Authentication Failed
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1">
                {error}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <Button
                variant="default"
                size="default"
                onClick={() => window.open("https://t.me/NotinnBot", "_blank")}
                className="w-full gap-2 font-medium"
              >
                <span>Get New Link in Telegram</span>
                <ExternalLink className="size-3.5 opacity-70" />
              </Button>

              <Button
                variant="ghost"
                size="default"
                onClick={() => navigate("/login")}
                className="w-full gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                <span>Back to login</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="coss-card p-8 space-y-4 text-center shadow-sm border-border">
            <div className="flex justify-center py-2">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                Signing you in…
              </h2>
              <p className="text-xs text-muted-foreground">
                Verifying your magic link and securing your session.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
