import { MAX_PASTED_TEXT_CHARS } from "../config/constants.ts";

/**
 * Canonical source text (blueprint 10.2, steps 1 and 2).
 *
 * Blueprint 10.2's text flow opens with "Normalize line endings and Unicode" and
 * "Reject empty or oversized input". Both happen here, and only here: this
 * function is called once per text message, before the text is stored on the job,
 * so nothing downstream can see an un-normalised copy of it.
 *
 * The rest of 10.2 is elsewhere. Step 3, language detection, is the model's — the
 * provider returns `language` inside the structured note rather than the
 * application guessing at it. Step 4, template selection, is
 * `input-routing.ts`. Everything after that is the generation pipeline.
 *
 * WHAT "NORMALISE" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT
 *
 * Three changes, each because something breaks without it:
 *
 *   * Line endings. Every `\r\n` and every lone `\r` becomes `\n`. A paste from a
 *     Windows application can carry either, and the renderer splits paragraphs on
 *     `/\n+/` — so a CR-separated paste would reach the reader as one unbroken
 *     paragraph rather than the several its author wrote.
 *
 *   * Unicode NFC. "Normalize Unicode" has exactly one standard meaning and this
 *     is it. It earns its place here beyond tidiness because a note records a
 *     `source_text_sha256`: without NFC, "café" typed on one keyboard and pasted
 *     from another are two different strings and hash differently, so the same
 *     note would have two identities.
 *
 *   * Trimming the ends. Leading and trailing whitespace in a message is never
 *     meaning, and leaving it would mean "empty" needs two definitions — one for
 *     the check and one for the stored value. After this, empty is `""` and
 *     nothing else. Internal whitespace is untouched: the blank line between two
 *     paragraphs is structure the author chose.
 *
 * Nothing else is altered, and the omissions are decisions rather than gaps. No
 * invisible character is stripped. `trim()` already removes a byte-order mark,
 * because the specification classifies U+FEFF as whitespace, and that is the one
 * invisible character whose removal is uncontroversial. Elsewhere the same
 * instinct would corrupt real text: U+200D and U+200C join and separate letters in
 * Devanagari, Arabic and Persian, and U+200D is what holds a multi-person emoji
 * together. U+200B survives as well, so a message containing nothing but U+200B is
 * accepted as a one-character note. That is the trade: it costs one character of
 * source text, and the alternative is a stripping list, which is a product
 * decision no part of the blueprint makes.
 *
 * The order of the three is line endings, then NFC, then trim. Only the first
 * matters: NFC and trim commute, because no whitespace character takes part in a
 * canonical composition. It is written in this order because it reads as the
 * blueprint states it.
 *
 * THE LIMIT IS CHECKED AFTER NORMALISATION, which is the blueprint's own order and
 * the permissive one: NFC can only shorten a string, so a note that is over the
 * limit in its decomposed spelling and under it in its composed spelling is
 * accepted. Blueprint 5.1's limit is 60,000 characters and Telegram caps a text
 * message at 4096, so no message can reach it today. It is live code anyway, and
 * not only because blueprint 5.1's other routes to text arrive later — a `.txt`
 * document in Phase 3, a fetched article in Phase 4. The webhook accepts a body of
 * up to 1 MiB, so a caller holding the webhook secret can hand-build an update
 * carrying far more text than Telegram would ever send, and this is what stops it
 * becoming a note.
 *
 * `MAX_SOURCE_TEXT_LENGTH` is not checked here because it is implied rather than
 * restated: it is the structural bound, this is the product bound, and this one is
 * the tighter of the two. The unit test asserts that relation, so a future edit
 * that inverted it fails rather than silently enforcing the wrong number.
 *
 * NO HASHING HAPPENS HERE. A note's `source_text_sha256` is computed where the
 * text is written, from the value being written, so the digest and the text cannot
 * disagree — carrying a digest out of this function would mean two values that are
 * equal only because every caller remembered. It would also mean `await`, and
 * `classifyUpdate` is synchronous and performs no I/O, which is what makes the
 * ingestion contract testable without a running Supabase.
 *
 * A sequencing note, so the next reader is not surprised: `empty` and `too_long`
 * are currently mapped by `parse-update.ts` onto its silent ignore reasons, which
 * is Phase 0's behaviour unchanged. `too_long` becomes a fixed reply to the user
 * once the classifier has a rejected outcome to express it with and a Telegram
 * client able to send it. The taxonomy already carries `INPUT_TOO_LONG` and the
 * sentence that reply will use.
 */

/** The canonical text, or the reason there is none. */
export type SourceTextResult =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "empty" }
  /**
   * `length` is the normalised length, which is the number the limit was applied
   * to and therefore the only number worth reporting. It is safe to log: a count
   * of characters is not user content.
   */
  | { readonly kind: "too_long"; readonly length: number };

/**
 * Reduce a raw message body to the text Notinn will store and process.
 *
 * Pure, synchronous and total. It throws for nothing and performs no I/O, so a
 * caller can neither forget an error case nor be surprised by one, and a hostile
 * body cannot make it fail in a way that becomes a 500.
 */
export function normaliseSourceText(raw: string): SourceTextResult {
  const text = raw
    // `\r\n` before a lone `\r`, so a CRLF pair becomes one `\n` rather than two.
    .replace(/\r\n?/g, "\n")
    // NFC does not throw on ill-formed UTF-16: a lone surrogate, which a
    // hand-built body can contain, passes through unchanged. Verified rather than
    // assumed, because the reverse would turn such a payload into a 500.
    .normalize("NFC")
    .trim();

  if (text === "") return { kind: "empty" };

  if (text.length > MAX_PASTED_TEXT_CHARS) {
    return { kind: "too_long", length: text.length };
  }

  return { kind: "text", text };
}
