import { assert, assertEquals } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { renderNoteExport } from "../../supabase/functions/_shared/services/note-export.ts";
import { parseStructuredNote } from "../../supabase/functions/_shared/schemas/structured-note.ts";
import { type StructuredNoteFixture, structuredNoteFixture } from "../fixtures/notes/builders.ts";

function decoded(
  format: "markdown" | "text",
  overrides: Partial<StructuredNoteFixture> = {},
) {
  const note = parseStructuredNote(
    structuredNoteFixture(overrides),
    AppError.outputValidationFailed,
  );
  const exported = renderNoteExport(note, format);
  return { exported, content: new TextDecoder().decode(exported.bytes) };
}

Deno.test("Markdown export includes every structured-note group", () => {
  const { exported, content } = decoded("markdown", {
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

Deno.test("Markdown export escapes model text instead of creating active markup", () => {
  const { content } = decoded("markdown", {
    title: "<script> [link](bad)",
    summary: "**bold** and <img>",
  });

  assert(content.startsWith("# \\<script\\> \\[link\\]\\(bad\\)"));
  assert(content.includes("\\*\\*bold\\*\\* and \\<img\\>"));
  assertEquals(content.includes("<script>"), false);
});

Deno.test("plain-text export remains readable and uses a safe fallback filename", () => {
  const { exported, content } = decoded("text", { title: "會議記錄" });

  assertEquals(exported.filename, "notinn-note.txt");
  assertEquals(exported.mimeType, "text/plain;charset=utf-8");
  assert(content.startsWith("會議記錄\n\nSUMMARY\n"));
  assert(content.includes("Owner: Synthetic Owner"));
  assert(content.includes("Confidence: 80%"));
});

Deno.test("empty optional groups are omitted from both export formats", () => {
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
  const markdown = decoded("markdown", overrides).content;
  const text = decoded("text", overrides).content;

  assertEquals(markdown.includes("## Summary"), false);
  assertEquals(markdown.includes("## Tags"), false);
  assertEquals(text.includes("SUMMARY"), false);
  assertEquals(text.includes("TAGS"), false);
});
