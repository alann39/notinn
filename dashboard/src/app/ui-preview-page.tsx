import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  BookmarkCheck,
  Mic,
  CheckCircle2,
  ExternalLink,
  Eye,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";

export function UiPreviewPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<"cards" | "quotes" | "mobile" | "all">("all");

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <Header
        title="UI/UX Polish Preview"
        description="Showcase evaluasi design & perbaikan anti-slop Notinn"
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Banner Overview */}
        <section className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-muted/50 to-card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="size-3.5" />
                <span>UI/UX Polish Preview &middot; Branch: preview/ui-polish</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Notinn Design Refinements & Showcase
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
                Halaman preview interaktif ini mendemonstrasikan hasil evaluasi design: membuang pola generik template AI (anti-slop), meningkatkan ritme tipografi editorial, merampingkan kartu catatan, dan memperhalus visual hierarchy.
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
              <Link
                to="/"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs")}
              >
                <Eye className="size-3.5" />
                <span>Lihat Landing Page</span>
              </Link>
              <Link
                to="/notes"
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5 text-xs")}
              >
                <ExternalLink className="size-3.5" />
                <span>Buka Dashboard Notes</span>
              </Link>
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-xs">
            <span className="text-muted-foreground font-medium mr-1">Fokus Review:</span>
            {[
              { id: "all", label: "Semua Penyesuaian" },
              { id: "cards", label: "1. Note Cards (Density & Layout)" },
              { id: "quotes", label: "2. Blockquote (Anti-AI Tell)" },
              { id: "mobile", label: "3. Dual Pathway CTA" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                  activeTab === tab.id
                    ? "bg-foreground text-background shadow-xs"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {/* SECTION 1: NOTE CARDS COMPARISON */}
        {(activeTab === "all" || activeTab === "cards") && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold tracking-tight flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  Kerapatan Kartu Catatan (Information Density & Micro-typography)
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Sebelumnya kartu terlalu tebal dengan padding besar dan badge warna-warni yang mencolok. Versi baru lebih tenang, editorial, dan muat lebih banyak konteks.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* BEFORE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground px-1">
                  <span className="inline-flex items-center gap-1.5 text-amber-500 font-semibold">
                    &bull; SEBELUM (Standard Bulky Card)
                  </span>
                  <span>Padding 20px / Thick borders</span>
                </div>

                <div className="rounded-xl border border-border p-5 bg-card flex flex-col justify-between h-56 space-y-4 opacity-85">
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground border border-border">
                        <Mic className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-base font-semibold text-foreground line-clamp-1">
                            Diskusi Roadmap Q4 & Notinn Alpha Ingestion
                          </h4>
                          <span className="inline-flex items-center gap-1 text-xs text-foreground font-medium">
                            <BookmarkCheck className="size-4" />
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>audio</span>
                          <span>&middot;</span>
                          <span>2 jam yang lalu</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    Pembahasan arsitektur ingestion 45MB audio multipart, rencana deploy Vercel, serta restrukturisasi template Cornell notes...
                  </p>

                  <div className="pt-3 flex flex-wrap gap-1.5 border-t border-border">
                    <Badge variant="secondary" className="text-[10px] bg-rose-500/10 text-rose-500 border-rose-500/20">
                      #roadmap
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20">
                      #engineering
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                      #q4
                    </Badge>
                  </div>
                </div>
              </div>

              {/* AFTER */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground px-1">
                  <span className="inline-flex items-center gap-1.5 text-emerald-500 font-semibold">
                    <CheckCircle2 className="size-3.5" /> HASIL REVISI (Refined Editorial Density)
                  </span>
                  <span>Harmonious &middot; Calmer Badges</span>
                </div>

                <div className="group relative rounded-xl border border-border/70 hover:border-foreground/35 bg-card/60 backdrop-blur-xs p-4 sm:p-4.5 flex flex-col justify-between h-56 space-y-3.5 transition-all shadow-2xs hover:shadow-xs">
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5">
                      <div className="flex size-7.5 shrink-0 items-center justify-center rounded-md bg-muted/80 text-foreground/85 border border-border/60">
                        <Mic className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm sm:text-base font-semibold tracking-tight text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                            Diskusi Roadmap Q4 & Notinn Alpha Ingestion
                          </h4>
                          <span className="inline-flex items-center text-foreground/70" title="Saved note">
                            <BookmarkCheck className="size-4" />
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/80 font-mono">
                          <span className="capitalize text-foreground/70">audio</span>
                          <span>&middot;</span>
                          <span>2 jam yang lalu</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs sm:text-[13px] text-muted-foreground line-clamp-2 leading-relaxed font-sans">
                    Pembahasan arsitektur ingestion 45MB audio multipart, rencana deploy Vercel, serta restrukturisasi template Cornell notes...
                  </p>

                  <div className="pt-2.5 flex items-center justify-between border-t border-border/40 text-[10px]">
                    <div className="flex flex-wrap gap-1">
                      {["roadmap", "engineering", "q4"].map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground/90 font-medium hover:bg-muted transition-colors"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-muted-foreground/60 font-mono">Cornell Note</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 2: BLOCKQUOTE COMPARISON (AI TELL FIX) */}
        {(activeTab === "all" || activeTab === "quotes") && (
          <section className="space-y-4 pt-4 border-t border-border/60">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                Editorial Reader & Quote Style (Pembersihan AI-Tell)
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Pola border samping tebal (<code>border-l-2</code>) adalah ciri khas template bawaan AI. Kita ganti dengan hairline quote tipis dan latar warm yang menyatu dengan tone Newsreader/Inter.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* BEFORE QUOTE */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-amber-500 font-semibold px-1">
                  &bull; SEBELUM: Thick Border AI Default
                </div>
                <div className="rounded-xl border border-border p-5 bg-card space-y-3 font-sans text-sm">
                  <p className="text-muted-foreground">
                    Berikut poin kunci dari notula meeting:
                  </p>
                  <blockquote className="border-l-2 border-border pl-3 italic text-foreground/90">
                    &ldquo;Fokus utama Notinn adalah kecepatan mencatat tanpa gesekan. Telegram sebagai gerbang masuk, web sebagai ruang baca dan pengorganisasian.&rdquo;
                  </blockquote>
                  <p className="text-xs text-muted-foreground/70">
                    Terlihat kaku seperti komponen markdown generik.
                  </p>
                </div>
              </div>

              {/* AFTER QUOTE */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-emerald-500 font-semibold px-1 flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" /> HASIL REVISI: Hairline Editorial Quote
                </div>
                <div className="rounded-xl border border-border/70 bg-card p-5 space-y-3 font-sans text-sm">
                  <p className="text-muted-foreground">
                    Berikut poin kunci dari notula meeting:
                  </p>
                  <blockquote className="border-l border-foreground/30 pl-4 py-1.5 italic text-foreground/85 bg-muted/20 rounded-r-md">
                    &ldquo;Fokus utama Notinn adalah kecepatan mencatat tanpa gesekan. Telegram sebagai gerbang masuk, web sebagai ruang baca dan pengorganisasian.&rdquo;
                  </blockquote>
                  <p className="text-xs text-muted-foreground/70">
                    Garis halus, latar hangat subtle, ritme baca terasa seperti majalah/editorial buku.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3: LANDING PAGE CTA & MARQUEE HARMONY */}
        {(activeTab === "all" || activeTab === "mobile") && (
          <section className="space-y-4 pt-4 border-t border-border/60">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                Landing Page CTA Pathway & Asymmetry
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Pengunjung landing page di desktop/web seringkali ingin langsung mencoba Web App tanpa harus membuka Telegram terlebih dahulu. Kita berikan secondary pathway yang bersih.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 p-6 sm:p-8 bg-gradient-to-r from-card to-muted/30 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 max-w-lg">
                <div className="text-xs font-medium text-primary">Clear Dual Pathway</div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
                  Turn scattered input into usable notes.
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Buka Notinn langsung via Telegram Bot untuk input instan, atau buka Web Dashboard untuk membaca catatan terstruktur lo kapan saja.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto gap-2 rounded-xl shadow-xs">
                  <span>Open Notinn in Telegram</span>
                  <ArrowRight className="size-4" />
                </Button>
                <Link
                  to="/notes"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto rounded-xl")}
                >
                  <span>Open Dashboard</span>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Action Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Branch preview ini siap di-push ke GitHub untuk menghasilkan Vercel Preview URL.</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/notes"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              Lanjut Buka Notes
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
