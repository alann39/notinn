import { Bot, ArrowRight } from "lucide-react";

export function EditorialFooter() {
  return (
    <footer className="ed-footer">
      <div className="ed-shell">
        {/* Final CTA Strip */}
        <div className="text-center max-w-3xl mx-auto py-12">
          <h2 className="text-3xl sm:text-6xl font-semibold tracking-tight text-[var(--ed-ink)]">
            Turn your voice notes into <em className="ed-title-em">lasting clarity.</em>
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-4 max-w-xl mx-auto">
            Zero apps to install. Ten seconds to connect and start speaking your messy ideas.
          </p>

          <div className="flex items-center justify-center flex-wrap gap-3 mt-8">
            <a
              href="https://t.me/notinnbot"
              target="_blank"
              rel="noopener noreferrer"
              className="ed-btn ed-btn--primary"
            >
              <Bot className="size-4" />
              Open Telegram · @notinnbot
            </a>
            <a
              href="/notes"
              className="ed-btn ed-btn--ghost"
            >
              Web Dashboard
              <ArrowRight className="size-4 opacity-60" />
            </a>
          </div>

          <p className="text-xs text-[var(--ed-text-3)] mt-4">
            Free forever · iOS, Android, macOS, Windows · No credit card required
          </p>
        </div>

        {/* Colophon & Links */}
        <div className="mt-16 pt-8 border-t border-[var(--ed-line)] flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[var(--ed-text-3)]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--ed-ink)]">Notinn</span>
            <span className="font-mono text-[var(--ed-text-3)]">&#123; &#125;</span>
            <span>— Cognitive Inbox &amp; Cornell Synthesis</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="https://t.me/notinnbot" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--ed-ink)] transition-colors">
              Telegram Bot
            </a>
            <a href="/notes" className="hover:text-[var(--ed-ink)] transition-colors">
              Web Reader
            </a>
            <a href="https://t.me/itsarchii" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--ed-ink)] transition-colors">
              Support (@itsarchii)
            </a>
            <a href="https://alann.works" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--ed-ink)] transition-colors flex items-center gap-1">
              Crafted by Alann
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
