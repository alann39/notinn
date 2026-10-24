import fontkit from "@pdf-lib/fontkit";
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import manrope400Url from "@/assets/fonts/Manrope-400.ttf?url";
import manrope600Url from "@/assets/fonts/Manrope-600.ttf?url";
import manrope800Url from "@/assets/fonts/Manrope-800.ttf?url";
import geist600Url from "@/assets/fonts/Geist-600.ttf?url";
import geist800Url from "@/assets/fonts/Geist-800.ttf?url";

const W = 595.28;
const H = 841.89;
const BOTTOM = 58;

type Ink = ReturnType<typeof rgb>;
const INK = rgb(0.05, 0.05, 0.06);
const MUTED = rgb(0.42, 0.42, 0.45);
const ACCENT = rgb(1, 0.84, 0.28);

export type VariantItem = {
  readonly text: string;
  readonly style: "title" | "heading" | "body" | "bullet" | "task" | "detail" | "meta" | "space";
};

export type VariantFonts = {
  readonly body: PDFFont;
  readonly bold: PDFFont;
  readonly heavy: PDFFont;
};

async function embed(document: PDFDocument, url: string): Promise<PDFFont> {
  const response = await fetch(url);
  const bytes = await response.arrayBuffer();
  return document.embedFont(bytes, { subset: true });
}

export async function loadVariantFonts(
  document: PDFDocument,
  variant: "clean" | "brutal",
): Promise<VariantFonts> {
  document.registerFontkit(fontkit);
  const body = await embed(document, manrope400Url);
  if (variant === "brutal") {
    return {
      body,
      bold: await embed(document, manrope600Url),
      heavy: await embed(document, manrope800Url),
    };
  }
  return {
    body,
    bold: await embed(document, geist600Url),
    heavy: await embed(document, geist800Url),
  };
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
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
  return lines.length > 0 ? lines : [""];
}

