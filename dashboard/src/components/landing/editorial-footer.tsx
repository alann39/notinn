import { Bot, ArrowRight } from "lucide-react";

export function EditorialFooter() {
  return (
    <footer className="ed-footer">
      <div className="ed-shell">
        {/* Final CTA Strip */}
        <div className="text-center max-w-3xl mx-auto py-12">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--ed-ink)]">
            Go turn scattered voice notes into <br />
            <em>calm decisions.</em>
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-4 max-w-xl mx-auto">
            Zero setup, 15 seconds to synthesize, and you will never lose an important commitment or brainstorm in your voice memos again.
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
              Try Web Dashboard
              <ArrowRight className="size-4 opacity-60" />
            </a>
          </div>

          <p className="text-xs font-mono text-[var(--ed-text-3)] mt-4">
            Zero app to install · Free to capture · Audio deleted after scan · No account required
          </p>
        </div>

        {/* Colophon & Links */}
        <div className="mt-16 pt-8 border-t border-[var(--ed-line)] flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[var(--ed-text-3)]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--ed-ink)]">Notinn</span>
            <span className="font-mono text-[var(--ed-text-3)]">[ ]</span>
            <span>— Cognitive Inbox &amp; Cornell Synthesis</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#showcase" className="hover:text-[var(--ed-ink)] transition-colors">
              Showcase
            </a>
            <a href="#workflow" className="hover:text-[var(--ed-ink)] transition-colors">
              Workflow
            </a>
            <a href="#comparison" className="hover:text-[var(--ed-ink)] transition-colors">
              Where it sits
            </a>
            <a href="#specs" className="hover:text-[var(--ed-ink)] transition-colors">
              Specs
            </a>
            <a href="#pricing" className="hover:text-[var(--ed-ink)] transition-colors">
              Pricing
            </a>
            <a href="https://see.alann.works" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--ed-ink)] transition-colors">
              Crafted by Alann
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
