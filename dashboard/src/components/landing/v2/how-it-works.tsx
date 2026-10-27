import { Mic, Route, Search, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeader } from "./primitives/section-header";
import { StatBlock } from "./primitives/stat-block";

interface Step {
  readonly index: string;
  readonly label: string;
  readonly body: string;
  readonly meta: string;
  readonly icon: LucideIcon;
  readonly art: string;
}

const STEPS: readonly Step[] = [
  {
    index: "01",
    label: "SEND ANYTHING",
    body: "Voice notes, screenshots, PDFs, or plain text.",
    meta: "in‑chat",
    icon: Mic,
    art: "/landing/v2/step-01.png",
  },
  {
    index: "02",
    label: "GETS STRUCTURED",
    body: "Titles, summaries, action items, tags.",
    meta: "~4s",
    icon: Sparkles,
    art: "/landing/v2/step-02.png",
  },
  {
    index: "03",
    label: "STAYS USEFUL",
    body: "Search, ask, export — chat or dashboard.",
    meta: "forever",
    icon: Search,
    art: "/landing/v2/step-03.png",
  },
];

export function HowItWorks(): React.ReactElement {
  return (
    <section id="how-it-works" className="v2-how" aria-labelledby="how-title" tabIndex={-1}>
      <div className="v2-container">
        <SectionHeader
          eyebrow="How it works"
          eyebrowIcon={Route}
          eyebrowVariant="pill"
          size="lg"
          titleId="how-title"
          title={
            <>
              Stay in Telegram.
              <br />
              Three steps only.
            </>
          }
        />

        <div className="v2-how__grid">
          {STEPS.map((step) => (
            <StatBlock
              key={step.index}
              index={step.index}
              label={step.label}
              body={step.body}
              meta={step.meta}
              icon={step.icon}
            >
              <img
                className="v2-how__art"
                src={step.art}
                alt=""
                aria-hidden="true"
                width={341}
                height={196}
              />
            </StatBlock>
          ))}
        </div>

        <p className="v2-how__note">
          <Zap aria-hidden="true" size={14} />
          <span>
            No app install. No bot commands to memorise. It all happens where you already talk.
          </span>
        </p>
      </div>
    </section>
  );
}
