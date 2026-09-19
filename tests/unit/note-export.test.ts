import { assert, assertEquals } from "@std/assert";
import { PDFDocument } from "pdf-lib";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { renderNoteExport } from "../../supabase/functions/_shared/services/note-export.ts";
import { parseStructuredNote } from "../../supabase/functions/_shared/schemas/structured-note.ts";
import { type StructuredNoteFixture, structuredNoteFixture } from "../fixtures/notes/builders.ts";

async function decoded(
  format: "markdown" | "text",
  overrides: Partial<StructuredNoteFixture> = {},
) {
  const note = parseStructuredNote(
    structuredNoteFixture(overrides),
    AppError.outputValidationFailed,
  );
  const exported = await renderNoteExport(note, format);
  return { exported, content: new TextDecoder().decode(exported.bytes) };
}

Deno.test("Markdown export includes every structured-note group", async () => {
  const { exported, content } = await decoded("markdown", {
    source_references: [{ type: "page", value: "4" }],
  });

  assertEquals(exported.filename, "synthetic-weekly-sync.md");
  assertEquals(exported.mimeType, "text/markdown;charset=utf-8");
  for (
    const heading of [
      "# Synthetic weekly sync",
      "## Summary",
      "## Context",
      "## Key Points",
      "## Action Items",
      "## Decisions",
      "## Uncertainties",
      "## Source References",
      "## Tags",
    ]
  ) assert(content.includes(heading), `missing ${heading}`);
  assert(content.endsWith("Template: clean\\_note\n"));
});

Deno.test("Markdown export escapes model text instead of creating active markup", async () => {
  const { content } = await decoded("markdown", {
    title: "<script> [link](bad)",
    summary: "**bold** and <img>",
  });

  assert(content.startsWith("# \\<script\\> \\[link\\]\\(bad\\)"));
  assert(content.includes("\\*\\*bold\\*\\* and \\<img\\>"));
  assertEquals(content.includes("<script>"), false);
});

Deno.test("plain-text export remains readable and uses a safe fallback filename", async () => {
  const { exported, content } = await decoded("text", { title: "會議記錄" });

  assertEquals(exported.filename, "notinn-note.txt");
  assertEquals(exported.mimeType, "text/plain;charset=utf-8");
  assert(content.startsWith("會議記錄\n\nSUMMARY\n"));
  assert(content.includes("Owner: Synthetic Owner"));
  assert(content.includes("Confidence: 80%"));
});

Deno.test("empty optional groups are omitted from both text export formats", async () => {
  const overrides = {
    summary: "",
    sections: [],
    key_points: [],
    action_items: [],
    decisions: [],
    tags: [],
    uncertainties: [],
    source_references: [],
  };
  const markdown = (await decoded("markdown", overrides)).content;
  const text = (await decoded("text", overrides)).content;

  assertEquals(markdown.includes("## Summary"), false);
  assertEquals(markdown.includes("## Tags"), false);
  assertEquals(text.includes("SUMMARY"), false);
  assertEquals(text.includes("TAGS"), false);
});

Deno.test("PDF export is valid, owner-readable metadata survives, and filename stays safe", async () => {
  const note = parseStructuredNote(
    structuredNoteFixture({ title: "會議記錄" }),
    AppError.outputValidationFailed,
  );
  const exported = await renderNoteExport(note, "pdf");
  const document = await PDFDocument.load(exported.bytes);

  assertEquals(exported.filename, "notinn-note.pdf");
  assertEquals(exported.mimeType, "application/pdf");
  assertEquals(new TextDecoder().decode(exported.bytes.slice(0, 5)), "%PDF-");
  assertEquals(document.getTitle(), "會議記錄");
  assertEquals(document.getAuthor(), "Notinn");
  assert(document.getPageCount() >= 1);
});

Deno.test("PDF export paginates long validated notes", async () => {
  const note = parseStructuredNote(
    structuredNoteFixture({
      sections: [{ heading: "Long context", content: "Synthetic sentence. ".repeat(700) }],
    }),
    AppError.outputValidationFailed,
  );
  const exported = await renderNoteExport(note, "pdf");
  const document = await PDFDocument.load(exported.bytes);

  assert(document.getPageCount() > 1);
  assert(exported.bytes.byteLength < 2 * 1024 * 1024);
});
