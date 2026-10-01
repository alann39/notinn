import { LANDING_CONTENT, LANDING_NAV, TELEGRAM_URL } from "@/content/landing.id";

export function LandingHeader(): React.ReactElement {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <a className="landing-brand" href="#atas" aria-label="Notinn, back to top">
        <img
          className="landing-brand-mark"
          src="/landing/notinn-lockup.png"
          alt="Notinn"
          width={132}
          height={34}
        />
        <span aria-hidden="true">Notinn</span>
      </a>
      <nav className="landing-nav" aria-label="Main navigation">
        <ul>
          {LANDING_NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <details className="landing-menu">
        <summary aria-label="Open navigation">Menu</summary>
        <nav aria-label="Brief navigation">
          <ul>
            {LANDING_NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
            <li>
              <a href="/notes">{LANDING_CONTENT.dashboardLink}</a>
            </li>
            <li>
              <a href={TELEGRAM_URL} rel="noopener noreferrer">
                {LANDING_CONTENT.primaryCta}
              </a>
            </li>
          </ul>
        </nav>
      </details>
        <div className="landing-header-actions">
          <a className="landing-utility-link" href="/notes">
            {LANDING_CONTENT.dashboardLink}
          </a>
          <a className="landing-cta" href={TELEGRAM_URL} rel="noopener noreferrer">
            {LANDING_CONTENT.primaryCta}
          </a>
        </div>
      </div>
    </header>
  );
}
