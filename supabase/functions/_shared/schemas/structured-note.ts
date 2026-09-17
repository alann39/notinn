import { z } from "zod";
import { SOURCE_REFERENCE_KINDS } from "../config/constants.ts";

/**
 * The structured note contract (blueprint 12.4) and its validation.
 *
 * Blueprint 12.4 defines one output shape and eleven templates that vary the
 * instructions rather than the shape. This module is the authority on that shape:
 * every persisted `note_outputs.content_json` has passed through
 * `parseStructuredNote` below, which is what blueprint 25's "every persisted output
 * passes the schema" is enforced by.
 *
 * There is a second copy of this contract, and it is deliberate. Migration
 * `20260917123607_phase1_template_schemas.sql` writes a JSON Schema onto every
 * system template, and that copy is what the provider is handed as
 * `responseJsonSchema`. The two are not redundant:
 *
 *   * The JSON Schema constrains the model at generation time, which is cheap and
 *     catches most deviations before they cost a round trip. It is written in the
 *     JSON Schema subset Gemini accepts. It deliberately omits bounds that are
 *     better enforced by the application after generation.
 *
 *   * This schema is what the application believes. It runs on the way in, it
 *     enforces the bounds the provider's dialect cannot express, and it is the
 *     only one of the two that can reject something.
 *
 * `tests/contract/structured-note-schema.test.ts` asserts the two agree on the
 * field set and on the tag limit, so the weaker copy cannot drift away from the
 * stronger one without a failure.
 *
 * A note on what validation does NOT do: it never repairs. A missing title, an
 * out-of-range confidence or a date that is not a date fails the whole output and
 * produces no note. Repairing would be easy — substitute a title, clamp the
 * number, drop the bad item — and it would make the schema a comment rather than
 * a control: the database would then contain rows that no reader can trust, and
 * the schema's own claim, that every persisted output passes it, would be false.
 * The remedy for a malformed generation is to generate again, which is what
 * Phase 2's retry is for.
 */

/** Names the contract in `templates.schema_json.contract`. */
export const STRUCTURED_NOTE_CONTRACT = "structured_note";

/** The version of the contract above. Stored per note output. */
export const STRUCTURED_NOTE_VERSION = 1;

/**
 * Every field of the contract, in blueprint 12.4's order.
 *
 * All eleven are required: the contract lists no optional field, and a model that
 * omits one has not answered the question it was asked. An empty array is the
 * correct way to say "the source had none of these", which is why the arrays are
 * required but may be empty.
 */
export const STRUCTURED_NOTE_FIELDS = [
  "title",
  "language",
  "template_key",
  "summary",
  "sections",
  "key_points",
  "action_items",
  "decisions",
  "tags",
  "uncertainties",
  "source_references",
] as const;

export type StructuredNoteField = (typeof STRUCTURED_NOTE_FIELDS)[number];

// --- Bounds -----------------------------------------------------------------
//
// Blueprint 12.4 requires that "model-generated tags must pass length and count
// limits", and the spirit of that rule is the reason for every number here: a
// misbehaving model must not be able to write an arbitrarily large object into
// `note_outputs.content_json`. Each bound is generous enough that a legitimate
// note never meets it, and low enough that the worst case is bounded.
//
// `MAX_NOTE_TAGS` is the exception in kind: it is the only one the provider is
// also told about, through `maxItems` in the stored JSON Schema, because a model
// that knows the limit rarely exceeds it.

/** Caps the tag array. Mirrored as `maxItems` in the stored JSON Schema. */
export const MAX_NOTE_TAGS = 12;

/** Each tag is one or two words; this is the guard against a tag being a sentence. */
const MAX_TAG_CHARS = 40;

/** Matches `notes.title`'s own constraint: at most 300 characters and not blank. */
const MAX_TITLE_CHARS = 300;

/**
 * Matches `notes.language`'s check constraint exactly.
 *
 * The database refuses a language tag that does not match this, and a refusal at
 * the constraint is a 23514 that reaches an operator as an opaque database error.
 * Validating here converts that into a validation failure that names the field.
 */
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** `YYYY-MM-DD`, the only date form the contract admits. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MAX_SUMMARY_CHARS = 8_000;
const MAX_SECTIONS = 40;
const MAX_SECTION_HEADING_CHARS = 200;
const MAX_SECTION_CONTENT_CHARS = 20_000;
const MAX_LIST_ITEMS = 50;
const MAX_LIST_ITEM_CHARS = 1_000;
const MAX_ACTION_TASK_CHARS = 500;
const MAX_ATTRIBUTION_CHARS = 120;
const MAX_SOURCE_REFERENCE_CHARS = 120;

// --- Building blocks --------------------------------------------------------

/**
 * A required string that carries meaning, so an empty one is a failure.
 *
 * Trimmed first: a model that returns `"  "` has returned nothing, and saying so
 * is more honest than storing whitespace that renders as a blank line.
 */
