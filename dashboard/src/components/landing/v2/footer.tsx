import { ArrowUpRight } from "lucide-react";

interface Counter {
  readonly number: string;
  readonly label: string;
}

const COUNTERS: readonly Counter[] = [
  { number: "01", label: "KNOWLEDGE INBOX" },
  { number: "02", label: "TELEGRAM CAPTURE" },
  { number: "03", label: "AI STRUCTURING" },
  { number: "04", label: "WEB DASHBOARD" },
  { number: "05", label: "ABSOLUTE PRIVACY" },
  { number: "06", label: "CLEAN NOTES" },
];

interface FooterLink {
  readonly label: string;
  readonly href: string;
}

/**
 * `Product` has no page of its own; it points at the section that describes what
 * the product does. Hash links here reuse the same targets as the dock.
 */
const FOOTER_LINKS: readonly FooterLink[] = [
  { label: "Product", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

/** The design shows the six counters three times side by side. */
const TICKER_COPIES = 3;

function CounterSet({ hidden }: { readonly hidden?: boolean }): React.ReactElement {
  return (
    <ul className="v2-footer__ticker-set" aria-hidden="true" data-clone={hidden ? "true" : undefined}>
      {COUNTERS.map((counter) => (
        <li key={counter.label} className="v2-footer__ticker-item">
          <span className="v2-footer__ticker-num">{counter.number}</span>
          <span className="v2-footer__ticker-label">{counter.label}</span>
          <span className="v2-footer__ticker-rule" />
        </li>
      ))}
    </ul>
  );
}

export function Footer(): React.ReactElement {
  return (
    <footer className="v2-footer" role="contentinfo">
      <div className="v2-footer__ticker">
        {Array.from({ length: TICKER_COPIES }, (_, copy) => (
          <CounterSet key={copy} hidden={copy > 0} />
        ))}
      </div>
      <ul className="sr-only">
        {COUNTERS.map((counter) => (
          <li key={counter.label}>
            {counter.number} {counter.label}
          </li>
        ))}
      </ul>

      <div className="v2-footer__cta">
        <h2 className="v2-footer__title">
          Questions?
          <br />
          Talk to a human.
        </h2>
        <div className="v2-footer__actions">
          <a className="v2-footer__contact" href="mailto:contact@alann.works">
            contact@alann.works
            <ArrowUpRight aria-hidden="true" size={15} />
          </a>
          <nav aria-label="Footer">
            <ul className="v2-footer__links">
              {FOOTER_LINKS.map((link) => (
                <li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="v2-container v2-footer__bottom">
        <p>© 2026 NOTINN · KNOWLEDGE INBOX ON TELEGRAM</p>
        <p>NOTINN BY ARCH LABS</p>
      </div>
    </footer>
  );
}
