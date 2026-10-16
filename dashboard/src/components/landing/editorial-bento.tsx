import { MessageSquare, Mic, BookOpen, Maximize2, Check, ArrowRight } from "lucide-react";

export function EditorialBento() {
  return (
    <section id="features" className="py-20 border-t border-[var(--ed-line)]">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[var(--ed-ink)]">
            Everything you need to stop losing ideas.
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            A zero-friction cognitive inbox designed for messy thinkers who need structured output.
          </p>
        </div>

        <div className="ed-bento mt-12">
          {/* Card 1: Telegram Habit (Wide) */}
          <div className="ed-bcard ed-bcard--wide">
            <span className="ed-bcard__tag">Mobile &amp; Forwarding</span>
            <h3 className="ed-bcard__title">The Telegram Habit.</h3>
            <p className="ed-bcard__desc">
              You already keep Telegram open all day. Record a voice memo while walking, forward a messy debate from a group, or snap a screenshot. No slow app to open, no login prompt, no friction.
            </p>

            <div className="mt-8 p-4 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface-2)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-medium">
                  <MessageSquare className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--ed-ink)]">Voice memo to @notinnbot</p>
                  <p className="text-xs text-[var(--ed-text-3)] font-mono mt-0.5">03:42 · Audio 18.2 MB</p>
                </div>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-1 border border-emerald-500/20">
                <Check className="size-3" /> Note Ready (2.8s)
              </span>
            </div>
          </div>

          {/* Card 2: 45MB Audio Lab (Narrow) */}
          <div className="ed-bcard ed-bcard--narrow">
            <span className="ed-bcard__tag">Audio Engine</span>
            <h3 className="ed-bcard__title">45 MB Audio Ceiling.</h3>
            <p className="ed-bcard__desc">
              Screen Wake Lock keeps your phone browser awake during hour-long lectures. Pipelined multipart bypasses cloud limits silently.
            </p>
            <div className="mt-auto pt-6">
              <div className="p-3.5 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-surface-2)] flex items-center justify-between text-xs font-mono text-[var(--ed-text-2)]">
                <span className="flex items-center gap-1.5">
                  <Mic className="size-3.5 text-blue-600 dark:text-blue-400" /> Web Recording
                </span>
                <span className="text-emerald-800 dark:text-emerald-300 font-semibold">45 MB max</span>
              </div>
            </div>
          </div>

          {/* Card 3: Cornell vs Transcript (Narrow) */}
          <div className="ed-bcard ed-bcard--narrow">
            <span className="ed-bcard__tag">Cornell Method</span>
            <h3 className="ed-bcard__title">A transcript is not a note.</h3>
            <p className="ed-bcard__desc">
              Raw speech-to-text is an unreadable wall of words. Notinn extracts cues, decisions, questions, and action items in clean Cornell grids.
            </p>
            <div className="mt-auto pt-6">
              <div className="p-3.5 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-surface-2)] flex items-center justify-between text-xs font-mono text-[var(--ed-text-2)]">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="size-3.5 text-amber-600 dark:text-amber-400" /> Structure
                </span>
                <span className="text-amber-800 dark:text-amber-300 font-semibold">Cues + Summary</span>
              </div>
            </div>
          </div>

          {/* Card 4: Density & Zen Mode (Wide) */}
          <div className="ed-bcard ed-bcard--wide">
            <span className="ed-bcard__tag">Reading Environment</span>
            <h3 className="ed-bcard__title">Master-Detail Density &amp; Zen Mode.</h3>
            <p className="ed-bcard__desc">
              Built for high information throughput: dense p-3.5 lists, keyboard navigation, and a one-click Zen Mode that strips away all chrome for distraction-free reading.
            </p>

            <div className="mt-8 p-4 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface-2)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-neutral-500/10 text-[var(--ed-ink)] flex items-center justify-center font-medium">
                  <Maximize2 className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--ed-ink)]">Zen Reader Mode</p>
                  <p className="text-xs text-[var(--ed-text-3)] font-mono mt-0.5">Max-width 3xl · Zero Distractions</p>
                </div>
              </div>
              <a
                href="/notes"
                className="text-xs font-medium text-[var(--ed-ink)] hover:underline flex items-center gap-1"
              >
                Inspect Reader <ArrowRight className="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
