import { ArrowUpRight, Check, X } from "lucide-react";
import { TELEGRAM_URL } from "@/content/landing.id";
import { SectionHeader } from "./primitives/section-header";

type ArtVariant = "idea" | "meeting" | "source" | "quarter";

interface Contrast {
  readonly title: string;
  readonly before: string;
  readonly after: string;
  readonly art: ArtVariant;
}

const CONTRASTS: readonly Contrast[] = [
  {
    title: "You just had an idea",
    before: "It stays in your head. Later you can't find it.",
    after: "Send a voice note in Telegram on the walk back.",
    art: "idea",
  },
  {
    title: "A meeting ends",
    before: "Action items get buried in a wall of chat.",
    after: "A structured note with a summary and action items.",
    art: "meeting",
  },
  {
    title: "You need the source",
    before: "Scroll back through four chats and an album.",
    after: "Search, or ask a question with citations.",
    art: "source",
  },
  {
    title: "A quarter later",
    before: "The context is gone. You start from zero.",
    after: "Export the note to PDF and reopen it in a minute.",
    art: "quarter",
  },
];

const TRUST_POINTS: readonly string[] = [
  "Telegram-first capture",
  "Structured by default",
  "Useful after saving",
];

const ART_SRC: Readonly<Record<ArtVariant, string>> = {
  idea: "/landing/v2/peep-idea.png",
  meeting: "/landing/v2/peep-meeting.png",
  source: "/landing/v2/peep-search.png",
  quarter: "/landing/v2/peep-later.png",
};

function Art({ variant }: { readonly variant: ArtVariant }): React.ReactElement {
  return (
    <img
      className="v2-ba-art"
      src={ART_SRC[variant]}
      alt=""
      aria-hidden="true"
      width={150}
      height={150}
    />
  );
}

function ContrastCard({ title, before, after, art }: Contrast): React.ReactElement {
  return (
    <article className="v2-ba-card">
      <Art variant={art} />
      <div className="v2-ba-card__body">
        <h3 className="v2-ba-card__title">{title}</h3>
        <ul className="v2-ba-card__states">
          <li className="v2-ba-card__state" data-tone="negative">
            <span className="v2-ba-card__mark">
              <X aria-hidden="true" size={10} />
            </span>
            <p>{before}</p>
          </li>
          <li className="v2-ba-card__state" data-tone="positive">
            <span className="v2-ba-card__mark">
              <Check aria-hidden="true" size={11} />
            </span>
            <p>{after}</p>
          </li>
        </ul>
      </div>
    </article>
  );
}

export function BeforeAfter(): React.ReactElement {
  return (
    <section className="v2-before-after" aria-labelledby="before-after-title">
      <div className="v2-container">
        <SectionHeader
          eyebrow="03 — BEFORE AND AFTER"
          titleId="before-after-title"
          title={
            <>
              The same thought,
              <br />
              handled two ways.
            </>
          }
          intro="A note app you have to open is a note you won't write. Notinn sits inside the chat you already use."
        />

        <div className="v2-ba__grid">
          {CONTRASTS.map((contrast) => (
            <ContrastCard key={contrast.title} {...contrast} />
          ))}
        </div>

        <div className="v2-ba__trust">
          <ul className="v2-ba__trust-list">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="v2-ba__trust-item">
                <Check aria-hidden="true" size={13} className="v2-ba__trust-icon" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <a
            className="v2-btn v2-btn--primary v2-ba__cta"
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Try Notinn on Telegram
            <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
