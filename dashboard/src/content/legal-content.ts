import DOMPurify from "dompurify";
import { marked } from "marked";
import privacyMarkdown from "../../../docs/PRIVACY_NOTICE.md?raw";
import termsMarkdown from "../../../docs/TERMS_OF_SERVICE.md?raw";

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
];

export function renderLegalHtml(source: "privacy" | "terms"): string {
  const markdown = source === "privacy" ? privacyMarkdown : termsMarkdown;

  const parsed = marked.parse(markdown, { async: false }) as string;
  const sanitized = DOMPurify.sanitize(parsed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "scope"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });

  const container = document.createElement("div");
  container.innerHTML = sanitized;
  for (const anchor of container.querySelectorAll("a")) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (href === "PRIVACY_NOTICE.md" || href === "./PRIVACY_NOTICE.md") {
      anchor.setAttribute("href", "/privacy");
      continue;
    }
    if (!href.startsWith("https://")) {
      const replacement = document.createElement("span");
      replacement.textContent = anchor.textContent;
      anchor.replaceWith(replacement);
      continue;
    }
    anchor.setAttribute("rel", "noopener noreferrer");
  }
  return container.innerHTML;
}
