import { LANDING_CONTENT, TELEGRAM_URL } from "@/content/landing.id";

export function Availability(): React.ReactElement {
  return (
    <section className="landing-section" aria-labelledby="availability-heading">
      <div className="landing-container">
        <div className="landing-availability">
          <h2 id="availability-heading">{LANDING_CONTENT.availabilityHeading}</h2>
          <p>{LANDING_CONTENT.availabilityBody}</p>
          <p className="landing-actions">
            <a className="landing-cta" href={TELEGRAM_URL} rel="noopener noreferrer">
              {LANDING_CONTENT.primaryCta}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
