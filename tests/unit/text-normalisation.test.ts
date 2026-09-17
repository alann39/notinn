import { assert, assertEquals } from "@std/assert";
import { normaliseSourceText } from "../../supabase/functions/_shared/services/text-normalisation.ts";
import {
  MAX_PASTED_TEXT_CHARS,
  MAX_SOURCE_TEXT_LENGTH,
} from "../../supabase/functions/_shared/config/constants.ts";

/**
 * Canonical source text (blueprint 10.2, steps 1 and 2).
 *
 * The interesting assertions here are the ones about characters a reader cannot
 * see, so every invisible character in this file is written as an escape. Stating
 * them literally would make the file unreviewable — a diff cannot show the
 * difference between a space and a no-break space — and fragile, because a
 * formatter or an editor stripping whitespace would gut an assertion while leaving
 * it green.
 *
 * A normalisation function fails in ways no ordinary test notices: a stripped
 * joiner only shows up as a broken emoji, a missing carriage-return conversion
 * only as a paragraph that did not break, and a limit applied before normalisation
 * only as a note refused for a reason its author cannot reproduce. The cases below
 * are chosen for what they would catch rather than for coverage of the three
 * operations.
 */

/** The text of a result that is expected to be text. */
function text(raw: string): string {
  const result = normaliseSourceText(raw);
  assertEquals(result.kind, "text", `expected text, got ${result.kind} for ${JSON.stringify(raw)}`);

  return result.kind === "text" ? result.text : "";
}

/** A string that NFC composes or recomposes, so its length can change. */
const DECOMPOSED_CAFE = "cafe\u0301";
const COMPOSED_CAFE = "café";

// --- Line endings -----------------------------------------------------------

Deno.test("a CRLF pair becomes one newline, not two", () => {
  // The order of the two alternatives in the replacement is the whole of this.
  // Replacing `\r` and `\n` separately would turn every Windows line ending into
  // a blank line, which doubles the length of a pasted document.
  assertEquals(text("a\r\nb"), "a\nb");
  assertEquals(text("a\nb"), "a\nb");
});

Deno.test("a lone carriage return becomes a newline", () => {
  // An old Mac line ending, and also what some clients send for a paste. It is
  // not a newline to `/\n+/`, so without this a CR-separated paste reaches the
  // reader as one unbroken paragraph.
  assertEquals(text("a\rb"), "a\nb");
  assertEquals(text("a\r\r\nb"), "a\n\nb");
});

Deno.test("a CR-separated paste becomes the paragraphs its author wrote", () => {
  // The reason the conversion exists, expressed against the renderer's own rule.
  // `note-rendering.ts` splits `sections[].content` on `/\n+/`, so this is the
  // difference between two paragraphs and one.
  const paragraphs = text("First paragraph.\r\n\r\nSecond paragraph.").split(/\n+/);

  assertEquals(paragraphs, ["First paragraph.", "Second paragraph."]);
});

Deno.test("internal blank lines survive normalisation", () => {
  // Trimming the ends must not become collapsing the middle. A blank line inside
  // a note is structure the author chose.
  assertEquals(text("a\n\n\nb"), "a\n\n\nb");
});

// --- Unicode NFC ------------------------------------------------------------

Deno.test("a decomposed spelling becomes its composed form", () => {
  // The same word typed on two keyboards. Without NFC these are different strings
  // that hash differently, so one note would have two identities.
  assertEquals(text(DECOMPOSED_CAFE), COMPOSED_CAFE);
  assertEquals(text(COMPOSED_CAFE), COMPOSED_CAFE);
  assertEquals(text(DECOMPOSED_CAFE).length, 4);
  assertEquals(DECOMPOSED_CAFE.length, 5);
});

Deno.test("normalisation can only shorten, which is why the limit is applied after it", () => {
  // The relation the module's order depends on. If NFC could lengthen a string,
  // checking before it would accept input that normalised into an over-long note.
  for (const raw of [DECOMPOSED_CAFE, "e\u0301\u0301", "d\u0323\u0307", "A\u030A"]) {
    assert(
      raw.normalize("NFC").length <= raw.length,
      `${JSON.stringify(raw)} grew under NFC`,
    );
  }
});

Deno.test("an emoji held together by a joiner is not corrupted", () => {
  // U+200D is what makes U+1F468 U+200D U+1F469 U+200D U+1F467 one glyph rather
  // than three faces in a row. A normaliser that stripped joiners — a tempting
  // "invisible characters" pass — would silently change this, and nothing else in
  // this file would notice.
  const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";

  assertEquals(text(family), family);
  assertEquals(text(family).length, 8);
});

Deno.test("an ill-formed surrogate does not throw", () => {
  // A hand-built webhook body, or a client bug, can carry a lone surrogate. NFC
  // passes it through rather than rejecting it, which matters because the reverse
  // would turn such a payload into a 500 and an endless Telegram redelivery.
  for (const raw of ["\uD800", "a\uDC00b", "\uD83D"]) {
    const result = normaliseSourceText(raw);
    assert(
      result.kind === "text" || result.kind === "empty",
      `${result.kind} for a lone surrogate`,
    );
  }
});

// --- Trimming and emptiness -------------------------------------------------

Deno.test("whitespace at the ends is removed and whitespace inside is not", () => {
  assertEquals(text("  hello  "), "hello");
  assertEquals(text("\n\nhello\n\n"), "hello");
  assertEquals(text("hello world"), "hello world");
  assertEquals(text("a b  c"), "a b  c");
});

