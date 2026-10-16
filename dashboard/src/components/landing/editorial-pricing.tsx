import { Check, ArrowRight } from "lucide-react";

export function EditorialPricing() {
  return (
    <section id="pricing" className="py-20 border-t border-[var(--ed-line)]">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-widest text-[var(--ed-text-3)] font-semibold">
            Honest Economics
          </p>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[var(--ed-ink)] mt-2">
            Capturing is <em className="ed-title-em">free.</em> Power features for deep thinkers.
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            Start right away on Telegram without entering a credit card or creating a password.
          </p>
        </div>

        <div className="ed-pricing-grid">
          {/* Free Tier */}
          <div className="ed-plan">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--ed-text-3)] font-semibold">
              Free Forever
            </span>
            <div className="ed-plan__price">
              $0 <span className="ed-plan__period">no credit card</span>
            </div>
            <p className="text-sm text-[var(--ed-text-2)] mt-1">
              Everything you need for everyday mobile note capture on Telegram.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-[var(--ed-ink)] flex-1">
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Unlimited daily Telegram voice &amp; text notes</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Full Cornell synthesis (Cues + Notes + Actions)</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Web reader dashboard with Zen Mode</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Full-text search across your entire archive</span>
              </li>
            </ul>

            <div className="mt-8">
              <a
                href="https://t.me/notinnbot"
                target="_blank"
                rel="noopener noreferrer"
                className="ed-btn ed-btn--ghost w-full"
              >
                Start Free on Telegram
              </a>
            </div>
          </div>

          {/* Pro / Alpha Tier */}
          <div className="ed-plan ed-plan--pro">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--ed-ink)] font-semibold">
                Pro / Alpha
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                Deep Work
              </span>
            </div>
            <div className="ed-plan__price">
              $9 <span className="ed-plan__period">per month</span>
            </div>
            <p className="text-sm text-[var(--ed-text-2)] mt-1">
              For power users recording multi-hour lectures, board meetings, and client research.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-[var(--ed-ink)] flex-1">
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>45 MB in-browser audio recording</strong> (1–2 hour sessions)</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Screen Wake Lock protection</strong> against lock-screen cutoffs</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Priority Gemini 2.5 synthesis worker queues</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>Direct Markdown &amp; structured JSON export</span>
              </li>
            </ul>

            <div className="mt-8">
              <a
                href="/notes"
                className="ed-btn ed-btn--primary w-full"
              >
                Get Pro Access
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
