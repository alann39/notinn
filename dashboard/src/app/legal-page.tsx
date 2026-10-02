import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  Layers,
  LayoutDashboard,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { LandingFooter } from "@/components/landing/landing-footer";
import { getLegalContent, type LegalTocItem } from "@/content/legal-content";
import { applyPageMetadata } from "@/lib/page-metadata";
import { cn } from "@/lib/utils";
import "../styles/landing.css";

interface LegalShellProps {
  pageTitle: string;
  description: string;
  source: "privacy" | "terms";
}

function LegalShell({
  pageTitle,
  description,
  source,
}: LegalShellProps): React.ReactElement {
  const [html, setHtml] = useState("");
  const [toc, setToc] = useState<LegalTocItem[]>([]);
  const [lastReviewed, setLastReviewed] = useState("October 2, 2026");
  const [activeId, setActiveId] = useState<string>("");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  useEffect(() => {
    applyPageMetadata({ lang: "en", robots: "noindex, nofollow" });
    const content = getLegalContent(source);
    setHtml(content.html);
    setToc(content.toc);
    setLastReviewed(content.lastReviewed);
    if (content.toc.length > 0) {
      setActiveId(content.toc[0].id);
    }
  }, [source]);

  // Handle URL hash on initial load or change
  useEffect(() => {
    if (!html) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        const timer = setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth" });
          setActiveId(hash);
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [html]);

  // Track active section via IntersectionObserver
  useEffect(() => {
    if (toc.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find visible section closest to the top
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by top offset to pick topmost visible heading
          visibleEntries.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-90px 0px -65% 0px",
        threshold: [0, 0.2, 0.5],
      },
    );

    for (const item of toc) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [toc]);

  const handleJumpToSection = (id: string) => {
    setActiveId(id);
    setMobileTocOpen(false);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      window.history.pushState(null, "", `#${id}`);
    }
  };

  return (
    <div className="landing-theme min-h-screen flex flex-col bg-[var(--paper-100)] text-[var(--ink-950)] selection:bg-[var(--highlight-400)]/30">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>


      <main id="main-content" tabIndex={-1} className="flex-1">
        <section className="pt-8 pb-16 sm:pb-24" aria-labelledby="legal-title">
          <div className="landing-container">
            {/* Header Breadcrumbs */}
            <div className="flex items-center justify-between gap-4 pb-6 border-b border-[var(--rule-300)]/80">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono text-[var(--ink-600)]">
                <Link to="/" className="hover:text-[var(--ink-950)] transition-colors flex items-center gap-1.5 py-1 px-2 -ml-2 rounded-md hover:bg-[var(--paper-200)]/70">
                  <Home className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Home</span>
                </Link>
                <ChevronRight className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                <span>Legal</span>
                <ChevronRight className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                <span className="text-[var(--ink-950)] font-semibold" aria-current="page">
                  {source === "privacy" ? "Privacy Policy" : "Terms of Service"}
                </span>
              </nav>
            </div>

            {/* Document Switcher / Tabs */}
            <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div
                role="tablist"
                aria-label="Legal documents"
                className="inline-flex p-1 bg-[var(--paper-200)]/80 border border-[var(--rule-300)] rounded-xl w-fit"
              >
                <Link
                  to="/privacy"
                  role="tab"
                  aria-selected={source === "privacy"}
                  className={cn(
                    "px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center gap-2",
                    source === "privacy"
                      ? "bg-[var(--paper-50)] text-[var(--ink-950)] shadow-xs font-semibold"
                      : "text-[var(--ink-600)] hover:text-[var(--ink-950)] hover:bg-[var(--paper-100)]/60",
                  )}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>Privacy Policy</span>
                </Link>
                <Link
                  to="/terms"
                  role="tab"
                  aria-selected={source === "terms"}
                  className={cn(
                    "px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center gap-2",
                    source === "terms"
                      ? "bg-[var(--paper-50)] text-[var(--ink-950)] shadow-xs font-semibold"
                      : "text-[var(--ink-600)] hover:text-[var(--ink-950)] hover:bg-[var(--paper-100)]/60",
                  )}
                >
                  <FileText className="w-4 h-4 text-amber-800 shrink-0" aria-hidden="true" />
                  <span>Terms of Service</span>
                </Link>
              </div>

              {/* Last Updated Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium bg-[var(--paper-50)] text-[var(--ink-600)] border border-[var(--rule-300)] w-fit shadow-xs">
                <Calendar className="w-3.5 h-3.5 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                <span>Last updated: {lastReviewed}</span>
              </div>
            </div>

            {/* Title & Description */}
            <div className="mt-8 max-w-3xl">
              <h1
                id="legal-title"
                className="font-serif text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-[var(--ink-950)] leading-[1.12] text-balance"
              >
                {pageTitle}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-[var(--ink-600)] leading-relaxed text-pretty">
                {description}
              </p>
            </div>

            {/* Quick Summary Card */}
            <section
              aria-labelledby="summary-card-heading"
              className="mt-8 bg-[var(--paper-50)] border border-[var(--rule-300)] rounded-2xl p-5 sm:p-6 shadow-xs"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[var(--highlight-100)] text-[var(--ink-950)]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                </span>
                <p
                  id="summary-card-heading"
                  className="text-[11px] uppercase tracking-wider font-mono font-semibold text-[var(--ink-600)]"
                >
                  Quick Summary & Core Commitments
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-[var(--rule-300)]/70">
                {/* Pillar 1 */}
                <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-[var(--paper-100)]/60 border border-[var(--rule-300)]/60">
                  <div className="flex items-center gap-2 text-[var(--ink-950)] font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span>Full Ownership</span>
                  </div>
                  <p className="text-xs text-[var(--ink-600)] leading-relaxed">
                    You retain 100% intellectual property ownership over your notes, transcripts, audio recordings, and documents. Notinn claims zero copyright.
                  </p>
                </div>

                {/* Pillar 2 */}
                <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-[var(--paper-100)]/60 border border-[var(--rule-300)]/60">
                  <div className="flex items-center gap-2 text-[var(--ink-950)] font-semibold text-sm">
                    <Lock className="w-4 h-4 text-indigo-700 shrink-0" aria-hidden="true" />
                    <span>No AI Model Training</span>
                  </div>
                  <p className="text-xs text-[var(--ink-600)] leading-relaxed">
                    Your personal notes and audio are strictly confidential. We never use, share, or sell your content to train foundational AI models.
                  </p>
                </div>

                {/* Pillar 3 */}
                <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-[var(--paper-100)]/60 border border-[var(--rule-300)]/60">
                  <div className="flex items-center gap-2 text-[var(--ink-950)] font-semibold text-sm">
                    <Scale className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                    <span>Fair Limits & Deletion</span>
                  </div>
                  <p className="text-xs text-[var(--ink-600)] leading-relaxed">
                    Universal 45 MB audio upload limit, clear Free vs Pro allowances, and a 7-day grace period for complete, permanent account deletion.
                  </p>
                </div>
              </div>
            </section>

            {/* Mobile Collapsible TOC */}
            {toc.length > 0 && (
              <div className="mt-8 lg:hidden">
                <div className="bg-[var(--paper-50)] border border-[var(--rule-300)] rounded-xl overflow-hidden shadow-xs">
                  <button
                    type="button"
                    onClick={() => setMobileTocOpen((prev) => !prev)}
                    aria-expanded={mobileTocOpen}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left text-sm font-medium text-[var(--ink-950)] hover:bg-[var(--paper-100)]/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-600)]">
                      <Layers className="w-4 h-4 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                      Table of Contents ({toc.length} sections)
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-[var(--ink-600)] transition-transform duration-200",
                        mobileTocOpen && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>

                  {mobileTocOpen && (
                    <nav
                      aria-label="Mobile table of contents"
                      className="px-4 pb-4 pt-2 border-t border-[var(--rule-300)]/60"
                    >
                      <ul className="space-y-1">
                        {toc.map((item) => (
                          <li key={item.id}>
                            <a
                              href={`#${item.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                handleJumpToSection(item.id);
                              }}
                              className={cn(
                                "block px-2.5 py-1.5 rounded-md transition-colors",
                                item.level === 3 ? "pl-4 text-xs text-[var(--ink-500)]" : "text-[13px] font-medium",
                                activeId === item.id
                                  ? "bg-[var(--paper-200)] font-semibold text-[var(--ink-950)]"
                                  : "text-[var(--ink-600)] hover:text-[var(--ink-950)] hover:bg-[var(--paper-100)]",
                              )}
                            >
                              {item.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  )}
                </div>
              </div>
            )}

            {/* Responsive Main Layout: Prose + Sticky TOC */}
            <div className="mt-10 lg:grid lg:grid-cols-[1fr_260px] xl:grid-cols-[1fr_280px] lg:gap-12 items-start">
              {/* Main Prose Content */}
              <div className="min-w-0">
                <article
                  className="landing-legal-body max-w-3xl text-justify"
                  dangerouslySetInnerHTML={{ __html: html }}
                />

                {/* Footer Navigation Card */}
                <section
                  aria-labelledby="legal-footer-nav-title"
                  className="mt-16 pt-8 border-t border-[var(--rule-300)] max-w-3xl"
                >
                  <div className="bg-[var(--paper-50)] border border-[var(--rule-300)] rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                    <div>
                      <h3
                        id="legal-footer-nav-title"
                        className="font-serif text-lg sm:text-xl font-medium text-[var(--ink-950)]"
                      >
                        Questions or privacy inquiries?
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--ink-600)] mt-1.5 max-w-md leading-relaxed">
                        Read our companion {source === "privacy" ? "Terms of Service" : "Privacy Policy"} or jump straight into your notes dashboard.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto">
                      <Link
                        to={source === "privacy" ? "/terms" : "/privacy"}
                        className="landing-legal-button-outline px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border border-[var(--rule-300)] bg-[var(--paper-100)] hover:bg-[var(--paper-200)] text-[var(--ink-950)] transition-colors"
                      >
                        View {source === "privacy" ? "Terms of Service" : "Privacy Policy"}
                      </Link>
                      <Link
                        to="/notes"
                        className="landing-legal-button-primary px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg bg-[#11110f] !text-[#ffffff] hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-xs"
                        style={{ color: "#ffffff", backgroundColor: "#11110f" }}
                      >
                        <LayoutDashboard className="w-3.5 h-3.5 text-white shrink-0" aria-hidden="true" style={{ color: "#ffffff" }} />
                        <span className="text-white" style={{ color: "#ffffff" }}>Go to Dashboard</span>
                      </Link>
                    </div>
                  </div>
                </section>
              </div>

              {/* Desktop Sticky Sidebar TOC */}
              {toc.length > 0 && (
                <aside
                  className="hidden lg:block sticky top-24 max-h-[calc(100vh-7.5rem)] overflow-y-auto pl-3 pr-2 py-1 border-l border-[var(--rule-300)]"
                  aria-label="Page navigation"
                >
                  <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--ink-600)] mb-3 flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                    <span>Table of Contents</span>
                  </h2>
                  <nav aria-label="Desktop table of contents">
                    <ul className="space-y-1">
                      {toc.map((item) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              handleJumpToSection(item.id);
                            }}
                            className={cn(
                              "block py-1 px-2 rounded-md transition-all leading-snug",
                              item.level === 3 ? "pl-3.5 text-xs text-[var(--ink-500)]" : "text-[13px] font-medium",
                              activeId === item.id
                                ? "bg-[var(--paper-200)] font-semibold text-[var(--ink-950)] shadow-2xs"
                                : "text-[var(--ink-600)] hover:text-[var(--ink-950)] hover:bg-[var(--paper-100)]",
                            )}
                          >
                            {item.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </aside>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Global Minimal Landing Footer */}
      <LandingFooter />
    </div>
  );
}

export function PrivacyPage(): React.ReactElement {
  return (
    <LegalShell
      pageTitle="Notinn Privacy Policy"
      description="How Notinn protects personal data, ensures zero AI model training on user notes, and enforces transparent retention."
      source="privacy"
    />
  );
}

export function TermsPage(): React.ReactElement {
  return (
    <LegalShell
      pageTitle="Notinn Terms of Service"
      description="Terms of use, Free and Pro service plan limits, full data ownership, and account deletion rules."
      source="terms"
    />
  );
}
