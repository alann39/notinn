import { assert, assertEquals } from "@std/assert";
import {
  type InputType,
  SYSTEM_TEMPLATE_KEYS,
  type SystemTemplateKey,
} from "../../supabase/functions/_shared/config/constants.ts";
import {
  defaultTemplateFor,
  documentInputType,
  routeInput,
  routingReasonFor,
  unknownTemplateKeys,
} from "../../supabase/functions/_shared/services/input-routing.ts";

/**
 * Default template routing, transcribed from blueprint 6.3.
 *
 * The table is pinned row by row rather than sampled, because this is the
 * decision the user experiences first: send a photograph, get Extract &
 * Summarize. A regression here is not a crash, it is the wrong kind of note
 * arriving for every message of that type.
 */

// --- The blueprint's table -------------------------------------------------

Deno.test("the routing table matches blueprint 6.3 row for row", () => {
  assertEquals(defaultTemplateFor("text"), "clean_note");
  assertEquals(defaultTemplateFor("voice"), "clean_note");
  assertEquals(defaultTemplateFor("audio"), "clean_note");
  assertEquals(defaultTemplateFor("image"), "extract_and_summarize");
  assertEquals(defaultTemplateFor("pdf"), "detailed_summary");
  assertEquals(defaultTemplateFor("docx"), "detailed_summary");
});

Deno.test("a forwarded message is routed to Short Summary", () => {
  assertEquals(defaultTemplateFor("text", true), "short_summary");
  assertEquals(routingReasonFor("text", true), "forwarded_text");
});

Deno.test("forwarding changes the template only for text", () => {
  // Blueprint 6.3 routes a forwarded photograph by what it is, not by how it
  // arrived. Treating every forwarded message as text would send a forwarded
  // image to Short Summary and drop the extraction the user wanted.
  assertEquals(defaultTemplateFor("image", true), "extract_and_summarize");
  assertEquals(defaultTemplateFor("pdf", true), "detailed_summary");
  assertEquals(defaultTemplateFor("voice", true), "clean_note");
  assertEquals(routingReasonFor("image", true), "image");
  assertEquals(routingReasonFor("pdf", true), "pdf");
});

Deno.test("the routing reason names the input type when nothing else decided it", () => {
  // The reason goes into the log line, so it has to distinguish "a forwarded
  // message" from "a voice note" without carrying any content.
  assertEquals(routingReasonFor("text"), "text");
  assertEquals(routingReasonFor("voice"), "voice");
  assertEquals(routingReasonFor("audio"), "audio");
  assertEquals(routingReasonFor("image"), "image");
  assertEquals(routingReasonFor("pdf"), "pdf");
  assertEquals(routingReasonFor("docx"), "docx");
  assertEquals(routingReasonFor("txt"), "txt");
  assertEquals(routingReasonFor("md"), "md");
});

Deno.test("TXT and Markdown route to Clean Note", () => {
  // The blueprint lists these as supported inputs but omits them from the
  // routing table. They are text, and the table's closest row is "Pasted text".
  // Recorded in docs/ADR/0001-blueprint-deviations.md.
  assertEquals(defaultTemplateFor("txt"), "clean_note");
  assertEquals(defaultTemplateFor("md"), "clean_note");
});

Deno.test("a voice note routes to Clean Note in Phase 0", () => {
  // Blueprint 6.3 says "Meeting Notes if meeting-like, otherwise Clean Note".
  // The judgement needs a transcript, which Phase 0 does not produce, so the
  // table's own fallback applies. See docs/ADR/0001-blueprint-deviations.md.
  assertEquals(defaultTemplateFor("voice"), "clean_note");
  assertEquals(defaultTemplateFor("audio"), "clean_note");
});

// --- Decisions are total and coherent --------------------------------------

Deno.test("every decision names a template that exists in the catalogue", () => {
  // A routing table that named a template the database does not have would fail
  // at the foreign key on a user's first message, which is the wrong place to
  // discover a typo.
  assertEquals([...unknownTemplateKeys()], []);

  const catalogue = new Set<string>(SYSTEM_TEMPLATE_KEYS);
  const inputs: readonly InputType[] = [
    "text",
    "voice",
    "audio",
    "image",
    "pdf",
    "docx",
    "txt",
    "md",
  ];

  for (const inputType of inputs) {
    for (const forwarded of [false, true]) {
      const template: SystemTemplateKey = defaultTemplateFor(inputType, forwarded);
      assert(catalogue.has(template), `${inputType} (forwarded=${forwarded}) → ${template}`);
    }
  }
});

