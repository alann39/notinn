import { useEffect } from "react";
import { BeforeAfter } from "@/components/landing/v2/before-after";
import { Bento } from "@/components/landing/v2/bento";
import { ClosingCta } from "@/components/landing/v2/closing-cta";
import { FloatingDock } from "@/components/landing/v2/floating-dock";
import { Footer } from "@/components/landing/v2/footer";
import { Hero } from "@/components/landing/v2/hero";
import { HowItWorks } from "@/components/landing/v2/how-it-works";
import { InputMarquee } from "@/components/landing/v2/input-marquee";
import { PricingReceipt } from "@/components/landing/v2/pricing-receipt";
import { SectionTransition } from "@/components/landing/v2/section-transition";
import { applyPageMetadata } from "@/lib/page-metadata";
import "../styles/landing-v2.css";

function focusHashTarget(): void {
  const { hash } = window.location;
  if (!hash || hash.length < 2) return;
  const id = hash.slice(1);
  const target = document.getElementById(id);
  if (!(target instanceof HTMLElement)) return;
  target.focus({ preventScroll: true });
  // Firefox and WebKit move focus back to the clicked anchor after the
  // `hashchange` handler has run, so focusing once leaves the target blurred.
  // Re-apply it after the click's default action, still without scrolling.
  window.requestAnimationFrame(() => {
    if (document.getElementById(id) === target) {
      target.focus({ preventScroll: true });
    }
  });
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
    <div className="landing-v2">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <InputMarquee />
        <HowItWorks />
        <Bento />
        <BeforeAfter />
        <SectionTransition to="pricing" />
        <PricingReceipt />
        <SectionTransition to="cta" />
        <ClosingCta />
      </main>
      <Footer />
      <FloatingDock />
    </div>
  );
}
