import { Mic, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

export function EditorialShowcase() {
  return (
    <section id="showcase" className="py-20 border-t border-[var(--ed-line)]">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ed-ink)]">
            From chaotic ramble to clarity, <br />
            <em>in about 15 seconds.</em>
          </h2>
          <p className="mt-4 text-base text-[var(--ed-text-2)]">
            Three real situations where typing is impossible, but forgetting is expensive.
          </p>
        </div>

        {/* Story 1: Brainstorm Walk */}
        <div className="ed-show">
          <div className="ed-show__copy">
            <span className="ed-show__eyebrow">Voice Capture</span>
            <h3 className="ed-show__title">
              Talk in circles while walking. Notinn delivers 3 clear tasks before you get home.
            </h3>
            <p className="ed-show__desc">
              Built-in voice recorders leave you with a 10-minute audio file you will never re-listen to. 
              Notinn strips the filler words, isolates every commitment you made out loud, and formats them 
              into an actionable task matrix.
            </p>
            <ul className="ed-show__list">
              <li>
                <strong>No transcription fatigue.</strong> Skip reading 2,000 words of messy stream of consciousness.
              </li>
              <li>
                <strong>Auto-detected urgency.</strong> Deadlines like &ldquo;tomorrow 10:00&rdquo; or &ldquo;budget cut -20%&rdquo; become highlighted tags.
              </li>
              <li>
                <strong>One-tap completion.</strong> Check off tasks right inside the web reader or forward to your todo app.
              </li>
            </ul>
          </div>

          <div className="ed-show__media p-6 sm:p-8 bg-[var(--ed-surface-2)]">
            <div className="rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-[var(--ed-text-3)] pb-3 border-b border-[var(--ed-line)]">
                <span className="flex items-center gap-1.5 text-blue-600 font-semibold">
                  <Mic className="size-3.5" /> VOICE MEMO · 08:45
                </span>
                <span className="text-emerald-700 font-medium">SYNTHESIZED</span>
              </div>
              <p className="text-xs font-mono italic text-[var(--ed-text-2)] bg-[var(--ed-surface-2)] p-3 rounded-lg">
                &ldquo;...lagi jalan kepikiran soal user feedback kemarin, onboarding kepanjangan, kita harus cut jadi 2 step aja, terus fix typo di pricing page sebelum launch hari Senin...&rdquo;
              </p>
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-surface)]">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-medium text-[var(--ed-ink)]">Pangkas flow onboarding jadi 2 langkah</span>
                  <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-800 font-semibold">P0 PRIO</span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-surface)]">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-medium text-[var(--ed-ink)]">Koreksi copy pricing page sebelum rilis</span>
                  <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-800 font-semibold">SENIN</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Story 2: Forwarded Audio (Flipped) */}
        <div className="ed-show ed-show--flip">
          <div className="ed-show__copy">
            <span className="ed-show__eyebrow">Forward &amp; Read</span>
            <h3 className="ed-show__title">
              Someone sends a 3-minute voice note. Read it in 5 seconds instead of playing it out loud.
            </h3>
            <p className="ed-show__desc">
              In a crowded cafe or a quiet meeting, playing incoming audio messages is uncomfortable. 
              Forward any voice note directly to @notinnbot — in 15 seconds, you receive a concise 
              bullet-point synthesis directly in your Telegram chat.
            </p>
            <ul className="ed-show__list">
              <li>
                <strong>Zero app switching.</strong> Works with forwards from any Telegram chat or uploaded audio files.
              </li>
              <li>
                <strong>Private by architecture.</strong> Audio is processed in memory and never stored or used to train models.
              </li>
              <li>
                <strong>Bilingual intelligence.</strong> Speaks colloquial Indonesian, English, or mixed slang with zero translation loss.
              </li>
            </ul>
          </div>

          <div className="ed-show__media p-6 sm:p-8 bg-[var(--ed-surface-2)]">
            <div className="rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface)] p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono text-[var(--ed-text-3)] pb-2 border-b border-[var(--ed-line)]">
                <span className="font-semibold text-[var(--ed-ink)]">Telegram Thread</span>
                <span>·</span>
                <span>Forwarded Audio</span>
              </div>
              <div className="bg-[var(--ed-surface-2)] p-3 rounded-lg border border-[var(--ed-line)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-blue-600" />
                  <span className="text-xs font-mono text-[var(--ed-ink)]">Voice Message (02:54)</span>
                </div>
                <span className="text-xs font-mono text-[var(--ed-text-3)]">1.8 MB</span>
              </div>
              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                  <Sparkles className="size-3.5" />
                  <span>NOTINN BOT · INSTANT SUMMARY</span>
                </div>
                <ul className="text-xs text-[var(--ed-text-2)] space-y-1 pl-3.5 list-disc">
                  <li>Client setuju approval budget marketing Q4 sebesar Rp 45jt.</li>
                  <li>Draft kontrak dikirim sore ini jam 17:00 via email.</li>
                  <li>Butuh konfirmasi ketersediaan tim dev untuk kick-off Rabu.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Story 3: Multimodal Cornell */}
        <div className="ed-show">
          <div className="ed-show__copy">
            <span className="ed-show__eyebrow">Academic Structure</span>
            <h3 className="ed-show__title">
              Snap a meeting whiteboard, speak the context, get a structured Cornell note.
            </h3>
            <p className="ed-show__desc">
              Single-purpose apps force you into text-only or audio-only silos. Notinn accepts photos of slides, 
              meeting sketches, and spoken commentary together, synthesizing them into Cornell&apos;s proven 
              two-column format: Cues on the left, Notes on the right, Summary on the bottom.
            </p>
            <ul className="ed-show__list">
              <li>
                <strong>Cues &amp; Questions.</strong> Key conceptual anchors generated automatically for active recall.
              </li>
              <li>
                <strong>Instant Markdown export.</strong> Clean heading hierarchy ready to paste straight into Obsidian or Notion.
              </li>
              <li>
                <strong>Audio timeline sync.</strong> Click any section in the web reader to jump straight to that moment in the audio.
              </li>
            </ul>
          </div>

          <div className="ed-show__media p-6 sm:p-8 bg-[var(--ed-surface-2)]">
            <div className="rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--ed-line)] text-xs font-mono">
                <span className="font-semibold text-[var(--ed-ink)]">CORNELL NOTE READER</span>
                <span className="text-blue-600 font-medium flex items-center gap-1">
                  Web View <ArrowRight className="size-3" />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="col-span-1 p-2.5 rounded-lg bg-[var(--ed-surface-2)] border border-[var(--ed-line)]">
                  <span className="font-mono text-xs uppercase tracking-wider text-[var(--ed-text-3)] font-semibold block mb-1">
                    Cues / Keywords
                  </span>
                  <div className="space-y-1 font-mono text-xs text-blue-700 dark:text-blue-400">
                    <div>• Cash Runway</div>
                    <div>• Burn Rate Q4</div>
                    <div>• Breakeven Target</div>
                  </div>
                </div>
                <div className="col-span-2 p-2.5 rounded-lg bg-[var(--ed-surface-2)] border border-[var(--ed-line)]">
                  <span className="font-mono text-xs uppercase tracking-wider text-[var(--ed-text-3)] font-semibold block mb-1">
                    Notes &amp; Synthesis
                  </span>
                  <p className="text-xs text-[var(--ed-text-2)] leading-relaxed">
                    Sisa runway operasional 8 bulan dengan burn rate saat ini. Rencana efisiensi server dan optimasi model inference memangkas biaya 20%. Target breakeven Q2 tahun depan.
                  </p>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs">
                <span className="font-mono text-xs font-semibold text-blue-800 dark:text-blue-300 block mb-0.5">
                  SUMMARY
                </span>
                <p className="text-xs text-[var(--ed-text-2)]">
                  Fokus Q4 adalah efisiensi operasional dan perpanjangan runway tanpa mengorbankan kecepatan ship fitur Notinn.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
