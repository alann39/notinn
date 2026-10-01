import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ArrowRight } from "lucide-react";
import { HeroThemeToggle } from "@/components/ui/hero-theme-toggle";
import { LANDING_CONTENT, TELEGRAM_URL } from "@/content/landing.id";

/** Decorative stagger; the heading remains readable in server-rendered HTML. */
function WordsPullUp({ text }: { text: string }): React.ReactElement {
  return (
    <span className="prisma-hero-words">
      {text.split(" ").map((word, index) => (
        <span className="prisma-hero-word" key={`${word}-${index}`}>
          {word}
        </span>
      ))}
    </span>
  );
}

type HeroTheme = "light" | "dark";

export function PrismaHero(): React.ReactElement {
  // Local-only hero theme: no localStorage, no coupling to the dashboard theme.
  const [theme, setTheme] = useState<HeroTheme>("light");
  const lightRef = useRef<HTMLVideoElement>(null);
  const darkRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const updatePlayback = () => {
      const active = theme === "light" ? lightRef.current : darkRef.current;
      const inactive = theme === "light" ? darkRef.current : lightRef.current;
      if (preference.matches) {
        active?.pause();
        inactive?.pause();
        return;
      }
      if (active) void active.play().catch(() => {});
      // Park the outgoing clip after the crossfade so only one video decodes.
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        inactive?.pause();
      }, 750);
    };
    updatePlayback();
    preference.addEventListener("change", updatePlayback);
    return () => {
      preference.removeEventListener("change", updatePlayback);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [theme]);

  useEffect(
    () => () => {
      lightRef.current?.pause();
      darkRef.current?.pause();
    },
    [],
  );

  const toggleTheme = async () => {
    const next: HeroTheme = theme === "light" ? "dark" : "light";
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const target = next === "light" ? lightRef.current : darkRef.current;
      if (target) {
        try {
          await target.play();
        } catch {
          // Autoplay refused; the frame background covers the gap.
        }
      }
    }
    setTheme(next);
  };

  const markReady = (event: SyntheticEvent<HTMLVideoElement>) => {
    event.currentTarget.dataset.ready = "true";
  };

  const isDark = theme === "dark";

  return (
    <section className="prisma-hero" id="atas" aria-labelledby="landing-title">
      <div className="prisma-hero-frame" data-hero-theme={theme}>
        <video
          ref={lightRef}
          className="prisma-hero-video"
          data-theme="light"
          data-active={theme === "light"}
          src="/landing/hero-bg-light.mp4"
          preload={theme === "light" ? "auto" : "metadata"}
          muted
          loop
          playsInline
          aria-hidden="true"
          onLoadedData={markReady}
        />
        <video
          ref={darkRef}
          className="prisma-hero-video"
          data-theme="dark"
          data-active={theme === "dark"}
          src="/landing/hero-bg-dark.mp4"
          preload={theme === "dark" ? "auto" : "metadata"}
          muted
          loop
          playsInline
          aria-hidden="true"
          onLoadedData={markReady}
        />
        <div className="prisma-hero-scrim" aria-hidden="true" />
        <div className="prisma-hero-noise" aria-hidden="true" />
        <HeroThemeToggle
          checked={isDark}
          onToggle={() => void toggleTheme()}
          className="absolute top-4 right-4 z-[5]"
        />
        <div className="prisma-hero-content">
          <p className="prisma-hero-overline">Just say, Noted!</p>
          <div className="prisma-hero-grid">
            <div className="prisma-hero-identity">
              <h1 id="landing-title">
                <WordsPullUp text="Notinn" />
                <span className="prisma-hero-asterisk" aria-hidden="true">
                  ✳
                </span>
              </h1>
            </div>
            <div className="prisma-hero-intro">
              <p className="prisma-hero-tagline">{LANDING_CONTENT.heroTitle}</p>
              <p className="prisma-hero-description">
                {LANDING_CONTENT.heroBody}
              </p>
              <div className="prisma-hero-actions">
                <a
                  className="prisma-hero-cta group/sliding"
                  href={TELEGRAM_URL}
                  rel="noopener noreferrer"
                >
                  <span className="prisma-hero-cta-label">{LANDING_CONTENT.primaryCta}</span>
                  <ArrowRight className="prisma-hero-cta-icon" size={18} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
