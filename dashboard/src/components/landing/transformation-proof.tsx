import {
  AFTER_TOPICS,
  LANDING_CONTENT,
} from "@/content/landing.id";

export function TransformationProof(): React.ReactElement {
  return (
    <section className="landing-section" aria-labelledby="proof-heading">
      <div className="landing-container">
        <p className="landing-eyebrow">{LANDING_CONTENT.proofEyebrow}</p>
        <h2 id="proof-heading">{LANDING_CONTENT.proofHeading}</h2>
        <figure className="landing-proof-grid">
          <div className="landing-proof-panel landing-telegram-card">
            <div className="landing-panel-header">
              <span className="landing-panel-label">{LANDING_CONTENT.beforeLabel}</span>
              <span className="landing-telegram-source">Telegram</span>
            </div>
            <div className="landing-telegram-bubble">
              <blockquote>
                <p>{LANDING_CONTENT.beforeText}</p>
              </blockquote>
              <div className="landing-telegram-meta">
                <span className="landing-telegram-time">09:41</span>
                <span className="landing-telegram-checks" aria-label="Sent">✓✓</span>
              </div>
            </div>
          </div>
          <div className="landing-proof-panel landing-proof-result landing-notepad-card">
            <div className="landing-notepad-band" aria-hidden="true" />
            <div className="landing-panel-header">
              <span className="landing-panel-label">{LANDING_CONTENT.afterLabel}</span>
              <span className="landing-notepad-badge">Clean Note</span>
            </div>
            <h3>{LANDING_CONTENT.afterTitle}</h3>
            <h4>{LANDING_CONTENT.afterScheduleLabel}</h4>
            <p>{LANDING_CONTENT.afterSchedule}</p>
            <h4>{LANDING_CONTENT.afterTopicsLabel}</h4>
            <ul>
              {AFTER_TOPICS.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </div>
          <figcaption>{LANDING_CONTENT.proofDisclosure}</figcaption>
        </figure>
      </div>
    </section>
  );
}
