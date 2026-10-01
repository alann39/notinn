import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, MessageCircle } from "lucide-react";
import { AuthBackground } from "@/components/ui/auth-background";
import { TELEGRAM_URL } from "@/content/landing.id";
// Module-level guards to prevent React StrictMode from double-consuming single-use magic tokens
const inFlightTokens = new Set<string>();
const consumedTokens = new Set<string>();

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Invalid or missing link token.");
      return;
    }

    if (inFlightTokens.has(token) || consumedTokens.has(token)) return;
    inFlightTokens.add(token);

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

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Authentication failed");
        }

        const accessToken = data.access_token || data.session?.access_token;
        const refreshToken = data.refresh_token || data.session?.refresh_token;

        if (!accessToken || !refreshToken) {
          throw new Error(data.error || "No session returned from authentication server");
        }

        // Set the session in the Supabase client
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;

        consumedTokens.add(linkToken);
        inFlightTokens.delete(linkToken);

        // Redirect to notes dashboard
        navigate("/notes", { replace: true });
      } catch (err: unknown) {
        inFlightTokens.delete(linkToken);
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again from Telegram.";
        setError(message);
      }
    }

    exchangeToken(token);
  }, [searchParams, navigate]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#000",
        color: "#fff",
        fontFamily: "'Inter', -apple-system, sans-serif",
        padding: "2rem 1rem",
      }}
    >
      <AuthBackground />

      {/* Cardless state content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        {error ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "3rem",
                height: "3rem",
                borderRadius: "9999px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1.25rem",
              }}
            >
              <AlertCircle className="size-6 text-neutral-300" />
            </div>

            <h1
              style={{
                fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                fontSize: "clamp(2rem, 5vw, 3.25rem)",
                fontWeight: 600,
                letterSpacing: "-0.07em",
                lineHeight: 1.1,
                marginBottom: "0.75rem",
                color: "#fff",
                textShadow:
                  "0 4px 30px rgba(0, 0, 0, 0.7), 0 2px 10px rgba(0, 0, 0, 0.4)",
              }}
            >
              Authentication failed
            </h1>

            <p
              style={{
                fontSize: "0.9375rem",
                color: "rgba(255, 255, 255, 0.65)",
                lineHeight: 1.6,
                maxWidth: "38ch",
                marginBottom: "2rem",
                textShadow: "0 1px 12px rgba(0, 0, 0, 0.6)",
                textWrap: "pretty",
              }}
            >
              {error}
            </p>

            <Button
              type="button"
              className="gap-2 font-medium"
              style={{
                padding: "0.75rem 1.25rem",
                borderRadius: "0.625rem",
                background: "#ededed",
                color: "#000",
                fontWeight: 600,
                fontSize: "0.9375rem",
                letterSpacing: "-0.01em",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
                transition: "transform 0.15s ease, opacity 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.96)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              onClick={() =>
                window.open(TELEGRAM_URL, "_blank", "noopener,noreferrer")
              }
            >
              <MessageCircle className="size-4" />
              <span>Get new link in Telegram</span>
            </Button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: "1.5rem" }}>
              <Loader2
                className="size-7 animate-spin text-white/80"
                style={{
                  filter: "drop-shadow(0 2px 8px rgba(255,255,255,0.25))",
                }}
              />
            </div>

            <h1
              style={{
                fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                fontSize: "clamp(2.25rem, 6vw, 3.75rem)",
                fontWeight: 600,
                letterSpacing: "-0.08em",
                lineHeight: 1.05,
                marginBottom: "0.75rem",
                color: "#fff",
                textShadow:
                  "0 4px 30px rgba(0, 0, 0, 0.7), 0 2px 10px rgba(0, 0, 0, 0.4)",
              }}
            >
              Signing you in…
            </h1>

            <p
              style={{
                fontSize: "0.9375rem",
                color: "rgba(255, 255, 255, 0.65)",
                lineHeight: 1.6,
                maxWidth: "38ch",
                textShadow: "0 1px 12px rgba(0, 0, 0, 0.6)",
                textWrap: "pretty",
              }}
            >
              Verifying your magic link and securing your session.
            </p>
          </div>
        )}
      </div>

      {/* Back to login at bottom of screen */}
      <a
        href="/login"
        style={{
          position: "absolute",
          bottom: "max(1.5rem, env(safe-area-inset-bottom))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2,
          color: "rgba(255, 255, 255, 0.45)",
          fontSize: "0.8125rem",
          fontWeight: 500,
          letterSpacing: "-0.01em",
          textDecoration: "none",
          transition: "color 0.15s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.9)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.45)";
        }}
        onClick={(e) => {
          e.preventDefault();
          navigate("/login");
        }}
      >
        Back to login
      </a>
    </div>
  );
}

export default AuthCallbackPage;