Deno.test("a message with nothing visible in it is empty", () => {
  // One definition of empty, read from the canonical form. These are the shapes
  // that reach the webhook when somebody presses space and then send.
  for (const raw of ["", " ", "\n", "\r\n", "\t", "   \n\t\r\n  "]) {
    assertEquals(
      normaliseSourceText(raw).kind,
      "empty",
      `${JSON.stringify(raw)} was not empty`,
    );
  }
});

Deno.test("characters that look like nothing but are not whitespace are kept", () => {
  // U+00A0 and U+3000 are whitespace to `trim()` and so a message of only those
  // is empty, which matches what a reader sees. U+200B is not whitespace to
  // `trim()` and survives, so a message containing only it is accepted as a
  // one-character note.
  //
  // That asymmetry is deliberate — see the module header. It is asserted here so
  // that adding a stripping list later is a decision somebody takes rather than a
  // line that quietly appeared.
  assertEquals(normaliseSourceText("\u00A0").kind, "empty");
  assertEquals(normaliseSourceText("\u3000").kind, "empty");

  const zeroWidth = normaliseSourceText("\u200B");
  assertEquals(zeroWidth.kind, "text");
  assertEquals(zeroWidth.kind === "text" ? zeroWidth.text : "", "\u200B");
});

Deno.test("a byte-order mark at the start of a paste is removed with the trim", () => {
  // U+FEFF is classified as whitespace by the JavaScript specification, so
  // `trim()` removes it. That is the only invisible character whose removal needs
  // no justification: it is a transport artefact rather than content.
  assertEquals(text("\uFEFFhello"), "hello");
  assertEquals(normaliseSourceText("\uFEFF").kind, "empty");
});

// --- The product limit ------------------------------------------------------

Deno.test("the limit is inclusive", () => {
  const atLimit = normaliseSourceText("x".repeat(MAX_PASTED_TEXT_CHARS));
  assertEquals(atLimit.kind, "text");
  assertEquals(atLimit.kind === "text" ? atLimit.text.length : 0, MAX_PASTED_TEXT_CHARS);

  const overLimit = normaliseSourceText("x".repeat(MAX_PASTED_TEXT_CHARS + 1));
  assertEquals(overLimit.kind, "too_long");
  assertEquals(overLimit.kind === "too_long" ? overLimit.length : 0, MAX_PASTED_TEXT_CHARS + 1);
});

Deno.test("the limit is measured after normalisation, not before", () => {
  // A note that is one character over the limit in its decomposed spelling and
  // exactly at it in its composed spelling. Refusing it would be refusing a note
  // whose author cannot see any difference, and blueprint 10.2 puts the limit
  // after normalisation for this reason.
  const raw = `${DECOMPOSED_CAFE}${"x".repeat(MAX_PASTED_TEXT_CHARS - 4)}`;
  assertEquals(raw.length, MAX_PASTED_TEXT_CHARS + 1);

  const result = normaliseSourceText(raw);
  assertEquals(result.kind, "text");
  assertEquals(result.kind === "text" ? result.text.length : 0, MAX_PASTED_TEXT_CHARS);
});

Deno.test("whitespace that will be trimmed does not count towards the limit", () => {
  const padded = `\n\n  ${"x".repeat(MAX_PASTED_TEXT_CHARS)}  \n\n`;

  assertEquals(normaliseSourceText(padded).kind, "text");
});

Deno.test("the product limit is the tighter of the two bounds", () => {
  // The claim `constants.ts` makes about these two, which is what lets the module
  // enforce only one of them: the structural bound on `source_text` is implied by
  // the product limit rather than restated here. A future edit that inverted the
  // two would leave the database column as the only thing rejecting an oversized
  // body, which is a constraint violation instead of a diagnosable refusal.
  assert(
    MAX_PASTED_TEXT_CHARS < MAX_SOURCE_TEXT_LENGTH,
    `the product limit ${MAX_PASTED_TEXT_CHARS} is not tighter than ` +
      `the structural bound ${MAX_SOURCE_TEXT_LENGTH}`,
  );
});

// --- The result itself ------------------------------------------------------

Deno.test("normalisation is idempotent", () => {
  // A note must not have a different digest depending on how many times it passed
  // through here. Each repair is applied once, because the output of the first
  // pass is already canonical.
  for (
    const raw of [
      "a\r\nb",
      `  ${DECOMPOSED_CAFE}  `,
      "\uFEFF hello \u00A0",
      "a\n\n\nb",
      "\u200B",
      "x".repeat(MAX_PASTED_TEXT_CHARS + 1),
    ]
  ) {
    const once = normaliseSourceText(raw);
    if (once.kind !== "text") continue;

    const twice = normaliseSourceText(once.text);
    assertEquals(twice.kind, "text");
    assertEquals(twice.kind === "text" ? twice.text : "", once.text, JSON.stringify(raw));
  }
});

Deno.test("no outcome carries the text except the one that should", () => {
  // The failure this guards against is a `too_long` result that still holds the
  // body, which would put sixty thousand characters of user content one careless
  // log line away from being written.
  const overLimit = normaliseSourceText("x".repeat(MAX_PASTED_TEXT_CHARS + 1));
  assertEquals(Object.keys(overLimit).sort(), ["kind", "length"]);

  const empty = normaliseSourceText("   ");
  assertEquals(Object.keys(empty), ["kind"]);
});