function meaningfulText(maxChars: number): z.ZodString {
  return z.string().trim().min(1).max(maxChars);
}

/**
 * An optional string, where empty means null.
 *
 * Blueprint 12.4's first rule is that "unknown values are null, never
 * fabricated". A model that cannot find an owner has two ways to say so, and
 * `""` is the common one — it is an empty value, not a value of zero length.
 * Normalising it to null enforces the contract rule rather than bending it, which
 * is why this transform is allowed where repairing a missing title is not.
 */
function optionalText(maxChars: number) {
  return z
    .string()
    .trim()
    .max(maxChars)
    .transform((value) => (value === "" ? null : value))
    .nullable();
}

/**
 * A calendar date, not merely a date-shaped string.
 *
 * The pattern alone would admit `2026-02-30` and `9999-99-99`. Round-tripping
 * through `Date` rejects both, and the check is done on the parsed parts rather
 * than on the timestamp so that no timezone can move the day.
 */
const isoDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine(
    (value) => value === null || isoDateComponentsAreReal(value),
    { message: "not a calendar date" },
  );

function isoDateComponentsAreReal(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;

  // Day 0 of the following month is the last day of this one, which handles
  // February in a leap year without a table.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const section = z.object({
  heading: meaningfulText(MAX_SECTION_HEADING_CHARS),
  // Empty is permitted: a heading with no body under it is a legitimate shape for
  // a source that mentions a topic and says nothing about it.
  content: z.string().trim().max(MAX_SECTION_CONTENT_CHARS),
});

const actionItem = z.object({
  task: meaningfulText(MAX_ACTION_TASK_CHARS),
  owner: optionalText(MAX_ATTRIBUTION_CHARS),
  due_date_text: optionalText(MAX_ATTRIBUTION_CHARS),
  due_date_iso: isoDate,
  // Blueprint 12.4: "Confidence values are optional product signals, not factual
  // guarantees." Optional in meaning, present in the payload — the provider
  // schema requires the key, and a missing one is a deviation worth reporting.
  confidence: z.number().min(0).max(1),
});

const sourceReference = z.object({
  type: z.enum(SOURCE_REFERENCE_KINDS),
  value: meaningfulText(MAX_SOURCE_REFERENCE_CHARS),
});

/**
 * The contract itself.
 *
 * Unknown keys are stripped rather than rejected. The object is stored as
 * `content_json`, and blueprints 13 and 14 describe consumers reading named fields
 * from it, so an extra key is inert noise rather than corruption. Losing a usable
 * note over an unexpected extra field would be the wrong trade.
 */
export const StructuredNoteSchema = z.object({
  title: meaningfulText(MAX_TITLE_CHARS),
  language: z.string().trim().toLowerCase().regex(LANGUAGE_PATTERN),
  template_key: meaningfulText(200),
  summary: z.string().trim().max(MAX_SUMMARY_CHARS),
  sections: z.array(section).max(MAX_SECTIONS),
  key_points: z.array(meaningfulText(MAX_LIST_ITEM_CHARS)).max(MAX_LIST_ITEMS),
  action_items: z.array(actionItem).max(MAX_LIST_ITEMS),
  decisions: z.array(meaningfulText(MAX_LIST_ITEM_CHARS)).max(MAX_LIST_ITEMS),
  tags: z
    .array(meaningfulText(MAX_TAG_CHARS).toLowerCase())
    .max(MAX_NOTE_TAGS)
    // A repeated tag is not a validation failure, it is a model being redundant.
    // Deduplicating keeps "the note's distinct topics" true of the stored array.
    .transform((tags) => [...new Set(tags)]),
  uncertainties: z.array(meaningfulText(MAX_LIST_ITEM_CHARS)).max(MAX_LIST_ITEMS),
  source_references: z.array(sourceReference).max(MAX_LIST_ITEMS),
});

export type StructuredNote = z.infer<typeof StructuredNoteSchema>;

/**
 * Describe a Zod failure without reproducing any of the offending values.
 *
 * Only the path and the issue code are kept. Zod's human-readable messages are
 * perfect for a developer and wrong for this purpose: some of them quote the
 * received value, and `internalDetail` is a field that ends up in a log line. A
 * detail that names *which* field failed and never *what* was in it is content-free
 * by construction rather than by redaction.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 20)
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.code}`;
    })
    .join("; ");
}

/**
 * Validate a provider's answer against the contract.
 *
 * Returns the narrowed note, or throws a classified error whose detail names the
 * failing fields. See the module comment for why this repairs nothing.
 */
export function parseStructuredNote(
  value: unknown,
  fail: (internalDetail: string) => Error,
): StructuredNote {
  const result = StructuredNoteSchema.safeParse(value);

  if (!result.success) {
    throw fail(describeIssues(result.error));
  }

  return result.data;
}
