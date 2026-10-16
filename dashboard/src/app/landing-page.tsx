import { useEffect } from "react";
import { EditorialNav } from "@/components/landing/editorial-nav";
import { EditorialHero } from "@/components/landing/editorial-hero";
import { EditorialBento } from "@/components/landing/editorial-bento";
import { EditorialSteps } from "@/components/landing/editorial-steps";
import { EditorialPricing } from "@/components/landing/editorial-pricing";
import { EditorialFaq } from "@/components/landing/editorial-faq";
import { EditorialFooter } from "@/components/landing/editorial-footer";
import { applyPageMetadata } from "@/lib/page-metadata";
import "../styles/editorial-landing.css";

export function LandingPage(): React.ReactElement {
  useEffect(() => {
    applyPageMetadata({
      lang: "en",
      robots: "index, follow",
    });
  }, []);

  return (
    <div className="ed-page min-h-screen">
      <a className="sr-only focus:not-sr-only focus:p-4 focus:bg-white focus:text-black z-50 fixed top-2 left-2" href="#main-content">
        Skip to main content
      </a>
      <EditorialNav />
      <main id="main-content" tabIndex={-1}>
        <EditorialHero />
        <EditorialBento />
        <EditorialSteps />
        <EditorialPricing />
        <EditorialFaq />
      </main>
      <EditorialFooter />
    </div>
  );
}
