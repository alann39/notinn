import {
  type InputType,
  SYSTEM_TEMPLATE_KEYS,
  type SystemTemplateKey,
} from "../config/constants.ts";

/**
 * Default template routing, transcribed from blueprint 6.3.
 *
 * The blueprint's table is:
 *
 *   | Input                | Default                                          |
 *   | Pasted text          | Clean Note                                       |
 *   | Forwarded message    | Short Summary                                    |
 *   | Voice note/audio     | Meeting Notes if meeting-like, otherwise Clean   |
 *   | Screenshot/photo     | Extract & Summarize                              |
 *   | PDF/DOCX             | Detailed Summary                                 |
 *
 * Two rows needed a decision that the table does not make, and both are
 * recorded in docs/ADR/0001-blueprint-deviations.md:
 *
 *   1. "Meeting Notes if meeting-like" requires a judgement about the content of
 *      a recording. Nothing is transcribed before Phase 2, and Meeting Notes is
 *      itself a Phase 2 deliverable (blueprint 25), so the table's own fallback —
 *      "otherwise Clean Note" — is what every phase through Phase 1 uses. The
 *      heuristic arrives with transcription in Phase 2 and judges the transcript,
 *      which is the only real evidence of what a recording is.
 *
 *   2. TXT and Markdown appear in the blueprint's supported input list but not
 *      in the routing table. They are text documents, and the table's closest
 *      row is "Pasted text → Clean Note", so they route there.
 */

/**
 * Why a routing decision was made.
 *
 * Every input type is its own reason; the only routing decision that depends on
 * something other than the input type is a forwarded message.
 */
export type RoutingReason = InputType | "forwarded_text";

export interface RoutingDecision {
  readonly inputType: InputType;
  readonly templateKey: SystemTemplateKey;
  readonly reason: RoutingReason;
}

/**
 * Default template per input type.
 *
 * Keys are checked against the catalogue at construction, so a typo here is a
 * startup failure rather than a foreign-key violation on a user's first note.
 */
const DEFAULT_TEMPLATE_BY_INPUT_TYPE: Readonly<Record<InputType, SystemTemplateKey>> = {
  text: "clean_note",
  voice: "clean_note",
  audio: "clean_note",
  image: "extract_and_summarize",
  pdf: "detailed_summary",
  docx: "detailed_summary",
  txt: "clean_note",
  md: "clean_note",
};

/**
 * The template a forwarded message uses instead of the default for its type.
 *
 * Applied only to forwarded text. A forwarded photograph is still a photograph,
 * and 6.3 routes it by what it is rather than by how it arrived.
 */
const FORWARDED_TEXT_TEMPLATE: SystemTemplateKey = "short_summary";

/** MIME types Notinn accepts as documents, mapped to their input type. */
const DOCUMENT_MIME_TO_INPUT_TYPE: Readonly<Record<string, InputType>> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  // Some clients label Markdown this way.
  "text/x-markdown": "md",
};

/**
 * Fallback for a document whose `mime_type` is missing or unhelpful.
 *
 * Telegram omits `mime_type` for some uploads, so the filename extension is the
 * second signal. It is only ever a fallback: an extension is chosen by the
 * sender and cannot be trusted when a MIME type is available.
 */
const DOCUMENT_EXTENSION_TO_INPUT_TYPE: Readonly<Record<string, InputType>> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  md: "md",
  markdown: "md",
};

/**
 * Resolve a document to an input type.
 *
 * Returns null when the document is of a kind Notinn does not handle, which the
 * caller turns into a documented ignore rather than an error.
 */
export function documentInputType(
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): InputType | null {
  if (typeof mimeType === "string" && mimeType !== "") {
    // Strip any parameters, as in "text/plain; charset=utf-8".
    const bare = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    const byMime = DOCUMENT_MIME_TO_INPUT_TYPE[bare];
    if (byMime !== undefined) return byMime;
  }

  if (typeof fileName === "string" && fileName !== "") {
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const byExtension = DOCUMENT_EXTENSION_TO_INPUT_TYPE[extension];
    if (byExtension !== undefined) return byExtension;
  }

  return null;
}

/**
 * The default template for an input type.
 *
 * Transcription of blueprint 6.3's Default column, with the two documented
 * inferences described at the top of this file.
 */
export function defaultTemplateFor(inputType: InputType, forwarded = false): SystemTemplateKey {
  if (forwarded && inputType === "text") {
    return FORWARDED_TEXT_TEMPLATE;
  }
  return DEFAULT_TEMPLATE_BY_INPUT_TYPE[inputType];
}

/** The reason label for a routing decision, used in logs and tests. */
export function routingReasonFor(inputType: InputType, forwarded = false): RoutingReason {
  if (forwarded && inputType === "text") return "forwarded_text";
  return inputType;
}

/** Build a routing decision in one step. */
export function routeInput(inputType: InputType, forwarded = false): RoutingDecision {
  return {
    inputType,
    templateKey: defaultTemplateFor(inputType, forwarded),
    reason: routingReasonFor(inputType, forwarded),
  };
}

/**
 * Assert that every template this module can produce exists in the catalogue.
 *
 * Called by the contract tests. A routing table that names a template the
 * database does not have would fail at the foreign key on a user's first
 * message, which is the wrong place to discover a typo.
 */
export function unknownTemplateKeys(): readonly string[] {
  const catalogue = new Set<string>(SYSTEM_TEMPLATE_KEYS);
  const referenced = new Set<string>([
    ...Object.values(DEFAULT_TEMPLATE_BY_INPUT_TYPE),
    FORWARDED_TEXT_TEMPLATE,
  ]);

  return [...referenced].filter((key) => !catalogue.has(key));
}
