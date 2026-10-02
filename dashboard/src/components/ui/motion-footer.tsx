"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TELEGRAM_URL } from "@/content/landing.id";
import { ArrowUpRight, ArrowUp, Send, LayoutDashboard } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const MarqueeItem = () => (
  <div className="flex items-center space-x-10 px-5 shrink-0">
    <span>Knowledge Inbox</span> <span className="text-primary/40" aria-hidden="true">•</span>
    <span>Telegram Capture</span> <span className="text-primary/40" aria-hidden="true">•</span>
    <span>Instant AI Structuring</span> <span className="text-primary/40" aria-hidden="true">•</span>
    <span>Fast Web Dashboard</span> <span className="text-primary/40" aria-hidden="true">•</span>
    <span>Absolute Privacy</span> <span className="text-primary/40" aria-hidden="true">•</span>
  </div>
);

export function CinematicFooter(): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const giantTextRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
    }
    if (!wrapperRef.current) return;

    const ctx = gsap.context(() => {
      if (giantTextRef.current) {
        gsap.fromTo(
          giantTextRef.current,
          { y: "10vh", scale: 0.85, opacity: 0 },
          {
            y: "0vh",
            scale: 1,
            opacity: 1,
            ease: "power1.out",
            scrollTrigger: {
              trigger: wrapperRef.current,
              start: "top 80%",
              end: "bottom bottom",
              scrub: 1,
            },
          }
        );
      }

      if (headingRef.current && linksRef.current) {
        gsap.fromTo(
          [headingRef.current, linksRef.current],
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            stagger: 0.12,
            ease: "power3.out",
            scrollTrigger: {
              trigger: wrapperRef.current,
              start: "top 50%",
              end: "bottom bottom",
              scrub: 1,
            },
          }
        );
      }
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative min-h-[85vh] md:min-h-screen w-full overflow-hidden"
      style={{ clipPath: "polygon(0% 0, 100% 0%, 100% 100%, 0 100%)" }}
    >
      <footer
        role="contentinfo"
        className="fixed bottom-0 left-0 flex min-h-[85vh] md:min-h-screen w-full flex-col justify-between overflow-hidden bg-background text-foreground"
      >
        {/* Subtle radial aurora glow */}
        <div className="absolute left-1/2 top-1/2 h-[50vh] w-[75vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[100px] pointer-events-none z-0" />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-40 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Giant background brand watermark */}
        <div
          ref={giantTextRef}
          className="absolute -bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap z-0 pointer-events-none select-none text-[22vw] leading-none font-black tracking-tighter text-foreground/[0.03]"
        >
          NOTINN
        </div>

        {/* 1. Sleek Marquee Strip */}
        <div className="relative z-10 w-full overflow-hidden border-y border-border/40 bg-muted/30 backdrop-blur-xs py-3 mt-8">
          <div className="flex w-max animate-footer-scroll-marquee will-change-transform text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:[animation-play-state:paused]">
            <div className="flex shrink-0">
              <MarqueeItem />
              <MarqueeItem />
            </div>
            <div className="flex shrink-0" aria-hidden="true">
              <MarqueeItem />
              <MarqueeItem />
            </div>
          </div>
        </div>

        {/* 2. Main Call To Action */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 w-full max-w-4xl mx-auto text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-5">
            Get started today
          </p>

          <h2
            ref={headingRef}
            className="text-5xl sm:text-7xl md:text-8xl font-serif font-medium tracking-tight text-foreground mb-7"
          >
            Ready to begin?
          </h2>

          <p className="max-w-lg text-lg text-muted-foreground mb-10 sm:mb-12 leading-relaxed font-sans">
            Start free on Telegram with 30 notes. No downloads, no complicated setup.
          </p>

          {/* Action buttons */}
          <div ref={linksRef} className="flex flex-col items-center gap-5 w-full">
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4 w-full">
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card/60 backdrop-blur-xs px-7 py-3.5 text-sm font-medium text-foreground hover:bg-muted transition-all cursor-pointer"
              >
                <Send className="size-4" />
                <span>Open in Telegram</span>
                <ArrowUpRight className="size-4 opacity-70" />
              </a>

              <a
                href="/notes"
                className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card/60 backdrop-blur-xs px-7 py-3.5 text-sm font-medium text-foreground hover:bg-muted transition-all cursor-pointer"
              >
                <LayoutDashboard className="size-4 text-muted-foreground" />
                <span>Web Dashboard</span>
                <ArrowUpRight className="size-4 opacity-70 text-muted-foreground" />
              </a>
            </div>

            {/* Legal contract routes preserved for compliance & tests */}
            <div className="flex items-center gap-6 mt-2 text-xs text-muted-foreground">
              <a href="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              <span className="text-border">•</span>
              <a href="/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>

        {/* 3. Bottom Credits Bar */}
        <div className="relative z-20 w-full pb-6 pt-4 px-6 md:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/30 bg-background/50 backdrop-blur-xs">
          {/* Copyright */}
          <div className="text-muted-foreground text-[11px] font-mono tracking-wider uppercase order-2 sm:order-1">
            © {new Date().getFullYear()} Notinn. Knowledge inbox on Telegram.
          </div>

          {/* Badge: Notinn by Arch Labs */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground order-1 sm:order-2">
            <span>Notinn by</span>
            <span className="font-semibold text-foreground">Arch Labs</span>
          </div>

          {/* Back to top */}
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Scroll to top"
            className="size-8 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer order-3"
          >
            <ArrowUp className="size-3.5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default CinematicFooter;