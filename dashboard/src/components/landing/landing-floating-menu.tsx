import { useEffect, useState } from "react";
import { LANDING_CONTENT, LANDING_NAV, TELEGRAM_URL } from "@/content/landing.id";
import {
  LiquidMorphFloatingMenu,
  type FloatingMenuItem,
} from "@/components/ui/liquid-morph-floating-menu";

const NOSCRIPT_STYLE = [
  'nav[aria-label="Main navigation"]{display:none !important;}',
  "#notinn-floating-noscript{",
  "position:fixed;left:50%;top:calc(1.75rem + env(safe-area-inset-top, 0px));transform:translateX(-50%);z-index:50;",
  "display:flex;flex-wrap:wrap;gap:0.25rem 1rem;justify-content:center;",
  "background:#11110f;color:#f7f3ea;padding:0.75rem 1.5rem;border-radius:50px;",
  "font-size:0.875rem;max-width:calc(100vw - 2rem);",
  "}",
  "#notinn-floating-noscript a{color:inherit;text-decoration:none;}",
].join("");

export function LandingFloatingMenu(): React.ReactElement {
  const [activeHref, setActiveHref] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      const threshold = window.innerHeight * 0.3;
      let next: string | null = null;
      for (const item of LANDING_NAV) {
        const heading = document.getElementById(item.href.slice(1));
        if (heading && heading.getBoundingClientRect().top <= threshold) {
          next = item.href;
        }
      }
      setActiveHref((previous) => (previous === next ? previous : next));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);

  const items: readonly FloatingMenuItem[] = [
    ...LANDING_NAV.map((item) => ({
      label: item.label,
      href: item.href,
      onClick: () => {
        setActiveHref((previous) => (previous === item.href ? previous : item.href));
      },
    })),
    { label: LANDING_CONTENT.dashboardLink, href: "/notes" },
    { label: LANDING_CONTENT.primaryCta, href: TELEGRAM_URL, external: true },
  ];

  return (
    <>
      <LiquidMorphFloatingMenu
        items={items}
        activeHref={activeHref}
        openWidth={300}
        openHeight={360}
      />
      <noscript>
        <style>{NOSCRIPT_STYLE}</style>
        <div id="notinn-floating-noscript">
          {items.map((item) => (
            <a key={item.href ?? item.label} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
      </noscript>
    </>
  );
}
