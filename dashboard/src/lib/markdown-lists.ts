/**
 * Generated notes often carry literal bullet glyphs ("• ", "· ", "▪ ") or
 * "1)" style numbering instead of Markdown markers. `marked` then renders them
 * as one paragraph with the glyphs inline, which reads as a cramped block with
 * bullets running through the sentence.
 *
 * Rewriting those lines to real Markdown list items fixes both the read view
 * and the rich-text editor. Fenced code blocks are left untouched.
 */
export function normalizeMarkdownLists(markdown: string): string {
  if (!markdown) return markdown;
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith("```")) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line
        .replace(/^(\s*)[•·▪◦‣]\s+/, "$1- ")
        .replace(/^(\s*)\d+[)]\s+/, (_match: string, indent: string) => `${indent}1. `);
    })
    .join("\n");
}

const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Removes one headed section from a markdown body, up to the next heading of
 * the same or higher level. Used so a section that is rendered as its own
 * structured block (key points, action items) is not repeated inside the body.
 */
export function stripMarkdownSection(
  markdown: string,
  matchHeading: RegExp,
): string {
  if (!markdown) return markdown;
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => {
    const heading = HEADING.exec(line.trim());
    return heading !== null && matchHeading.test(heading[2] ?? "");
  });
  if (start === -1) return markdown;

  const level = (HEADING.exec(lines[start]!.trim())?.[1] ?? "#").length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = HEADING.exec(lines[index]!.trim());
    if (heading && (heading[1] ?? "").length <= level) {
      end = index;
      break;
    }
  }

  const kept = [...lines.slice(0, start), ...lines.slice(end)];
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const KEY_POINTS_HEADING = /^(key ?points?|poin(?:-| )?penting|pokok(?:-| )?pikiran)\b/i;
export const ACTION_ITEMS_HEADING = /^(action ?items?|to-?do|tugas|rencana aksi)\b/i;