/** Word-spaced last-mile justification; the final line of a block stays ragged. */
function drawLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: Ink,
  targetWidth: number,
  justify: boolean,
): void {
  const words = text.split(" ").filter((word) => word.length > 0);
  const natural = font.widthOfTextAtSize(text, size);
  const spaceWidth = font.widthOfTextAtSize(" ", size);
  const slack = targetWidth - natural;
  // A line that would need more than ~2 extra spaces of stretch reads worse
  // justified than ragged, so it stays left-aligned.
  if (!justify || words.length < 2 || slack <= 0 || slack > spaceWidth * 2 * (words.length - 1)) {
    page.drawText(text, { x, y, size, font, color });
    return;
  }
  const extra = slack / (words.length - 1);
  let cursor = x;
  words.forEach((word, index) => {
    page.drawText(word, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(word, size);
    if (index < words.length - 1) cursor += spaceWidth + extra;
  });
}

type Palette = {
  readonly pageMargin: number;
  readonly titleSize: number;
  readonly titleLine: number;
  readonly headingSize: number;
  readonly headingLine: number;
  readonly bodySize: number;
  readonly bodyLine: number;
  readonly smallSize: number;
  readonly smallLine: number;
  readonly gap: number;
};

const CLEAN: Palette = {
  pageMargin: 88,
  titleSize: 21,
  titleLine: 26,
  headingSize: 10.5,
  headingLine: 16,
  bodySize: 9.8,
  bodyLine: 15.5,
  smallSize: 8,
  smallLine: 11,
  gap: 11,
};

const BRUTAL: Palette = {
  pageMargin: 52,
  titleSize: 19,
  titleLine: 23,
  headingSize: 10,
  headingLine: 14,
  bodySize: 9.6,
  bodyLine: 14.6,
  smallSize: 7.8,
  smallLine: 10.5,
  gap: 8,
};

function contentBottom(palette: Palette): number {
  return BOTTOM + (palette.pageMargin > 60 ? 6 : 0);
}

export function renderClean(
  document: PDFDocument,
  items: readonly VariantItem[],
  fonts: VariantFonts,
): void {
  const m = CLEAN.pageMargin;
  const usable = W - m * 2;
  let page = document.addPage([W, H]);
  let y = H - m;

  const newPage = () => {
    page = document.addPage([W, H]);
    y = H - m;
  };

  for (const item of items) {
    if (item.style === "space") {
      y -= CLEAN.gap;
      continue;
    }

    if (item.style === "title") {
      const lines = wrap(fonts.heavy, item.text, CLEAN.titleSize, usable);
      for (const line of lines) {
        page.drawText(line, {
          x: m,
          y,
          size: CLEAN.titleSize,
          font: fonts.heavy,
          color: INK,
        });
        y -= CLEAN.titleLine;
      }
      y -= 6;
      page.drawLine({
        start: { x: m, y },
        end: { x: W - m, y },
        thickness: 0.8,
        color: rgb(0.85, 0.85, 0.86),
      });
      y -= 20;
      continue;
    }

    if (item.style === "heading") {
      if (y - 30 < contentBottom(CLEAN)) newPage();
      y -= 8;
      const label = item.text.toUpperCase();
      page.drawText(label, {
        x: m,
        y,
        size: 8.2,
        font: fonts.bold,
        color: rgb(0.32, 0.32, 0.34),
      });
      y -= 14;
      continue;
    }

    if (item.style === "task") {
      page.drawRectangle({
        x: m,
        y: y - 1,
        width: 8,
        height: 8,
        borderColor: rgb(0.32, 0.32, 0.34),
        borderWidth: 0.9,
      });
    }

    const font = item.style === "detail" || item.style === "meta" ? fonts.body : fonts.body;
    const size = item.style === "detail" || item.style === "meta" ? CLEAN.smallSize : CLEAN.bodySize;
    const lineHeight =
      item.style === "detail" || item.style === "meta" ? CLEAN.smallLine : CLEAN.bodyLine;
    const color = item.style === "detail" || item.style === "meta" ? MUTED : rgb(0.16, 0.16, 0.18);
    const indent =
      item.style === "detail" ? 12 : item.style === "task" ? 14 : 0;
    const lines = wrap(font, item.text, size, usable - indent);

    for (let index = 0; index < lines.length; index += 1) {
      if (y - lineHeight < contentBottom(CLEAN)) newPage();
      drawLine(
        page,
        lines[index] ?? "",
        m + indent,
        y,
        size,
        font,
        color,
        usable - indent,
        item.style === "body" && index < lines.length - 1,
      );
      y -= lineHeight;
    }
    if (item.style !== "meta") y -= 2;
  }
}

export function renderBrutal(
  document: PDFDocument,
  items: readonly VariantItem[],
  fonts: VariantFonts,
): void {
  const m = BRUTAL.pageMargin;
  const usable = W - m * 2;
  let page = document.addPage([W, H]);
  let y = H - m;

  const frame = (target: PDFPage) => {
    target.drawRectangle({
      x: 18,
      y: 18,
      width: W - 36,
      height: H - 36,
      borderColor: INK,
      borderWidth: 2.5,
      color: undefined,
    });
  };

  const newPage = () => {
    page = document.addPage([W, H]);
    frame(page);
    y = H - m;
  };

  frame(page);

  for (const item of items) {
    if (item.style === "space") {
      y -= BRUTAL.gap;
      continue;
    }

    if (item.style === "title") {
      const lines = wrap(fonts.heavy, item.text, BRUTAL.titleSize, usable - 28);
      const padX = 14;
      const padY = 12;
      const blockHeight = lines.length * BRUTAL.titleLine + padY * 2;
      if (y - blockHeight - 20 < contentBottom(BRUTAL)) newPage();

      const blockBottom = y - blockHeight;
      page.drawRectangle({
        x: m,
        y: blockBottom,
        width: usable,
        height: blockHeight,
        color: INK,
      });
      // Accent strip sits flush under the block, like a stamped edge.
      page.drawRectangle({
        x: m,
        y: blockBottom - 7,
        width: usable,
        height: 7,
        color: ACCENT,
      });

      let baseline = blockBottom + blockHeight - padY - BRUTAL.titleSize * 0.8;
      for (const line of lines) {
        page.drawText(line, {
          x: m + padX,
          y: baseline,
          size: BRUTAL.titleSize,
          font: fonts.heavy,
          color: rgb(1, 1, 1),
        });
        baseline -= BRUTAL.titleLine;
      }
      y = blockBottom - 7 - 22;
      continue;
    }

    if (item.style === "heading") {
      if (y - 46 < contentBottom(BRUTAL)) newPage();
      const label = item.text.toUpperCase();
      const labelWidth =
        fonts.heavy.widthOfTextAtSize(label, BRUTAL.headingSize) + 20;
      y -= 16;
      page.drawRectangle({
        x: m,
        y,
        width: Math.min(labelWidth, usable),
        height: 19,
        color: ACCENT,
        borderColor: INK,
        borderWidth: 1.6,
      });
      page.drawText(label, {
        x: m + 8,
        y: y + 6,
        size: BRUTAL.headingSize,
        font: fonts.heavy,
        color: INK,
      });
      // 24 below the chip bottom gives ~14pt of air before the first body line.
      y -= 24;
      continue;
    }

    if (item.style === "task") {
      page.drawRectangle({
        x: m,
        y: y - 1,
        width: 8.5,
        height: 8.5,
        borderColor: INK,
        borderWidth: 1.6,
      });
    }

    const isMeta = item.style === "detail" || item.style === "meta";
    const size = isMeta ? BRUTAL.smallSize : BRUTAL.bodySize;
    const lineHeight = isMeta ? BRUTAL.smallLine : BRUTAL.bodyLine;
    const color = isMeta ? MUTED : rgb(0.09, 0.09, 0.1);
    const indent =
      item.style === "detail" ? 14 : item.style === "task" ? 16 : 0;
    const lines = wrap(fonts.body, item.text, size, usable - indent);

    for (let index = 0; index < lines.length; index += 1) {
      if (y - lineHeight < contentBottom(BRUTAL)) newPage();
      drawLine(
        page,
        lines[index] ?? "",
        m + indent,
        y,
        size,
        fonts.body,
        color,
        usable - indent,
        item.style === "body" && index < lines.length - 1,
      );
      y -= lineHeight;
    }
    if (isMeta) y -= 5;
    else y -= 2;
  }
}
