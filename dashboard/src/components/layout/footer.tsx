import { ExternalLink, Shield } from "lucide-react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NotinnLogo } from "@/components/brand/notinn-logo";

export function Footer() {
  const location = useLocation();
  // BottomNav is hidden on note detail pages (/notes/:id)
  const isNoteDetail =
    location.pathname.startsWith("/notes/") && location.pathname !== "/notes";

  return (
    <footer
      className={cn(
        "mt-auto border-t border-border/40 bg-card/40 pt-6 px-4 sm:px-6 md:px-8 transition-colors",
        isNoteDetail ? "pb-6" : "pb-24 sm:pb-6",
      )}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <NotinnLogo size="xs" />
          <span className="font-semibold text-foreground tracking-tight">Notinn</span>
          <span>•</span>
          <span>Telegram-first note capture</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="https://t.me/NotinnBot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span>Telegram Bot</span>
            <ExternalLink className="size-3" />
          </a>

          <span className="hidden sm:inline">•</span>

          <span className="inline-flex items-center gap-1">
            <Shield className="size-3" />
            <span>Privacy-first</span>
          </span>

          <span className="hidden sm:inline">•</span>

          <span className="font-mono text-[11px] tabular-nums">
            © {new Date().getFullYear()} Notinn
          </span>
        </div>
      </div>
    </footer>
  );
}
