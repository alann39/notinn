import { AI_LIMITATION, LANDING_CONTENT, PRIVACY_POINTS } from "@/content/landing.id";

export function PrivacyBoundary(): React.ReactElement {
  return (
    <section className="landing-section landing-inverse" aria-labelledby="privacy">
      <div className="landing-container">
        <p className="landing-eyebrow">{LANDING_CONTENT.privacyEyebrow}</p>
        <h2 id="privacy" tabIndex={-1}>
          {LANDING_CONTENT.privacyHeading}
        </h2>
        <ul className="landing-privacy-list">
          {PRIVACY_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p>{AI_LIMITATION}</p>
        <p>
          <a className="landing-inverse-link" href="/privacy">
            {LANDING_CONTENT.privacyLink}
          </a>
        </p>
      </div>
    </section>
  );
}
