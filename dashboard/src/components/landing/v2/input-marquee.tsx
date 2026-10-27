import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { MarqueeItem } from "./primitives/marquee-item";

interface MarqueeEntry {
  readonly label: string;
  /** The design alternates 500/300 so the strip does not read as a heading. */
  readonly weight: "medium" | "regular";
}

const MARQUEE_ENTRIES: readonly MarqueeEntry[] = [
  { label: "Text", weight: "medium" },
  { label: "Voice notes", weight: "regular" },
  { label: "Screenshots", weight: "medium" },
  { label: "Documents", weight: "regular" },
  { label: "Forwarded messages", weight: "medium" },
  { label: "Clean notes", weight: "regular" },
];

/** The design shows the six pairs twice across 1440px; the loop needs two runs anyway. */
const MARQUEE_LOOP: readonly MarqueeEntry[] = [...MARQUEE_ENTRIES, ...MARQUEE_ENTRIES];

function MarqueeSet(): React.ReactElement {
  return (
    <div className="v2-marquee__set">
      {MARQUEE_LOOP.map((entry, index) => (
        <MarqueeItem key={`${entry.label}-${index}`} weight={entry.weight}>
          {entry.label}
        </MarqueeItem>
      ))}
    </div>
  );
}

/**
 * Decorative horizontal loop. The visible track is `aria-hidden` and the real
 * content is the screen-reader list above it, so assistive tech hears six
 * formats once instead of twenty-four times. Motion is CSS only: the loop has to
 * survive prerendering, and a rAF loop for a decoration is a cost with no return.
 * WCAG 2.2.2 is satisfied by hover pause, a keyboard-reachable toggle, and
 * `prefers-reduced-motion`.
 */
export function InputMarquee(): React.ReactElement {
  const [paused, setPaused] = useState(false);

  return (
    <section className="v2-marquee" data-paused={paused} aria-labelledby="marquee-title">
      <h2 id="marquee-title" className="sr-only">
        What you can send to Notinn
      </h2>
      <ul className="sr-only">
        {MARQUEE_ENTRIES.map((entry) => (
          <li key={entry.label}>{entry.label}</li>
        ))}
      </ul>

      <div className="v2-marquee__viewport">
        <div className="v2-marquee__track" aria-hidden="true">
          <MarqueeSet />
          <MarqueeSet />
        </div>
      </div>

      <button
        type="button"
        className="v2-marquee__pause"
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? (
          <Play aria-hidden="true" size={12} />
        ) : (
          <Pause aria-hidden="true" size={12} />
        )}
        <span className="sr-only">
          {paused ? "Resume the scrolling list" : "Pause the scrolling list"}
        </span>
      </button>
    </section>
  );
}
