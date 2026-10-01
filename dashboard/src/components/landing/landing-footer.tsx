import { TELEGRAM_URL } from "@/content/landing.id";

export function LandingFooter(): React.ReactElement {
  return (
    <footer className="landing-minimal-footer" role="contentinfo">
      <div className="landing-container landing-minimal-footer-inner">
        <p className="landing-minimal-footer-copy">
          &copy; {new Date().getFullYear()} Notinn. Knowledge inbox on Telegram.
        </p>
        <nav className="landing-minimal-footer-links" aria-label="Footer links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            Telegram
          </a>
        </nav>
      </div>
    </footer>
  );
}
