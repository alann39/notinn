export interface StructuredTextBlock {
  readonly kind: "paragraph" | "list_item";
  readonly text: string;
  readonly marker?: "•" | "[ ]" | "[x]" | `${number}.`;
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
