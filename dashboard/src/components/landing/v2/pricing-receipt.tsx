import { ChevronDown } from "lucide-react";
import { SectionHeader } from "./primitives/section-header";

interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

const FAQ: readonly FaqEntry[] = [
  {
    question: "Do I need to install an app?",
    answer: "No. Notinn runs natively inside Telegram — no separate app to maintain.",
  },
  {
    question: "What formats can I send?",
    answer: "Text, voice notes up to 2 hours, screenshots, PDFs, DOCX, and links.",
  },
  {
    question: "What about my privacy?",
    answer: "Originals stay in your Telegram chat. Notinn stores only the structured note.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Send “stop” to @NotinnBot. Your notes stay readable in the dashboard.",
  },
  {
    question: "Is there a free trial?",
    answer: "The Free Starter plan is free forever — 30 notes a month, no card required.",
  },
];

interface ReceiptItem {
  readonly dot?: boolean;
  readonly name: string;
  readonly emphasis?: boolean;
  readonly code: string;
}

const RECEIPT_ITEMS: readonly ReceiptItem[] = [
  { name: "1,000 notes", emphasis: true, code: "MONTHLY" },
  { name: "Voice capture", emphasis: true, code: "UP TO 2HRS" },
  { name: "300 Ask queries", emphasis: true, code: "MONTHLY" },
  { dot: true, name: "Semantic search", code: "INCL." },
  { dot: true, name: "Web dashboard", code: "PERM." },
  { dot: true, name: "Priority queue", code: "INCL." },
];

const META_ROWS: readonly { readonly label: string; readonly value: string }[] = [
  { label: "DATE", value: "2026-10-21" },
  { label: "TIME", value: "10:42 WIB" },
  { label: "RECEIPT Nº", value: "000042" },
  { label: "CUSTOMER", value: "@archii" },
];

/** Bar widths in px, the design's 40 barcode rectangles (71px + 39 gaps = 149). */
const BARCODE_WIDTHS: readonly number[] = [
  2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 2, 1,
  2, 1, 3, 1, 2, 2, 1, 3,
];

function Receipt(): React.ReactElement {
  return (
    <article className="v2-receipt" aria-labelledby="receipt-brand">
      <div className="v2-receipt__brand">
        <h3 id="receipt-brand" className="v2-receipt__brand-name">
          NOTINN
        </h3>
        <p className="v2-receipt__brand-meta">CAPTURE STATION · @NOTINNBOT</p>
      </div>

      <hr className="v2-receipt__rule" />

      <dl className="v2-receipt__meta">
        {META_ROWS.map((row) => (
          <div key={row.label} className="v2-receipt__meta-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <hr className="v2-receipt__rule v2-receipt__rule--soft" />

      <ul className="v2-receipt__items">
        {RECEIPT_ITEMS.map((item) => (
          <li key={item.name} className="v2-receipt__item">
            <span className="v2-receipt__item-main">
              {item.dot ? (
                <span className="v2-receipt__item-dot" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <span
                className="v2-receipt__item-name"
                data-emphasis={item.emphasis ? "true" : undefined}
              >
                {item.name}
              </span>
            </span>
            <span className="v2-receipt__item-code">{item.code}</span>
          </li>
        ))}
      </ul>

      <hr className="v2-receipt__rule" />

      <dl className="v2-receipt__totals">
        <div className="v2-receipt__total-row">
          <dt>SUBTOTAL</dt>
          <dd>Rp 20.000</dd>
        </div>
        <div className="v2-receipt__total-row" data-discount="true">
          <dt>EARLY BIRD -50%</dt>
          <dd>-Rp 10.000</dd>
        </div>
      </dl>

      <div className="v2-receipt__grand">
        <span className="v2-receipt__grand-label">TOTAL</span>
        <span className="v2-receipt__grand-value">Rp 10.000/mo</span>
      </div>

      <hr className="v2-receipt__rule v2-receipt__rule--soft" />

      <div className="v2-receipt__barcode" aria-hidden="true">
        {BARCODE_WIDTHS.map((width, index) => (
          <span
            key={`${width}-${index}`}
            className="v2-receipt__bar"
            style={{ width }}
          />
        ))}
      </div>

      <p className="v2-receipt__code">N0T1NN-PR0-0042-WIB</p>
      <p className="v2-receipt__note">
        KEEP THIS RECEIPT FOR YOUR RECORDS
        <br />
        REFUND WITHIN 14 DAYS · CANCEL: TEXT “STOP”
      </p>
    </article>
  );
}

export function PricingReceipt(): React.ReactElement {
  return (
    <section id="pricing" className="v2-pricing" aria-labelledby="pricing-title" tabIndex={-1}>
      <div className="v2-container v2-pricing__grid">
        <SectionHeader
          className="v2-pricing__header"
          eyebrow="04 — PRICING"
          size="lg"
          titleId="pricing-title"
          title={
            <>
              Pro, the price
              <br />
              of two coffees.
            </>
          }
          intro="One plan. Every capture feature. Cancel in Telegram with one word — “stop”."
        />

        <Receipt />

        <div id="faq" className="v2-faq" tabIndex={-1} aria-labelledby="pricing-title">
          {FAQ.map((entry) => (
            <details key={entry.question} className="v2-faq__item">
              <summary className="v2-faq__question">
                <span>{entry.question}</span>
                <ChevronDown aria-hidden="true" size={16} className="v2-faq__chev" />
              </summary>
              <div className="v2-faq__answer">
                <div>
                  <p>{entry.answer}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