Deno.test("a routing decision carries its input type unchanged", () => {
  // The router chooses a template; it does not reinterpret the input.
  const decision = routeInput("pdf");
  assertEquals(decision.inputType, "pdf");
  assertEquals(decision.templateKey, "detailed_summary");
  assertEquals(decision.reason, "pdf");
});

// --- Document resolution ---------------------------------------------------

Deno.test("a document's MIME type decides its input type", () => {
  assertEquals(documentInputType("application/pdf", "anything"), "pdf");
  assertEquals(
    documentInputType(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "anything",
    ),
    "docx",
  );
  assertEquals(documentInputType("text/plain", "anything"), "txt");
  assertEquals(documentInputType("text/markdown", "anything"), "md");
  assertEquals(documentInputType("text/x-markdown", "anything"), "md");
});

Deno.test("a MIME type parameter is ignored", () => {
  // Telegram passes through whatever the client sent, and clients append
  // charsets: "text/plain; charset=utf-8".
  assertEquals(documentInputType("text/plain; charset=utf-8", "notes.txt"), "txt");
  assertEquals(documentInputType("APPLICATION/PDF", "report.pdf"), "pdf");
  assertEquals(documentInputType("  text/plain  ", "notes.txt"), "txt");
});

Deno.test("a MIME type wins over a misleading extension", () => {
  // The extension is chosen by the sender. When a MIME type is present it is
  // the better signal, even if the two disagree.
  assertEquals(documentInputType("application/pdf", "actually-a-lie.md"), "pdf");
});

Deno.test("the extension is used when there is no MIME type", () => {
  assertEquals(documentInputType(undefined, "notes.md"), "md");
  assertEquals(documentInputType(null, "notes.md"), "md");
  assertEquals(documentInputType("", "notes.md"), "md");
  assertEquals(documentInputType(null, "REPORT.PDF"), "pdf");
  assertEquals(documentInputType(undefined, "readme.markdown"), "md");
  assertEquals(documentInputType(undefined, "notes.txt"), "txt");
  assertEquals(
    documentInputType(undefined, "report.docx"),
    "docx",
  );
});

Deno.test("a document of an unsupported kind resolves to nothing", () => {
  // Not an error: the caller turns this into a documented ignore.
  assertEquals(documentInputType("application/zip", "archive.zip"), null);
  assertEquals(documentInputType("image/png", "scan.png"), null);
  assertEquals(documentInputType("application/msword", "legacy.doc"), null);
  assertEquals(documentInputType("video/mp4", "clip.mp4"), null);
});

Deno.test("a document with neither a usable MIME type nor a known extension resolves to nothing", () => {
  assertEquals(documentInputType(null, "mystery"), null);
  assertEquals(documentInputType(undefined, undefined), null);
  assertEquals(documentInputType(null, null), null);
  assertEquals(documentInputType("", ""), null);
  assertEquals(documentInputType(null, ""), null);
  assertEquals(documentInputType("", null), null);
});

Deno.test("an unrecognised MIME type falls through to the extension", () => {
  // Deliberate, and the reason the fallback exists at all. A client that does
  // not know a file's type sends `application/octet-stream`, and refusing those
  // would reject a large share of legitimate uploads. The cost of trusting the
  // extension is bounded: a genuinely mislabelled file fails extraction with a
  // clear error rather than being misread.
  assertEquals(documentInputType("application/octet-stream", "notes.md"), "md");
  assertEquals(documentInputType("application/octet-stream", "report.pdf"), "pdf");
  assertEquals(documentInputType("application/zip", "report.pdf"), "pdf");
});

Deno.test("a filename without an extension resolves to nothing", () => {
  assertEquals(documentInputType(undefined, "a"), null);
  assertEquals(documentInputType(undefined, ""), null);
});
