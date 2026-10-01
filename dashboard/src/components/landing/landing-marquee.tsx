import { MARQUEE_ITEMS } from "@/content/landing.id";
import ScrollBaseAnimation from "@/components/ui/scroll-text-marquee";

export function LandingMarquee(): React.ReactElement {
  // U+00A0 (NBSP) is not trimmed at block edges and does not collapse, so the
  // joint between repeated spans matches the inner separators exactly. Plain
  // spaces would collapse inside and trim at the edges, gluing the joint.
  const SEP = " ✳ ";
  const text = `${MARQUEE_ITEMS.join(SEP)}${SEP}`;
  return (
    <section className="landing-marquee" aria-label="What Notinn handles">
      <div aria-hidden="true" className="landing-marquee-rows">
        <ScrollBaseAnimation
          baseVelocity={-1}
          className="landing-marquee-text text-[6vw] sm:text-[2.5vw]"
        >
          {text}
        </ScrollBaseAnimation>
        <ScrollBaseAnimation
          baseVelocity={1}
          className="landing-marquee-text text-[6vw] sm:text-[2.5vw]"
        >
          {text}
        </ScrollBaseAnimation>
      </div>
      <p className="sr-only">{text}</p>
    </section>
  );
}
