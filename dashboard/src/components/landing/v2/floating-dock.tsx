import {
  AudioLines,
  CircleHelp,
  LayoutDashboard,
  Search,
  Send,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TELEGRAM_URL } from "@/content/landing.id";

interface DockLink {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** Section observed for the active-item highlight. */
  readonly sectionId: string;
  readonly icon: LucideIcon;
}

const DOCK_LINKS: readonly DockLink[] = [
  {
    id: "capture",
    label: "Capture",
    href: "#capture",
    sectionId: "capture",
    icon: AudioLines,
  },
  {
    id: "structure",
    label: "How it works",
    href: "#how-it-works",
    sectionId: "how-it-works",
    icon: Zap,
  },
  {
    id: "retrieve",
    label: "Dashboard",
    href: "#dashboard",
    sectionId: "dashboard",
    icon: Search,
  },
  {
    id: "faq",
    label: "FAQ",
    href: "#faq",
    sectionId: "faq",
    icon: CircleHelp,
  },
];

const OBSERVED_SECTIONS: readonly string[] = ["capture", "how-it-works", "dashboard", "faq"];

/**
 * Tracks which of the dock's sections occupies the middle band of the viewport.
 * The band is narrow (10% of the height) so exactly one section wins; between
 * sections the last winner stays, which is why the initial value is the first.
 */
function useActiveSection(): string {
  const [activeId, setActiveId] = useState(OBSERVED_SECTIONS[0]);

  useEffect(() => {
    const sections = OBSERVED_SECTIONS.map((id) => document.getElementById(id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const next = OBSERVED_SECTIONS.find((id) => visible.has(id));
        if (next) setActiveId(next);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return activeId;
}

export function FloatingDock(): React.ReactElement {
  const activeId = useActiveSection();

  return (
    <div className="v2-dock">
      <div className="v2-dock__veil" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <nav className="v2-dock__bar" aria-label="Landing sections">
        {DOCK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.id}
              className="v2-dock__item"
              href={link.href}
              aria-label={link.label}
              aria-current={link.sectionId === activeId ? "location" : undefined}
            >
              <Icon aria-hidden="true" size={20} />
              <span className="v2-dock__tip" role="tooltip">
                {link.label}
              </span>
            </a>
          );
        })}
        <span className="v2-dock__divider" aria-hidden="true" />
        <a
          className="v2-dock__item v2-dock__cta"
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in Telegram"
        >
          <Send aria-hidden="true" size={20} />
          <span className="v2-dock__tip" role="tooltip">
            Open in Telegram
          </span>
        </a>
        <a className="v2-dock__item v2-dock__cta" href="/notes" aria-label="Web dashboard">
          <LayoutDashboard aria-hidden="true" size={20} />
          <span className="v2-dock__tip" role="tooltip">
            Web dashboard
          </span>
        </a>
      </nav>
    </div>
  );
}
