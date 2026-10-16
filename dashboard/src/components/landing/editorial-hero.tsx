import { useState } from "react";
import { ArrowRight, Sparkles, CheckCircle2, Bot, Smartphone } from "lucide-react";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";

export function EditorialHero() {
  const [activeTab, setActiveTab] = useState<"voice" | "chat">("voice");

  return (
    <section className="ed-hero">
      <div className="ed-shell">
        <h1 className="ed-hero__title">
          Speak messy thoughts. Read <em className="ed-title-em">academic clarity.</em>
        </h1>

        <p className="ed-hero__sub">
          A zero-friction cognitive inbox on Telegram and Web. Speak freely or forward raw messages;
          Notinn synthesizes the chaos into structured Cornell notes.
        </p>

        <div className="ed-hero__actions">
          <a
            href="https://t.me/notinnbot"
            target="_blank"
            rel="noopener noreferrer"
            className="ed-btn ed-btn--primary"
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

        <div className="ed-hero__meta">
          <span>Free to capture</span>
          <span className="ed-hero__meta-dot">·</span>
          <span>45 MB audio ceiling</span>
          <span className="ed-hero__meta-dot">·</span>
          <span>Screen Wake Lock</span>
          <span className="ed-hero__meta-dot">·</span>
          <span>Cornell format</span>
          <span className="ed-hero__meta-dot">·</span>
          <span>No app install</span>
        </div>

        {/* Floating Tiles + Interactive Stage */}
        <div className="ed-stage">
          {/* Floating Pill Badges around the stage */}
          <div className="hidden lg:flex justify-between items-center px-6 -mb-5 relative z-10 pointer-events-none">
            <div className="ed-tile" style={{ animationDelay: "0s" }}>
              <span className="size-2 rounded-full bg-pink-500" />
              <span>Voice Memo · 04:12</span>
            </div>
            <div className="ed-tile" style={{ animationDelay: "1.2s" }}>
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>Cornell Synthesis · Ready</span>
            </div>
            <div className="ed-tile" style={{ animationDelay: "0.6s" }}>
              <span className="size-2 rounded-full bg-blue-500" />
              <span>Telegram Forward · 2.8k words</span>
            </div>
          </div>

          <div className="ed-stage__card">
            {/* Stage Window Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--ed-line)] bg-[var(--ed-surface-2)]">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#ff5f57]/80 inline-block" />
                <span className="size-3 rounded-full bg-[#febc2e]/80 inline-block" />
                <span className="size-3 rounded-full bg-[#28c840]/80 inline-block" />
                <span className="text-[12px] font-mono text-[var(--ed-text-3)] ml-2">
                  notinn-engine://transform
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-[var(--ed-surface)] p-1 rounded-full border border-[var(--ed-line)]">
                <button
                  type="button"
                  onClick={() => setActiveTab("voice")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    activeTab === "voice"
                      ? "bg-[var(--ed-ink)] text-[var(--ed-bg)] shadow-xs"
                      : "text-[var(--ed-text-2)] hover:text-[var(--ed-ink)]"
                  }`}
                >
                  Voice Note
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("chat")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    activeTab === "chat"
                      ? "bg-[var(--ed-ink)] text-[var(--ed-bg)] shadow-xs"
                      : "text-[var(--ed-text-2)] hover:text-[var(--ed-ink)]"
                  }`}
                >
                  Messy Chat
                </button>
              </div>
            </div>

            {/* Stage Body: Split Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--ed-line)]">
              {/* Left Column: Raw Input */}
              <div className="lg:col-span-5 p-6 flex flex-col justify-between bg-[var(--ed-bg-subtle)]/40">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-[var(--ed-text-3)] mb-4">
                    <span className="uppercase tracking-wider font-semibold">01 Raw Ingestion</span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Stream
                    </span>
                  </div>

                  {activeTab === "voice" ? (
                    <div className="rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface)] p-5">
                      <div className="flex items-center gap-4">
                        <div className="relative size-12 shrink-0 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                          <ThinkingOrb size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono text-[var(--ed-text-3)]">voice_note_1016.ogg</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-[var(--ed-ink)]">02:14 / 45:00</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
                              Wake Lock Active
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Synthetic audio waveform */}
                      <div className="mt-4 flex items-end gap-[3px] h-9 px-1 py-1 rounded-md bg-[var(--ed-surface-2)]">
                        {[40, 65, 80, 45, 95, 70, 30, 85, 100, 60, 40, 75, 90, 50, 30, 85, 70, 95, 60, 40, 80, 60, 30, 75, 90, 50, 65, 80, 45].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-[var(--ed-ink)] opacity-70 rounded-xs transition-all duration-300"
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>

                      <p className="text-xs text-[var(--ed-text-2)] italic mt-3 line-clamp-2">
                        &ldquo;...jadi waktu rekam di HP, kita mau screen wake lock aktif biar audionya gak kepotong pas layar mati, terus langsung pecah ke cues...&rdquo;
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface)] p-5">
                      <div className="flex items-center gap-2 text-xs font-mono text-[var(--ed-text-3)] mb-2">
                        <Smartphone className="size-3.5" />
                        <span>Telegram Forward</span>
                      </div>
                      <p className="text-xs text-[var(--ed-text-2)] font-mono leading-relaxed bg-[var(--ed-surface-2)] p-3 rounded-lg border border-[var(--ed-line)]">
                        &quot;Bro meeting tadi intinya kita cut Vercel 4.5MB pake multipart upload. DB schema udah migrate. Jangan lupa update router preview bypass auth.&quot;
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--ed-line)] text-xs text-[var(--ed-text-3)] flex items-center justify-between">
                  <span>Engine: Gemini 2.5 Flash</span>
                  <span className="font-mono">Pipelined TUS · 0ms delay</span>
                </div>
              </div>

              {/* Right Column: Cornell Output */}
              <div className="lg:col-span-7 p-6 bg-[var(--ed-surface)]">
                <div className="flex items-center justify-between text-xs font-mono text-[var(--ed-text-3)] mb-4">
                  <span className="uppercase tracking-wider font-semibold">02 Cornell Synthesis</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Sparkles className="size-3" />
                    Tidy Note
                  </span>
                </div>

                <div className="space-y-4">
                  <h3 className="font-serif italic text-xl font-semibold text-[var(--ed-ink)]">
                    Audio Pipeline Architecture &amp; Mobile Recording Fixes
                  </h3>

                  {/* Cornell 2-column strip */}
                  <div className="grid grid-cols-12 gap-3 p-4 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-surface-2)] text-xs">
                    {/* Left: Cues */}
                    <div className="col-span-4 border-r border-[var(--ed-line)] pr-3 space-y-2 font-mono text-[var(--ed-text-3)]">
                      <p className="font-semibold text-[var(--ed-ink)] uppercase text-[10px] tracking-wider">Cues &amp; Themes</p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">1. Vercel 4.5MB Ceiling</p>
                      <p className="text-[11px] text-blue-600 dark:text-blue-400">2. Screen Lock Protection</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">3. Master-Detail Density</p>
                    </div>

                    {/* Right: Notes */}
                    <div className="col-span-8 pl-1 space-y-2 text-[var(--ed-text-2)]">
                      <p className="font-semibold text-[var(--ed-ink)] uppercase text-[10px] tracking-wider font-mono">Synthesized Notes</p>
                      <p className="line-clamp-2">
                        Bypass payload limits using client-side multipart chunking directly to Supabase storage signed URLs.
                      </p>
                      <p className="line-clamp-2">
                        Screen Wake Lock API prevents mobile OS background sleep during extended recordings.
                      </p>
                    </div>
                  </div>

                  {/* Action Items List */}
                  <div className="rounded-xl border border-[var(--ed-line)] p-3 bg-[var(--ed-surface)]">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ed-text-3)] mb-2 font-semibold">
                      Extracted Action Items
                    </p>
                    <div className="space-y-1.5 text-xs text-[var(--ed-ink)]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="line-through text-[var(--ed-text-3)]">Apply database migration 20261015142751</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="size-3.5 rounded-full border border-[var(--ed-line)] shrink-0 bg-[var(--ed-surface-2)]" />
                        <span>Deploy preview branch and verify Zen mode reading</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
