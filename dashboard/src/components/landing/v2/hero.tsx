import { Send } from "lucide-react";
import { TELEGRAM_URL } from "@/content/landing.id";
import { useNoteCount } from "@/hooks/use-note-count";
import { SpecimenSheet } from "./specimen-sheet";

interface HeroIndexEntry {
  readonly number: string;
  readonly label: string;
  readonly value: string;
}

const HERO_INDEX: readonly HeroIndexEntry[] = [
  { number: "01", label: "CAPTURE", value: "voice · text · files" },
  { number: "02", label: "STRUCTURE", value: "title · summary · tags" },
  { number: "03", label: "RETRIEVE", value: "search · ask · export" },
];

const NOTE_COUNT_FORMAT = new Intl.NumberFormat("en-US");

/**
 * The live badge shows a real count or nothing at all. `notes` is RLS-protected,
 * so a signed-out visitor reads no rows and the badge stays hidden instead of
 * printing an invented number.
 */
function LiveNoteCount(): React.ReactElement | null {
  const { count } = useNoteCount();
  // Null means the read was blocked or failed; zero means there is nothing to
  // count. Either way the badge stays hidden rather than showing a fake number.
  if (count === null || count === 0) return null;

  return (
    <p className="v2-live" aria-live="polite">
      <span className="v2-live__dot" aria-hidden="true" />
      <span>{NOTE_COUNT_FORMAT.format(count)} notes captured</span>
    </p>
  );
}

export function Hero(): React.ReactElement {
  return (
    <section id="capture" className="v2-hero" aria-labelledby="hero-title" tabIndex={-1}>
      <div className="v2-hero__grid" aria-hidden="true" />
      <div className="v2-container v2-hero__inner">
        <div className="v2-hero__bar">
          <div className="v2-brand">
            <img
              className="v2-brand__mark"
              src="/landing/v2/notinn-logo.png"
              alt="Notinn"
              width={30}
              height={30}
            />
            <span className="v2-brand__word">Notinn.</span>
          </div>
          <LiveNoteCount />
        </div>

        <div className="v2-hero__columns">
          <div className="v2-hero__headline">
            <p className="v2-hero__index">(01)</p>
            <h1 id="hero-title" className="v2-hero__title">
              Notes that
              <br />
              write themselves.
            </h1>
            <p className="v2-hero__lede">
              Forward text, voice notes, screenshots, or documents to Notinn on Telegram. Get a
              clear, structured note back — every single time.
            </p>
            <div className="v2-hero__actions">
              <a
                className="v2-btn v2-btn--primary"
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Telegram
                <Send aria-hidden="true" size={15} />
              </a>
              <a className="v2-btn v2-btn--secondary" href="#how-it-works">
                How it works
              </a>
            </div>

            <ul className="v2-index-list" aria-label="What Notinn does">
              {HERO_INDEX.map((entry) => (
                <li key={entry.label} className="v2-index-row">
                  <span className="v2-index-row__num">{entry.number}</span>
                  <span className="v2-index-row__label">{entry.label}</span>
                  <span className="v2-index-row__value">{entry.value}</span>
                </li>
              ))}
            </ul>
          </div>

          <SpecimenSheet />
        </div>
      </div>
    </section>
  );
}
