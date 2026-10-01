import { LANDING_CONTENT, TELEGRAM_URL } from "@/content/landing.id";

export function FinalCta(): React.ReactElement {
  return (
    <section className="landing-section landing-inverse" aria-labelledby="final-heading">
      <div className="landing-container landing-final">
        <h2 id="final-heading">{LANDING_CONTENT.finalHeading}</h2>
        <p>{LANDING_CONTENT.finalBody}</p>
        <p>
          <a className="landing-final-cta" href={TELEGRAM_URL} rel="noopener noreferrer">
            {LANDING_CONTENT.primaryCta}
          </a>
        </p>
        <p className="landing-note">{LANDING_CONTENT.finalNote}</p>
      </div>
    </section>
  );
}
