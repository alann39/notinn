import { ExternalLink, Lock, LogOut, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useTrial } from "@/hooks/use-trial";

export function TrialExpiredScreen() {
  const { signOut, user } = useAuth();
  const { formattedExpiryDate } = useTrial();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground antialiased selection:bg-primary/20">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand / Logo */}
        <div className="flex items-center justify-center gap-2.5">
          <img
            src="/notinn-logo.png"
            alt="Notinn"
            className="size-9 object-contain rounded-xl"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="font-semibold text-xl tracking-tight">Notinn</span>
        </div>

        {/* Paywall Card */}
        <Card className="rounded-2xl border border-amber-500/25 bg-card/95 p-6 sm:p-8 shadow-xl backdrop-blur-md space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="size-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400">
              <Lock className="size-7" />
            </div>

            <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10">
              Free trial ended
            </Badge>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Web dashboard access has ended
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
              Free accounts are limited to the first 14 days after sign-up. Your trial ended{" "}
              <strong className="text-foreground">{formattedExpiryDate || "today"}</strong>.
            </p>
          </div>

          {/* Reassurance note */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            🛡️ <strong className="text-foreground">Your notes are safe!</strong> All your notes remain stored and searchable, and you can create and open them any time through the <strong>Notinn Telegram bot</strong>.
          </div>

          {/* Promo Offer Card */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <Sparkles className="size-4" />
              <span>Upgrade to Notinn Pro</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get full web dashboard access forever, 1,000 notes per month, and priority AI processing for only <strong className="text-foreground">Rp 10,000 / month</strong> (first 100 users).
            </p>
          </div>

          {/* Action CTAs */}
          <div className="space-y-3 pt-2">
            <a
              href="https://tiptap.gg/notinn"
              target="_blank"
              rel="noreferrer"
              className="w-full inline-block"
            >
              <Button size="lg" className="w-full rounded-xl gap-2 font-medium">
                <Sparkles className="size-4" />
                Upgrade to Pro with TipTap (Rp 10,000)
                <ExternalLink className="size-3.5 opacity-70 ml-auto" />
              </Button>
            </a>

            <div className="grid grid-cols-2 gap-2.5">
              <a
                href="https://t.me/NotinnBot"
                target="_blank"
                rel="noreferrer"
                className="w-full inline-block"
              >
                <Button variant="outline" className="w-full rounded-xl gap-2 text-xs sm:text-sm">
                  <Send className="size-3.5" />
                  Open Telegram
                </Button>
              </a>

              <Button
                variant="outline"
                onClick={() => signOut()}
                className="w-full rounded-xl gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </Button>
            </div>
          </div>
        </Card>

        {user?.email && (
          <p className="text-center text-xs text-muted-foreground">
            Signed in as: {user.email}
          </p>
        )}
      </div>
    </div>
  );
}
