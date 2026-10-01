import { useEffect, useState } from "react";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { renderLegalHtml } from "@/content/legal-content";
import { applyPageMetadata } from "@/lib/page-metadata";
import "../styles/landing.css";

function LegalShell({
  pageTitle,
  description,
  source,
}: {
  pageTitle: string;
  description: string;
  source: "privacy" | "terms";
}): React.ReactElement {
  const [html, setHtml] = useState("");

  useEffect(() => {
    applyPageMetadata({ lang: "en", robots: "noindex, nofollow" });
    setHtml(renderLegalHtml(source));
  }, [source]);

  return (
    <div className="landing-theme">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <LandingHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="landing-section" aria-labelledby="legal-title">
          <div className="landing-container">
            <h1 id="legal-title">{pageTitle}</h1>
            <p>{description}</p>
            <div
              className="landing-legal-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <p>
              <a className="landing-secondary-link" href="/">
                Back to Notinn home
              </a>
            </p>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}

export function PrivacyPage(): React.ReactElement {
  return (
    <LegalShell
      pageTitle="Notinn privacy notice"
      description="How Notinn handles Telegram content, AI processing, retention, and deletion."
      source="privacy"
    />
  );
}

export function TermsPage(): React.ReactElement {
  return (
    <LegalShell
      pageTitle="Notinn Closed Alpha terms"
      description="Closed Alpha eligibility, AI limits, fair use, and deletion rules."
      source="terms"
    />
  );
}
