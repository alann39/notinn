import { ArrowUpRight } from "lucide-react";

export function EditorialNav() {
  return (
    <nav className="ed-nav">
      <div className="ed-shell ed-nav__in">
        <a href="/" className="ed-brand">
          <span>Notinn</span>
          <span className="ed-brand__bracket">&#123; &#125;</span>
        </a>

        <div className="ed-nav__links hidden md:flex">
          <a href="#how-it-works" className="ed-nav__link">How it works</a>
          <a href="#features" className="ed-nav__link">Features</a>
          <a href="#audio-lab" className="ed-nav__link">Audio Lab</a>
          <a href="#pricing" className="ed-nav__link">Pricing</a>
          <a href="#faq" className="ed-nav__link">FAQ</a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/notes"
            className="text-[13.5px] font-medium text-[var(--ed-text-2)] hover:text-[var(--ed-ink)] transition-colors hidden sm:inline-flex items-center gap-1"
          >
            Dashboard
            <ArrowUpRight className="size-3.5 opacity-60" />
          </a>
          <a
            href="https://t.me/notinnbot"
            target="_blank"
            rel="noopener noreferrer"
            className="ed-btn ed-btn--sm ed-btn--primary"
          >
            Open Telegram
          </a>
        </div>
      </div>
    </nav>
  );
}
