import { useEffect } from "react";
import { LandingFloatingMenu } from "@/components/landing/landing-floating-menu";
import { LandingMarquee } from "@/components/landing/landing-marquee";
import { PrismaHero } from "@/components/ui/prisma-hero";
import { DashboardShowoff } from "@/components/ui/hero-05";
import { FeaturesSection } from "@/components/ui/feature";
import { HowItWorks } from "@/components/ui/how-it-works";
import { Comparison03 } from "@/components/ui/comparison-03";
import { Pricing } from "@/components/ui/pricing-1";
import { CinematicFooter } from "@/components/ui/motion-footer";
import { applyPageMetadata } from "@/lib/page-metadata";
import "../styles/landing.css";
import "../styles/prisma-hero.css";

function focusHashTarget(): void {
  const { hash } = window.location;
  if (!hash || hash.length < 2) return;
  const target = document.getElementById(hash.slice(1));
  if (!(target instanceof HTMLElement)) return;
  target.focus({ preventScroll: true });
}

export function LandingPage(): React.ReactElement {
  useEffect(() => {
    applyPageMetadata({ lang: "en", robots: "noindex, nofollow" });
    focusHashTarget();
    window.addEventListener("hashchange", focusHashTarget);
    return () => {
      window.removeEventListener("hashchange", focusHashTarget);
    };
  }, []);

  return (
    <div className="landing-theme landing-home">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <LandingFloatingMenu />
      <main id="main-content" tabIndex={-1}>
        <PrismaHero />
        <LandingMarquee />
        <DashboardShowoff />
        <FeaturesSection />
        <HowItWorks />
        <Comparison03 />
        <Pricing />
      </main>
      <CinematicFooter />
    </div>
  );
}
