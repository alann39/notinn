/**
 * A transport-neutral reading of prose that may contain lightweight lists.
 *
 * Gemini is asked for structured JSON, but section and summary strings can still
 * legitimately contain a small list. Keeping that list trapped inside one string
 * makes Telegram add paragraph spacing between every item and makes PDF collapse
 * the items into prose. This parser recognises only unambiguous line prefixes and
 * leaves every other character as content; it never interprets Markdown markup.
 */

export interface StructuredTextBlock {
  readonly kind: "paragraph" | "list_item";
  readonly text: string;
  /** A canonical visible marker owned by Notinn, not raw model markup. */
  readonly marker?: "•" | "[ ]" | "[x]" | `${number}.`;
  /** Whether the author placed a paragraph boundary before this block. */
  readonly breakBefore: boolean;
}

const CHECKBOX = /^\s*[-*•‣◦]?\s*\[([ xX])\]\s+(.+)$/;
const BULLET = /^\s*[-*•‣◦]\s+(.+)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.+)$/;

interface MutableBlock {
  kind: "paragraph" | "list_item";
  text: string;
  marker?: StructuredTextBlock["marker"];
  breakBefore: boolean;
}

function listLine(line: string): Omit<MutableBlock, "breakBefore"> | null {
  const checkbox = CHECKBOX.exec(line);
  if (checkbox !== null) {
    return {
      kind: "list_item",
      marker: checkbox[1]?.toLowerCase() === "x" ? "[x]" : "[ ]",
      text: checkbox[2]?.trim() ?? "",
    };
  }

  const bullet = BULLET.exec(line);
  if (bullet !== null) {
    return { kind: "list_item", marker: "•", text: bullet[1]?.trim() ?? "" };
  }

  const numbered = NUMBERED.exec(line);
  if (numbered !== null) {
    return {
      kind: "list_item",
      marker: `${Number(numbered[1])}.`,
      text: numbered[2]?.trim() ?? "",
    };
  }

  return null;
}

/**
 * Turn paragraphs and line-prefixed lists into semantic blocks.
 *
 * Adjacent prose lines are joined with a space because providers frequently wrap
 * a sentence at an arbitrary column. Blank lines remain paragraph boundaries.
 * Adjacent list items stay compact; transitions into or out of a list receive one
 * deliberate break so the hierarchy remains visible.
 */
export function parseStructuredText(value: string): readonly StructuredTextBlock[] {
  const blocks: MutableBlock[] = [];
  let paragraph: string[] = [];
  let separated = false;

  const pushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      kind: "paragraph",
      text: paragraph.join(" "),
      breakBefore: blocks.length > 0 &&
        (separated || blocks.at(-1)?.kind === "list_item"),
    });
    paragraph = [];
    separated = false;
  };

  for (const rawLine of value.replace(/\r\n?/g, "\n").split("\n")) {
    if (rawLine.trim() === "") {
      pushParagraph();
      separated = blocks.length > 0;
      continue;
    }

    const previous = blocks.at(-1);
    if (/^\s+/.test(rawLine) && !separated && previous?.kind === "list_item") {
      previous.text = `${previous.text} ${rawLine.trim()}`;
      continue;
    }

    const item = listLine(rawLine);
    if (item !== null && item.text !== "") {
      pushParagraph();
      blocks.push({
        ...item,
        // A list stays compact even when the provider inserts blank lines between
        // its source items. The visual list owns its rhythm, not that incidental
        // whitespace. Transitions from prose still receive one clear break.
        breakBefore: blocks.length > 0 && blocks.at(-1)?.kind !== "list_item",
      });
      separated = false;
      continue;
    }

    paragraph.push(rawLine.trim());
  }

  pushParagraph();
  return blocks;
}
