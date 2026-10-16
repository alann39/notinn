import { useState } from "react";
import { ArrowRight, Bot, Play, Pause, Sparkles, Check, CheckCircle2, ChevronRight } from "lucide-react";

export function EditorialHero() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState<Record<number, boolean>>({
    0: true,
    1: false,
    2: false,
  });

  const toggleTask = (index: number) => {
    setCheckedTasks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <section className="ed-hero">
      <div className="ed-shell">
        {/* Release Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--ed-line)] bg-[var(--ed-surface)] shadow-2xs text-xs font-mono text-[var(--ed-text-2)] mb-6">
          <span className="size-2 rounded-full bg-blue-600 animate-pulse" />
          <span>Notinn // iArchii Labs</span>
          <span className="text-[var(--ed-text-3)]">·</span>
          <span className="text-[var(--ed-ink)] font-medium">AI Workflow v2.4</span>
        </div>

        {/* Main Headline */}
        <h1 className="ed-hero__title">
          Speak messy thoughts. <br />
          Read <em className="ed-title-em">academic clarity.</em>
        </h1>

        {/* Subhead */}
        <p className="ed-hero__sub">
          A zero-friction cognitive inbox on Telegram and Web. Forward any audio, chaotic voice note,
          or text memo; Notinn extracts the essence and builds structured Cornell notes in seconds.
        </p>

        {/* Action CTAs */}
        <div className="ed-hero__actions">
          <a
            href="https://t.me/notinnbot"
            target="_blank"
            rel="noopener noreferrer"
            className="ed-btn ed-btn--primary shadow-md hover:shadow-lg"
          >
            <Bot className="size-4" />
            Open in Telegram · @notinnbot
          </a>
          <a
            href="/notes"
            className="ed-btn ed-btn--ghost"
          >
            Try Web Dashboard
            <ArrowRight className="size-4 opacity-60" />
          </a>
        </div>

        {/* Spec Bar */}
        <div className="ed-hero__meta font-mono text-xs">
          <span>Free to capture</span>
          <span className="ed-hero__meta-dot">•</span>
          <span>45 MB audio ceiling</span>
          <span className="ed-hero__meta-dot">•</span>
          <span>Screen Wake Lock</span>
          <span className="ed-hero__meta-dot">•</span>
          <span>Cornell format</span>
          <span className="ed-hero__meta-dot">•</span>
          <span>No app install</span>
        </div>

        {/* Central Stage: The Visual Before-and-After Proof */}
        <div className="ed-stage">
          {/* Floating Pill Badges */}
          <div className="hidden lg:flex ed-tile absolute -top-4 left-6 z-20">
            <span className="size-2 rounded-full bg-blue-500 animate-ping" />
            <span className="font-mono text-xs font-medium text-[var(--ed-ink)]">
              Voice Note · 01:42:18
            </span>
          </div>

          <div className="hidden lg:flex ed-tile absolute -bottom-4 right-8 z-20">
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-mono text-xs font-medium text-[var(--ed-ink)]">
              Cornell Synthesis · Ready
            </span>
          </div>

          {/* Window Shell */}
          <div className="ed-stage__card p-4 sm:p-8 relative bg-[var(--ed-surface)]">
            {/* Window Bar */}
            <div className="flex items-center justify-between pb-6 border-b border-[var(--ed-line)] mb-8">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#ff5f56] inline-block" />
                <span className="size-3 rounded-full bg-[#ffbd2e] inline-block" />
                <span className="size-3 rounded-full bg-[#27c93f] inline-block" />
                <span className="ml-2 text-xs font-mono text-[var(--ed-text-3)] hidden sm:inline">
                  notinn-engine://transformation-pipeline
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-[var(--ed-text-3)]">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>ACTIVE STAGE</span>
              </div>
            </div>

            {/* Central Stage Mockup Layout (Direct from the graphic reference) */}
            <div className="relative max-w-3xl mx-auto flex flex-col gap-6">
              
              {/* TOP CARD: Voice Note Masuk (Forwarded) */}
              <div className="rounded-2xl border border-[var(--ed-line)] bg-[var(--ed-surface)] p-5 sm:p-6 shadow-md transition-all hover:shadow-lg">
                {/* Card Header */}
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--ed-line)]">
                  <div className="flex items-center gap-2.5">
                    <div className="size-2.5 rounded-full bg-blue-600" />
                    <h3 className="text-sm font-semibold tracking-tight text-[var(--ed-ink)]">
                      Voice Note Masuk (Forwarded)
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <span className="size-1.5 rounded-full bg-rose-500" />
                    PROCESSED
                  </span>
                </div>

                {/* Audio Player Row */}
                <div className="mt-5 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="size-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95"
                    aria-label={isPlaying ? "Pause audio preview" : "Play audio preview"}
                  >
                    {isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current ml-0.5" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Dense Waveform */}
                    <div className="flex items-end gap-[2.5px] h-9 px-1">
                      {[
                        35, 60, 85, 45, 95, 70, 30, 85, 100, 60, 40, 75, 90, 50, 30, 85, 70, 95,
                        60, 40, 80, 60, 30, 75, 90, 50, 65, 80, 45, 90, 65, 40, 80, 95, 50, 70, 35, 60, 85, 45
                      ].map((h, i) => {
                        const isPlayed = i < 24;
                        return (
                          <div
                            key={i}
                            className={`flex-1 rounded-xs transition-all duration-200 ${
                              isPlayed
                                ? "bg-blue-600 dark:bg-blue-500 opacity-90"
                                : "bg-[var(--ed-line)] dark:bg-[var(--ed-line)] opacity-60"
                            }`}
                            style={{ height: `${h}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-sm font-semibold text-[var(--ed-ink)]">
                      01:42:18
                    </span>
                  </div>
                </div>

                {/* Metadata Chips */}
                <div className="mt-3 flex items-center gap-3 text-[11px] font-mono text-[var(--ed-text-3)] flex-wrap">
                  <span className="bg-[var(--ed-surface-2)] px-2 py-0.5 rounded border border-[var(--ed-line)]">
                    CODEC: OPUS // 48kHz
                  </span>
                  <span className="bg-[var(--ed-surface-2)] px-2 py-0.5 rounded border border-[var(--ed-line)]">
                    SPEED: 1.5x DYNAMIC
                  </span>
                  <span className="bg-[var(--ed-surface-2)] px-2 py-0.5 rounded border border-[var(--ed-line)]">
                    INPUT: TELEGRAM FORWARD
                  </span>
                </div>

                {/* Transcript Snippet Box */}
                <div className="mt-4 p-3.5 rounded-xl bg-[var(--ed-surface-2)] border border-[var(--ed-line)]">
                  <p className="text-xs sm:text-sm text-[var(--ed-text-2)] font-mono leading-relaxed italic">
                    &ldquo;...deck review budget Q4 tolong disiapin besok sebelum jam 10 pagi ya, sekalian angka cashflow sama opsi cut cost marketing 20%...&rdquo;
                  </p>
                </div>
              </div>

              {/* FLOATING CONNECTOR BADGE */}
              <div className="relative -my-3 z-10 flex justify-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--ed-ink)] text-[var(--ed-bg)] shadow-xl border border-[var(--ed-line)] font-mono text-xs font-semibold tracking-wider uppercase">
                  <span className="text-amber-400">⚡</span>
                  <span>15s AI Synthesis</span>
                </div>
              </div>

              {/* BOTTOM CARD: Notinn Auto-Synthesis */}
              <div className="rounded-2xl border border-[var(--ed-line)] bg-[var(--ed-surface)] p-5 sm:p-6 shadow-xl transition-all hover:shadow-2xl">
                {/* Card Header */}
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--ed-line)]">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-semibold tracking-tight text-[var(--ed-ink)]">
                      Notinn Auto-Synthesis
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    SAVED TO INBOX // READY
                  </span>
                </div>

                {/* Synthesis Content / Action Items */}
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[var(--ed-text-3)] font-semibold">
                      Action Items &amp; Task Matrix
                    </span>
                    <span className="text-xs text-[var(--ed-text-3)]">
                      {Object.values(checkedTasks).filter(Boolean).length} / 3 Completed
                    </span>
                  </div>

                  {/* Task 1 */}
                  <div
                    onClick={() => toggleTask(0)}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface-2)]/60 hover:bg-[var(--ed-surface-2)] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`size-5 rounded flex items-center justify-center border transition-colors ${
                        checkedTasks[0]
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-[var(--ed-line)] bg-[var(--ed-surface)]"
                      }`}>
                        {checkedTasks[0] && <Check className="size-3.5 stroke-[3]" />}
                      </div>
                      <span className={`text-xs sm:text-sm font-medium ${
                        checkedTasks[0] ? "line-through text-[var(--ed-text-3)]" : "text-[var(--ed-ink)]"
                      }`}>
                        Siapkan slide presentasi budget Q4
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        BESOK 10:00
                      </span>
                      <span className="hidden sm:inline px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        HIGH PRIO
                      </span>
                    </div>
                  </div>

                  {/* Task 2 */}
                  <div
                    onClick={() => toggleTask(1)}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface-2)]/60 hover:bg-[var(--ed-surface-2)] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`size-5 rounded flex items-center justify-center border transition-colors ${
                        checkedTasks[1]
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-[var(--ed-line)] bg-[var(--ed-surface)]"
                      }`}>
                        {checkedTasks[1] && <Check className="size-3.5 stroke-[3]" />}
                      </div>
                      <span className={`text-xs sm:text-sm font-medium ${
                        checkedTasks[1] ? "line-through text-[var(--ed-text-3)]" : "text-[var(--ed-ink)]"
                      }`}>
                        Rekonsiliasi data pengeluaran operasional September
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        COST CUT -20%
                      </span>
                    </div>
                  </div>

                  {/* Task 3 */}
                  <div
                    onClick={() => toggleTask(2)}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface-2)]/60 hover:bg-[var(--ed-surface-2)] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`size-5 rounded flex items-center justify-center border transition-colors ${
                        checkedTasks[2]
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-[var(--ed-line)] bg-[var(--ed-surface)]"
                      }`}>
                        {checkedTasks[2] && <Check className="size-3.5 stroke-[3]" />}
                      </div>
                      <span className={`text-xs sm:text-sm font-medium ${
                        checkedTasks[2] ? "line-through text-[var(--ed-text-3)]" : "text-[var(--ed-ink)]"
                      }`}>
                        Jadwalkan sync dengan tim finance hari Kamis
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                        EST 30M
                      </span>
                    </div>
                  </div>
                </div>

                {/* Synthesis Footer Metadata */}
                <div className="mt-5 pt-4 border-t border-[var(--ed-line)] flex items-center justify-between text-[11px] font-mono text-[var(--ed-text-3)]">
                  <span>FORMAT: CORNELL SYNTHESIS</span>
                  <span>ACCURACY: 98.4%</span>
                  <a href="/notes" className="text-blue-600 hover:underline flex items-center gap-0.5 font-medium">
                    Open Reader <ChevronRight className="size-3" />
                  </a>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
