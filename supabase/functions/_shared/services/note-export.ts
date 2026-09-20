import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { AppError } from "../errors/app-error.ts";
import type { StructuredNote } from "../schemas/structured-note.ts";

export const NOTE_EXPORT_FORMATS = ["markdown", "text", "pdf"] as const;
export type NoteExportFormat = (typeof NOTE_EXPORT_FORMATS)[number];

export interface NoteExport {
  readonly filename: string;
  readonly mimeType:
    | "text/markdown;charset=utf-8"
    | "text/plain;charset=utf-8"
    | "application/pdf";
  readonly bytes: Uint8Array;
}

const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
const PDF_WIDTH = 595.28;
const PDF_HEIGHT = 841.89;
const PDF_MARGIN = 72;
const PDF_FOOTER_Y = 28;
const PDF_CONTENT_BOTTOM = 48;

interface PdfItem {
  readonly text: string;
  readonly style: "title" | "heading" | "body" | "bullet" | "detail" | "meta" | "space";
}

interface PdfTextStyle {
  readonly font: PDFFont;
  readonly size: number;
  readonly lineHeight: number;
  readonly indent: number;
  readonly continuationIndent: number;
  readonly color: ReturnType<typeof rgb>;
}

function markdown(value: string): string {
  return value.replace(/([\\`*_[\]{}()#+\-.!|<>])/g, "\\$1");
}

function filenameStem(title: string): string {
  const stem = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return stem === "" ? "notinn-note" : stem;
}

function markdownAction(item: StructuredNote["action_items"][number]): string[] {
  const details = [
    item.owner === null ? null : `  - Owner: ${markdown(item.owner)}`,
    item.due_date_text === null ? null : `  - Due: ${markdown(item.due_date_text)}`,
    item.due_date_iso === null ? null : `  - Due date: ${markdown(item.due_date_iso)}`,
    `  - Confidence: ${Math.round(item.confidence * 100)}%`,
  ].filter((line): line is string => line !== null);
  return [`- [ ] ${markdown(item.task)}`, ...details];
}

const TEXT_MEASURE = 72;

function wrapPlainLine(value: string, width = TEXT_MEASURE): string[] {
  const words = value.trim().split(/\s+/).filter((word) => word !== "");
  const lines: string[] = [];
  let current = "";
  for (const original of words) {
    let word = original;
    while (word.length > width) {
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines.length === 0 ? [""] : lines;
}

function wrapPlainText(value: string): string {
  return value.split("\n").flatMap((paragraph) => wrapPlainLine(paragraph)).join("\n");
}

function textHeading(value: string, marker = "-"): string {
  const length = Math.min(Math.max([...value].length, 3), TEXT_MEASURE);
  return `${value}\n${marker.repeat(length)}`;
}

function textBullet(value: string): string {
  const lines = wrapPlainLine(value, TEXT_MEASURE - 2);
  return lines.map((line, index) => `${index === 0 ? "• " : "  "}${line}`).join("\n");
}

function textAction(item: StructuredNote["action_items"][number]): string {
  const details = [
    item.owner === null ? null : `Owner: ${item.owner}`,
    item.due_date_text === null ? null : `Due: ${item.due_date_text}`,
    item.due_date_iso === null ? null : `Due date: ${item.due_date_iso}`,
    `Confidence: ${Math.round(item.confidence * 100)}%`,
  ].filter((value): value is string => value !== null);
  const task = wrapPlainLine(item.task, TEXT_MEASURE - 4)
    .map((line, index) => `${index === 0 ? "[ ] " : "    "}${line}`)
    .join("\n");
  return `${task}${
    details.length === 0 ? "" : `\n${details.map((detail) => `    ${detail}`).join("\n")}`
  }`;
}

function markdownExport(note: StructuredNote): string {
  const blocks: string[] = [`# ${markdown(note.title)}`];
  if (note.summary !== "") blocks.push(`## Summary\n\n${markdown(note.summary)}`);
  for (const section of note.sections) {
    blocks.push(
      `## ${markdown(section.heading)}${
        section.content === "" ? "" : `\n\n${markdown(section.content)}`
      }`,
    );
  }
  if (note.key_points.length > 0) {
    blocks.push(
      `## Key Points\n\n${note.key_points.map((item) => `- ${markdown(item)}`).join("\n")}`,
    );
  }
  if (note.action_items.length > 0) {
    blocks.push(`## Action Items\n\n${note.action_items.flatMap(markdownAction).join("\n")}`);
  }
  if (note.decisions.length > 0) {
    blocks.push(
      `## Decisions\n\n${note.decisions.map((item) => `- ${markdown(item)}`).join("\n")}`,
    );
  }
  if (note.uncertainties.length > 0) {
    blocks.push(
      `## Uncertainties\n\n${note.uncertainties.map((item) => `- ${markdown(item)}`).join("\n")}`,
    );
  }
  if (note.source_references.length > 0) {
    blocks.push(
      `## Source References\n\n${
        note.source_references.map((item) => `- ${markdown(item.type)}: ${markdown(item.value)}`)
          .join("\n")
      }`,
    );
  }
  if (note.tags.length > 0) {
    blocks.push(`## Tags\n\n${note.tags.map((tag) => `- ${markdown(tag)}`).join("\n")}`);
  }
  blocks.push(
    `---\n**Language:** ${markdown(note.language)} · **Template:** ${markdown(note.template_key)}`,
  );
  return `${blocks.join("\n\n")}\n`;
}

function textExport(note: StructuredNote): string {
  const blocks: string[] = [textHeading(note.title, "=")];
  if (note.summary !== "") blocks.push(`${textHeading("Summary")}\n${wrapPlainText(note.summary)}`);
  for (const section of note.sections) {
    blocks.push(
      `${textHeading(section.heading)}${
        section.content === "" ? "" : `\n${wrapPlainText(section.content)}`
      }`,
    );
  }
  if (note.key_points.length > 0) {
    blocks.push(`${textHeading("Key points")}\n${note.key_points.map(textBullet).join("\n")}`);
  }
  if (note.action_items.length > 0) {
    blocks.push(
      `${textHeading("Action items")}\n${note.action_items.map(textAction).join("\n\n")}`,
    );
  }
  if (note.decisions.length > 0) {
    blocks.push(`${textHeading("Decisions")}\n${note.decisions.map(textBullet).join("\n")}`);
  }
  if (note.uncertainties.length > 0) {
    blocks.push(
      `${textHeading("Uncertainties")}\n${note.uncertainties.map(textBullet).join("\n")}`,
    );
  }
  if (note.source_references.length > 0) {
    blocks.push(
      `${textHeading("Source references")}\n${
        note.source_references.map((item) => textBullet(`${item.type}: ${item.value}`)).join("\n")
      }`,
    );
  }
  if (note.tags.length > 0) blocks.push(`${textHeading("Tags")}\n${note.tags.join(" · ")}`);
  blocks.push(
    `${textHeading("Note details")}\nLanguage: ${note.language}\nTemplate: ${note.template_key}`,
  );
  return `${blocks.join("\n\n")}\n`;
}

function pdfItems(note: StructuredNote): PdfItem[] {
  const items: PdfItem[] = [{ text: note.title, style: "title" }];
  const section = (heading: string, lines: PdfItem[]) => {
    if (lines.length === 0) return;
    items.push({ text: "", style: "space" }, { text: heading, style: "heading" }, ...lines);
  };

  if (note.summary !== "") section("Summary", [{ text: note.summary, style: "body" }]);
  for (const value of note.sections) {
    items.push({ text: "", style: "space" }, { text: value.heading, style: "heading" });
    if (value.content !== "") items.push({ text: value.content, style: "body" });
  }
  section(
    "Key Points",
    note.key_points.map((text) => ({ text: `• ${text}`, style: "bullet" })),
  );
  section(
    "Action Items",
    note.action_items.flatMap((item) => {
      const details = [
        item.owner === null ? null : `Owner: ${item.owner}`,
        item.due_date_text === null ? null : `Due: ${item.due_date_text}`,
        item.due_date_iso === null ? null : `Due date: ${item.due_date_iso}`,
        `Confidence: ${Math.round(item.confidence * 100)}%`,
      ].filter((value): value is string => value !== null);
      return [
        { text: `[ ] ${item.task}`, style: "bullet" as const },
        { text: details.join(" · "), style: "detail" as const },
      ];
    }),
  );
  section(
    "Decisions",
    note.decisions.map((text) => ({ text: `• ${text}`, style: "bullet" })),
  );
  section(
    "Uncertainties",
    note.uncertainties.map((text) => ({ text: `• ${text}`, style: "bullet" })),
  );
  section(
    "Source References",
    note.source_references.map((item) => ({
      text: `• ${item.type}: ${item.value}`,
      style: "bullet",
    })),
  );
  section(
    "Tags",
    note.tags.length === 0 ? [] : [{ text: note.tags.join(", "), style: "body" }],
  );
  items.push(
    { text: "", style: "space" },
    { text: `Language: ${note.language}`, style: "meta" },
    { text: `Template: ${note.template_key}`, style: "meta" },
  );
  return items;
}

function supportedText(value: string, characterSet: ReadonlySet<number>): string {
  let result = "";
  for (const character of value.normalize("NFC")) {
    if (character === "\n" || character === "\t") {
      result += character;
      continue;
    }
    const codePoint = character.codePointAt(0);
    result += codePoint !== undefined && characterSet.has(codePoint) ? character : "?";
  }
  return result;
}

function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = `${current}${character}`;
    if (current !== "" && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current !== "") parts.push(current);
  return parts;
}

function wrapParagraph(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (text === "") return [""];
  const words = text.trim().split(/\s+/).flatMap((word) =>
    font.widthOfTextAtSize(word, size) <= maxWidth
      ? [word]
      : splitLongWord(word, font, size, maxWidth)
  );
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines.length === 0 ? [""] : lines;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  return text.split("\n").flatMap((paragraph, index) => [
    ...(index === 0 ? [] : [""]),
    ...wrapParagraph(paragraph, font, size, maxWidth),
  ]);
}

function pdfStyle(item: PdfItem, regular: PDFFont, bold: PDFFont): PdfTextStyle {
  const dark = rgb(0.12, 0.14, 0.18);
  switch (item.style) {
    case "title":
      return {
        font: bold,
        size: 24,
        lineHeight: 29,
        indent: 0,
        continuationIndent: 0,
        color: dark,
      };
    case "heading":
      return {
        font: bold,
        size: 16,
        lineHeight: 20,
        indent: 0,
        continuationIndent: 0,
        color: rgb(0.18, 0.27, 0.55),
      };
    case "bullet":
      return {
        font: regular,
        size: 11,
        lineHeight: 17,
        indent: 0,
        continuationIndent: 12,
        color: dark,
      };
    case "detail":
      return {
        font: regular,
        size: 9,
        lineHeight: 13,
        indent: 14,
        continuationIndent: 14,
        color: rgb(0.38, 0.4, 0.45),
      };
    case "meta":
      return {
        font: regular,
        size: 9,
        lineHeight: 13,
        indent: 0,
        continuationIndent: 0,
        color: rgb(0.45, 0.47, 0.52),
      };
    case "body":
    case "space":
      return {
        font: regular,
        size: 11,
        lineHeight: 17,
        indent: 0,
        continuationIndent: 0,
        color: dark,
      };
  }
}

async function pdfExport(note: StructuredNote, stem: string): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(note.title);
  document.setAuthor("Notinn");
  document.setSubject("Structured note exported from Notinn");
  document.setCreator("Notinn");
  document.setProducer("Notinn");

  // The built-in Courier family is metrically stable across PDF viewers. Unlike
  // unembedded Helvetica, its fixed advances do not depend on a viewer's local
  // substitute font, which keeps wrapping and glyph placement deterministic.
  const regular = await document.embedFont(StandardFonts.Courier);
  const bold = await document.embedFont(StandardFonts.CourierBold);
  const characterSet = new Set(regular.getCharacterSet());
  const exactText = new TextEncoder().encode(textExport(note));
  await document.attach(exactText, `${stem}.txt`, {
    mimeType: "text/plain;charset=utf-8",
    description: "Exact UTF-8 text represented by this PDF export.",
  });
  exactText.fill(0);

  let page: PDFPage = document.addPage([PDF_WIDTH, PDF_HEIGHT]);
  let y = PDF_HEIGHT - PDF_MARGIN;
  const usableWidth = PDF_WIDTH - PDF_MARGIN * 2;
  const addPage = () => {
    page = document.addPage([PDF_WIDTH, PDF_HEIGHT]);
    y = PDF_HEIGHT - PDF_MARGIN;
  };

  for (const item of pdfItems(note)) {
    if (item.style === "space") {
      y -= 8;
      continue;
    }
    const style = pdfStyle(item, regular, bold);
    const safe = supportedText(item.text, characterSet);
    const lines = wrapText(safe, style.font, style.size, usableWidth - style.indent);
    if (y - style.lineHeight < PDF_CONTENT_BOTTOM) addPage();
    for (let index = 0; index < lines.length; index += 1) {
      if (y - style.lineHeight < PDF_CONTENT_BOTTOM) addPage();
      const line = lines[index] ?? "";
      if (line !== "") {
        page.drawText(line, {
          x: PDF_MARGIN + (index === 0 ? style.indent : style.continuationIndent),
          y,
          size: style.size,
          font: style.font,
          color: style.color,
        });
      }
      y -= style.lineHeight;
    }
  }

  const pages = document.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    const label = `Notinn · ${index + 1} / ${pages.length}`;
    const width = regular.widthOfTextAtSize(label, 8);
    pages[index]?.drawText(label, {
      x: (PDF_WIDTH - width) / 2,
      y: PDF_FOOTER_Y,
      size: 8,
      font: regular,
      color: rgb(0.55, 0.57, 0.61),
    });
  }

  return await document.save({ useObjectStreams: false });
}

/** Render the validated current note into one bounded, in-memory download. */
export async function renderNoteExport(
  note: StructuredNote,
  format: NoteExportFormat,
): Promise<NoteExport> {
  const stem = filenameStem(note.title);
  const content = format === "markdown"
    ? markdownExport(note)
    : format === "text"
    ? textExport(note)
    : null;
  const bytes = content === null ? await pdfExport(note, stem) : new TextEncoder().encode(content);
  if (bytes.byteLength > MAX_EXPORT_BYTES) {
    throw AppError.inputTooLarge("rendered note export exceeded the in-memory limit");
  }
  const extension = format === "markdown" ? "md" : format === "text" ? "txt" : "pdf";
  const mimeType = format === "markdown"
    ? "text/markdown;charset=utf-8" as const
    : format === "text"
    ? "text/plain;charset=utf-8" as const
    : "application/pdf" as const;
  return {
    filename: `${stem}.${extension}`,
    mimeType,
    bytes,
  };
}
