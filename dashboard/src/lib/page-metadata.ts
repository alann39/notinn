interface PageMetadataInput {
  readonly lang?: "id" | "en";
  readonly robots?: string;
  readonly jsonLd?: Record<string, unknown>;
}

const DEFAULT_LANDING_METADATA = {
  lang: "en",
  robots: "noindex, nofollow",
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "ProductivityApplication",
    name: "Notinn",
    applicationCategory: "Productivity",
    description:
      "Send text, voice notes, screenshots, or documents through Telegram. Notinn turns them into structured notes you can save and find again.",
  },
} as const;

function ensureMeta(name: string): HTMLMetaElement {
  const existing = document.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`,
  );
  if (existing) return existing;
  const created = document.createElement("meta");
  created.setAttribute("name", name);
  document.head.appendChild(created);
  return created;
}

function ensureJsonLd(data: Record<string, unknown>): void {
  let script = document.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function applyPageMetadata(input: PageMetadataInput = {}): void {
  document.documentElement.lang = input.lang ?? DEFAULT_LANDING_METADATA.lang;
  ensureMeta("robots").setAttribute(
    "content",
    input.robots ?? DEFAULT_LANDING_METADATA.robots,
  );
  ensureJsonLd(input.jsonLd ?? DEFAULT_LANDING_METADATA.jsonLd);
}
