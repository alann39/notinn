import DOMPurify from "dompurify";
import { marked } from "marked";
import privacyMarkdown from "../../../docs/PRIVACY_NOTICE.md?raw";
import termsMarkdown from "../../../docs/TERMS_OF_SERVICE.md?raw";

export interface LegalTocItem {
  id: string;
  title: string;
  level: number;
}

export interface LegalContentResult {
  html: string;
  toc: LegalTocItem[];
  lastReviewed: string;
}

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "em",
  "code",
  "pre",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseLastReviewed(markdown: string): string {
  const match = markdown.match(/Last reviewed:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (!match) return "October 2026";
  const dateStr = match[1];
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function getLegalContent(source: "privacy" | "terms"): LegalContentResult {
  const markdown = source === "privacy" ? privacyMarkdown : termsMarkdown;
  const lastReviewed = parseLastReviewed(markdown);

  const parsed = marked.parse(markdown, { async: false }) as string;
  const sanitized = DOMPurify.sanitize(parsed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "scope", "id", "class"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });

  const container = document.createElement("div");
  container.innerHTML = sanitized;

  const toc: LegalTocItem[] = [];
  const headings = container.querySelectorAll("h2, h3");
  headings.forEach((heading, idx) => {
    const title = heading.textContent?.trim() ?? "";
    const slug = slugify(title) || `section-${idx + 1}`;
    heading.setAttribute("id", slug);
    const level = heading.tagName.toLowerCase() === "h2" ? 2 : 3;
    toc.push({
      id: slug,
      title,
      level,
    });
  });

  for (const anchor of container.querySelectorAll("a")) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (href === "PRIVACY_NOTICE.md" || href === "./PRIVACY_NOTICE.md") {
      anchor.setAttribute("href", "/privacy");
      continue;
    }
    if (href === "TERMS_OF_SERVICE.md" || href === "./TERMS_OF_SERVICE.md") {
      anchor.setAttribute("href", "/terms");
      continue;
    }
    if (href.startsWith("#")) {
      continue;
    }
    if (!href.startsWith("https://")) {
      const replacement = document.createElement("span");
      replacement.textContent = anchor.textContent;
      anchor.replaceWith(replacement);
      continue;
    }
    anchor.setAttribute("rel", "noopener noreferrer");
    anchor.setAttribute("target", "_blank");
  }

  return {
    html: container.innerHTML,
    toc,
    lastReviewed,
  };
}

export function renderLegalHtml(source: "privacy" | "terms"): string {
  return getLegalContent(source).html;
}

