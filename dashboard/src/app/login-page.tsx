import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { NotinnLogo } from "@/components/brand/notinn-logo";

export function LoginPage() {
  const { session, loading } = useAuth();
  const [copied, setCopied] = useState(false);

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText("/web");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy command");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/notes" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-4 py-12 transition-colors">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <NotinnLogo size="xl" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
            Notinn
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xs leading-relaxed">
            Telegram-first capture. Structured notes and search in your browser.
          </p>
        </div>

        {/* Login Instructions Card */}
        <div className="coss-card p-6 sm:p-8 space-y-6 shadow-sm border-border">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              How to sign in
            </h2>
            <p className="text-xs text-muted-foreground">
              Access your web dashboard via your Telegram account
            </p>
          </div>

          <ol className="space-y-4 text-xs sm:text-sm">
            <li className="flex items-start gap-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground border border-border mt-0.5">
                1
              </div>
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">Open Notinn in Telegram</p>
                <p className="text-xs text-muted-foreground">
                  Open your private chat with the Notinn bot.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground border border-border mt-0.5">
                2
              </div>
              <div className="space-y-1.5 flex-1">
                <p className="font-medium text-foreground">Send the login command</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className="inline-flex items-center gap-1.5 rounded bg-muted hover:bg-muted/80 border border-border px-2 py-0.5 text-xs font-mono text-foreground transition-all cursor-pointer"
                    title="Click to copy command"
                  >
                    <span>/web</span>
                    {copied ? (
                      <Check className="size-3 text-foreground" />
                    ) : (
                      <Copy className="size-3 text-muted-foreground" />
                    )}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {copied ? "Copied to clipboard!" : "Click to copy"}
                  </span>
                </div>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground border border-border mt-0.5">
                3
              </div>
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">Click your magic link</p>
                <p className="text-xs text-muted-foreground">
                  The bot replies with a secure, single-use login link.
                </p>
              </div>
            </li>
          </ol>

          <Button
            variant="default"
            size="lg"
            className="w-full gap-2 font-medium"
            onClick={() => window.open("https://t.me/NotinnBot", "_blank")}
          >
            <MessageCircle className="size-4" />
            <span>Open Notinn Bot</span>
            <ExternalLink className="size-3.5 opacity-70" />
          </Button>

          <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" />
            <span>No passwords required. Secured by Telegram.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
