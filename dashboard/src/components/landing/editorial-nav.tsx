import { Bot, ArrowRight } from "lucide-react";

export function EditorialNav() {
  return (
    <header className="ed-nav">
      <div className="ed-shell ed-nav__in">
        <a href="/" className="ed-brand" aria-label="Notinn Home">
          <span>Notinn</span>
          <span className="ed-brand__bracket">[ ]</span>
        </a>

        <nav className="ed-nav__links hidden md:flex" aria-label="Main Navigation">
          <a href="#showcase" className="ed-nav__link">Showcase</a>
          <a href="#workflow" className="ed-nav__link">Workflow</a>
          <a href="#comparison" className="ed-nav__link">Where it sits</a>
          <a href="#specs" className="ed-nav__link">Specs</a>
          <a href="#pricing" className="ed-nav__link">Pricing</a>
          <a href="#faq" className="ed-nav__link">FAQ</a>
        </nav>

        <div className="ed-nav__actions flex items-center gap-3">
          <a
            href="https://t.me/notinnbot"
            target="_blank"
            rel="noopener noreferrer"
            className="ed-btn ed-btn--primary ed-btn--sm"
          >
            <Bot className="size-3.5" />
            <span>Open Telegram</span>
            <ArrowRight className="size-3 opacity-60 hidden sm:inline" />
          </a>
        </div>
      </div>
    </header>
  );
}
