"use client";

import React, { useState } from "react";
import { Mic, ArrowRight, Sparkles, CheckCircle2, Play, Bot } from "lucide-react";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function TransformationProof(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<"audio" | "text">("audio");

  return (
    <section className="relative w-full border-t border-border/60 bg-background/50 py-24 sm:py-32 backdrop-blur-sm" id="transformation-proof">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="gap-1.5 border-border/80 px-3 py-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3 text-amber-500" />
            Zero-Friction Ingestion
          </Badge>
          <h2 className="mt-4 font-serif text-3xl font-light tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            From fragmented rambling to <span className="italic">editorial clarity</span>.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Record messy voice memos on mobile or forward raw thoughts in Telegram. Notinn extracts facts, schedules, and actionable Cornell summaries instantly.
          </p>

          {/* Toggle Tab */}
          <div className="mt-8 inline-flex items-center rounded-full border border-border/80 bg-muted/40 p-1">
            <button
              onClick={() => setActiveTab("audio")}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all sm:text-sm",
                activeTab === "audio"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Mic className="size-3.5" />
              Voice Recording (38s)
            </button>
            <button
              onClick={() => setActiveTab("text")}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all sm:text-sm",
                activeTab === "text"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bot className="size-3.5" />
              Telegram Chat Forward
            </button>
          </div>
        </div>

        {/* Transformation Arena (Side by Side) */}
        <div className="mt-14 grid gap-8 lg:grid-cols-12 lg:items-center">
          
          {/* LEFT: Raw Input (Messy Reality) */}
          <div className="relative rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm backdrop-blur lg:col-span-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <span className="font-mono text-xs font-medium tracking-tight text-muted-foreground">
                INPUT SOURCE: {activeTab === "audio" ? "DIRECT MIC / MOBILE WEB" : "TELEGRAM VOICE & TEXT"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                Raw Unstructured
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {activeTab === "audio" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Play className="size-4 fill-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">memo_2026_10_16_1420.webm</p>
                        <p className="text-[11px] text-muted-foreground">00:38 • 44.1 kHz • Safari Voice Memo</p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-medium text-muted-foreground">1.2 MB</span>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-background/50 p-4">
                    <p className="font-mono text-xs leading-relaxed text-muted-foreground/90 italic">
                      "Eh ini besok jam 2 siang ada evaluasi mingguan sama tim produk. Tolong siapin audit log Vercel sama Supabase, terus jangan lupa kirim draft invoice Q4 ke Mas Budi sebelum jam 5 sore. Oh ya satu lagi, fitur voice note kita fix pakai thinking orb ya."
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted/60 p-3.5 text-xs leading-relaxed text-foreground/90">
                    <p>
                      Halo bro, besok kita ketemu jam 14:00 buat review arsitektur Notinn ya. Jangan lupa bawa data migration supabase sama dokumen spec kemarin.
                    </p>
                    <span className="mt-1 block text-right font-mono text-[10px] text-muted-foreground">10:14 AM ✓✓</span>
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted/60 p-3.5 text-xs leading-relaxed text-foreground/90">
                    <p>
                      Invoice konsultan bulan ini udah lo forward belum? Deadline-nya besok sore jam 17:00 lho.
                    </p>
                    <span className="mt-1 block text-right font-mono text-[10px] text-muted-foreground">10:15 AM ✓✓</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/40 text-[11px] text-muted-foreground">
              <span>Latency: ~1.4s</span>
              <span>Gemini 2.5 Flash + Whisper</span>
            </div>
          </div>

          {/* MIDDLE: Orb Pipeline Bridge */}
          <div className="flex flex-col items-center justify-center lg:col-span-2">
            <div className="relative flex flex-col items-center gap-2">
              <div className="flex size-14 items-center justify-center rounded-full border border-border/80 bg-background shadow-lg">
                <ThinkingOrb state="composing" size={20} theme="dark" />
              </div>
              <span className="font-mono text-[11px] font-medium tracking-tight text-muted-foreground">
                Structuring...
              </span>
            </div>
          </div>

          {/* RIGHT: Structured Editorial Output (The Cornell Result) */}
          <div className="relative rounded-2xl border border-border/90 bg-card p-6 shadow-xl lg:col-span-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-primary">
                NOTINN STRUCTURED NOTE
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3 text-emerald-500" />
                Cornell Verified
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  MEETING & TASK
                </span>
                <h3 className="mt-1 font-serif text-lg font-semibold text-foreground sm:text-xl">
                  Evaluasi Mingguan Produk & Deadline Invoice Q4
                </h3>
              </div>

              {/* Cornell 2-column preview */}
              <div className="grid grid-cols-12 gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5 text-xs">
                <div className="col-span-4 border-r border-border/60 pr-2 space-y-2">
                  <span className="block font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                    Cues / Agenda
                  </span>
                  <ul className="space-y-1.5 text-[11px] font-medium text-foreground/80">
                    <li>• Review Sistem</li>
                    <li>• Audit Logs</li>
                    <li>• Billing Q4</li>
                  </ul>
                </div>
                <div className="col-span-8 pl-1 space-y-2">
                  <span className="block font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                    Synthesis Notes
                  </span>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Diskusi operasional berkala terkait evaluasi infrastruktur Vercel dan sinkronisasi Supabase. Pembayaran Q4 diprioritaskan sebelum penutupan jam kantor.
                  </p>
                </div>
              </div>

              {/* Action Items List */}
              <div className="space-y-2 pt-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Action Items (Extracted)
                </span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 p-2 text-xs">
                    <div className="size-3.5 rounded-full border border-primary/40 bg-primary/10" />
                    <span className="flex-1 font-medium text-foreground">Siapkan audit log Vercel & Supabase</span>
                    <span className="font-mono text-[10px] text-muted-foreground">Besok 14:00</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 p-2 text-xs">
                    <div className="size-3.5 rounded-full border border-primary/40 bg-primary/10" />
                    <span className="flex-1 font-medium text-foreground">Kirim draft invoice Q4 ke Mas Budi</span>
                    <span className="font-mono text-[10px] text-amber-500 font-medium">Besok 17:00</span>
                  </div>
                </div>
              </div>

            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4 text-[11px] text-muted-foreground">
              <span>Format: Cornell + Actionables</span>
              <a href="/notes" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                View in Dashboard <ArrowRight className="size-3" />
              </a>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
