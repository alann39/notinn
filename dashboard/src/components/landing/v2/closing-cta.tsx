import { Check, LayoutDashboard, Send } from "lucide-react";
import { TELEGRAM_URL } from "@/content/landing.id";

const TRUST_POINTS: readonly string[] = [
  "No app install",
  "No credit card",
  "Cancel anytime",
];

/**
 * The last section inside `<main>`. It repeats the hero's two primary actions,
 * so both CTAs point at the same destinations rather than inventing new ones.
 */
export function ClosingCta(): React.ReactElement {
  return (
    <section className="v2-cta" aria-labelledby="cta-title">
      <div className="v2-cta__grid" aria-hidden="true" />
      <div className="v2-cta__inner">
        <div className="v2-cta__content">
          <p className="v2-cta__pill">
            <Send aria-hidden="true" size={14} />
            <span>GET STARTED TODAY</span>
          </p>
          <h2 id="cta-title" className="v2-cta__title">
            Ready to begin?
          </h2>
          <p className="v2-cta__sub">
            Start free on Telegram with 30 notes. No downloads, no setup wizard, no new habit to
            build.
          </p>
          <div className="v2-cta__actions">
            <a
              className="v2-btn v2-btn--primary"
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Telegram
              <Send aria-hidden="true" size={16} />
            </a>
            <a className="v2-btn v2-btn--surface" href="/notes">
              Web Dashboard
              <LayoutDashboard aria-hidden="true" size={20} />
            </a>
          </div>
        </div>
        <ul className="v2-cta__trust">
          {TRUST_POINTS.map((point) => (
            <li key={point}>
              <Check aria-hidden="true" size={12} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
