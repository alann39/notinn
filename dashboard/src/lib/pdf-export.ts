import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { parseStructuredText } from "./structured-text";
import type { StructuredNote } from "@/types/notes";

const PDF_WIDTH = 595.28;
const PDF_HEIGHT = 841.89;
const PDF_MARGIN = 72;
const PDF_FOOTER_Y = 28;
const PDF_CONTENT_BOTTOM = 48;
const TEXT_MEASURE = 72;

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

function textBullet(value: string, marker = "•"): string {
  const prefix = `${marker} `;
  const indent = " ".repeat(prefix.length);
  const lines = wrapPlainLine(value, TEXT_MEASURE - prefix.length);
  return lines.map((line, index) => `${index === 0 ? prefix : indent}${line}`).join("\n");
}

function textAction(item: { text?: string; task?: string; owner?: string | null; due_date?: string | null; due_date_text?: string | null; due_date_iso?: string | null; priority?: string | null; confidence?: number }): string {
  const taskText = item.text ?? item.task ?? "";
  const details = [
    item.owner ? `Owner: ${item.owner}` : null,
    item.due_date ? `Due: ${item.due_date}` : item.due_date_text ? `Due: ${item.due_date_text}` : null,
    item.priority ? `Priority: ${item.priority}` : null,
    item.confidence !== undefined ? `Confidence: ${Math.round(item.confidence * 100)}%` : null,
  ].filter((v): v is string => v !== null);
  const task = wrapPlainLine(taskText, TEXT_MEASURE - 4)
    .map((line, index) => `${index === 0 ? "[ ] " : "    "}${line}`)
    .join("\n");
  return `${task}${
    details.length === 0 ? "" : `\n${details.map((detail) => `    ${detail}`).join("\n")}`
  }`;
}

function textStructuredText(value: string): string {
  const lines: string[] = [];
  for (const block of parseStructuredText(value)) {
    if (block.breakBefore && lines.at(-1) !== "") lines.push("");
    lines.push(
      block.kind === "list_item"
        ? textBullet(block.text, block.marker ?? "•")
        : wrapPlainText(block.text),
    );
  }
  return lines.join("\n");
}

function textExport(note: StructuredNote): string {
  const blocks: string[] = [textHeading(note.title, "=")];
  if (note.summary) {
    blocks.push(`${textHeading("Summary")}\n${textStructuredText(note.summary)}`);
  }
  if (note.sections) {
    for (const section of note.sections) {
      const content = section.body ?? (section as { content?: string }).content ?? "";
      blocks.push(
        `${textHeading(section.heading)}${
          content === "" ? "" : `\n${textStructuredText(content)}`
        }`,
      );
    }
  }
  if (note.key_points && note.key_points.length > 0) {
    blocks.push(
      `${textHeading("Key points")}\n${note.key_points.map((item) => textBullet(item)).join("\n")}`,
    );
  }
  if (note.action_items && note.action_items.length > 0) {
    blocks.push(
      `${textHeading("Action items")}\n${note.action_items.map(textAction).join("\n\n")}`,
    );
  }
  if (note.tags && note.tags.length > 0) blocks.push(`${textHeading("Tags")}\n${note.tags.join(" · ")}`);
  blocks.push(
    `${textHeading("Note details")}\nLanguage: ${note.language ?? "auto"}\nExported: ${new Date().toLocaleDateString("en-GB")}`,
  );
  return `${blocks.join("\n\n")}\n`;
}

function pdfItems(note: StructuredNote): PdfItem[] {
  const items: PdfItem[] = [{ text: note.title, style: "title" }];
  const section = (heading: string, lines: PdfItem[]) => {
    if (lines.length === 0) return;
    items.push({ text: "", style: "space" }, { text: heading, style: "heading" }, ...lines);
  };

  const structuredPdfItems = (value: string): PdfItem[] =>
    parseStructuredText(value).flatMap((block) => [
      ...(block.breakBefore ? [{ text: "", style: "space" as const }] : []),
      block.kind === "list_item"
        ? {
          text: `${block.marker ?? "•"} ${block.text}`,
          style: "bullet" as const,
        }
        : { text: block.text, style: "body" as const },
    ]);

  if (note.summary) section("Summary", structuredPdfItems(note.summary));
  if (note.sections) {
    for (const value of note.sections) {
      items.push({ text: "", style: "space" }, { text: value.heading, style: "heading" });
      const content = value.body ?? (value as { content?: string }).content ?? "";
      if (content !== "") items.push(...structuredPdfItems(content));
    }
  }
  if (note.key_points && note.key_points.length > 0) {
    section(
      "Key Points",
      note.key_points.map((text) => ({ text: `• ${text}`, style: "bullet" })),
    );
  }
  if (note.action_items && note.action_items.length > 0) {
    section(
      "Action Items",
      note.action_items.flatMap((item) => {
        const taskText = item.text ?? (item as { task?: string }).task ?? "";
        const ownerText = item.assignee ?? (item as { owner?: string | null }).owner;
        const details = [
          ownerText ? `Owner: ${ownerText}` : null,
          item.due_date ? `Due: ${item.due_date}` : (item as { due_date_text?: string }).due_date_text ? `Due: ${(item as { due_date_text?: string }).due_date_text}` : null,
          item.priority ? `Priority: ${item.priority}` : null,
        ].filter((val): val is string => val !== null);
        return [
          { text: `[ ] ${taskText}`, style: "bullet" as const },
          ...(details.length > 0 ? [{ text: details.join(" · "), style: "detail" as const }] : []),
        ];
      }),
    );
  }
  if (note.tags && note.tags.length > 0) {
    section(
      "Tags",
      [{ text: note.tags.join(", "), style: "body" }],
    );
  }
  items.push(
    { text: "", style: "space" },
    { text: `Language: ${note.language ?? "auto"}`, style: "meta" },
    { text: `Exported: ${new Date().toLocaleDateString("en-GB")}`, style: "meta" },
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

export async function exportNoteToPdf(note: StructuredNote): Promise<{ filename: string; blob: Blob }> {
  const stem = filenameStem(note.title);
  const document = await PDFDocument.create();
  document.setTitle(note.title);
  document.setAuthor("Notinn");
  document.setSubject("Structured note exported from Notinn");
  document.setCreator("Notinn");
  document.setProducer("Notinn");

  const regular = await document.embedFont(StandardFonts.Courier);
  const bold = await document.embedFont(StandardFonts.CourierBold);
  const characterSet = new Set(regular.getCharacterSet());
  const exactText = new TextEncoder().encode(textExport(note));
  await document.attach(exactText, `${stem}.txt`, {
    mimeType: "text/plain;charset=utf-8",
    description: "Exact UTF-8 text represented by this PDF export.",
  });

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

  const pdfBytes = await document.save({ useObjectStreams: false });
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  return {
    filename: `${stem}.pdf`,
    blob,
  };
}
