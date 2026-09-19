import {
  TELEGRAM_MAX_CALLBACK_DATA_BYTES,
  TEMPLATE_KEY_PATTERN,
  type TemplateKey,
} from "../config/constants.ts";
import { AppError } from "../errors/app-error.ts";

/**
 * The callback payload contract (blueprint 17.4) and its codec.
 *
 * Blueprint 17.4 fixes the form:
 *
 *     v1:action:opaque_resource_id:revision
 *
 * Four segments, colon-separated, always all four. The `v1` prefix is what lets a
 * second shape exist later without guessing which one a payload is: a malformed
 * or unknown prefix is rejected rather than reinterpreted, which is the only
 * property that makes a version field worth carrying.
 *
 * THE ENCODING IS NOT A SECURITY CONTROL, and the module is arranged so that
 * nobody mistakes it for one. Base64url-ing a UUID hides nothing — it is a
 * reversible encoding of a value that is already unguessable. Blueprint 18.2's
 * "opaque IDs" control is satisfied by the id being a random UUID rather than a
 * sequence, and blueprint 17.4's actual protections are the four steps it lists:
 * resolve the sender to an internal user, verify ownership of the resource, verify
 * the revision where staleness is harmful, and answer the callback promptly even
 * when it fails. The ownership check is what stops a user acting on someone else's
 * note, and it is enforced in the service, not here.
 *
 * WHY THE RESOURCE ID IS ENCODED RATHER THAN WRITTEN OUT. Telegram caps
 * `callback_data` at 64 bytes, and the plain reading of the contract does not fit:
 *
 *     v1:format.extract_and_summarize:8f4c1e2a-…-9b7d:0   → 70 bytes
 *
 * A UUID costs 36 characters and the longest template action costs 28
 * (`format.extract_and_summarize`), so the human-readable half of the payload is
 * what has to give. Encoding the resource as the 22-character base64url of the
 * UUID's 16 bytes buys enough room for the action names to stay words
 * (`format.short_summary`) rather than becoming indices, which is worth more than
 * it sounds: an operator reading a log line can tell what a user clicked without a
 * lookup table.
 *
 * The worst case after encoding is 61 bytes — the longest template action, a
 * 22-character resource and the largest revision the decoder accepts (`999999`,
 * six digits) — which leaves three bytes of headroom against the cap. That is
 * tight enough to be worth stating as a number: a template key two characters
 * longer than `extract_and_summarize` would break it. The test below iterates the
 * real vocabulary at that revision rather than trusting this paragraph, so a key
 * that no longer fits fails there rather than at the Bot API.
 *
 * `encodeCallbackPayload` asserts the budget, so a future action name or template
 * key that would not fit fails a test rather than the Bot API.
 */

/** The only contract version this module writes or accepts. */
const VERSION = "v1";

const SEPARATOR = ":";

/** The four fields, no more and no fewer. */
const SEGMENT_COUNT = 4;

/**
 * The inline actions Phase 1 can decode.
 *
 * This is a subset of the inline actions blueprint 7.5 requires, on purpose and on
 * the record. Phase 1 delivers Save/Unsave, Shorter, More detailed, Change format
 * and Delete. The rest are deferred with the phase that takes them:
 *
 *   * Show transcript/extracted text — Phase 2, where "Transcript review" is a
 *     named deliverable. For a text note the "extracted text" is the message the
 *     user is looking at, so a button to show it back to them would be a button
 *     that does nothing useful.
 *   * Retry — Phase 2, which owns retry and recovery.
 *   * Report issue — Phase 6, which owns the support workflow.
 *
 * `show` is not one of 7.5's actions; it is what `/recent`'s entries need in order
 * to be more than a list of titles. It re-renders the note's current output and
 * changes nothing.
 *
 * Save/Unsave, Shorter, More detailed and Change format are all button-only
 * additions: each reuses the generation path that `regenerate` already needs, so
 * the marginal cost is a button and a prompt variant rather than a second
 * pipeline. That is why they are here despite Phase 1's deliverable list naming
 * only "Save, regenerate, recent, and delete" — a deliverable list is a floor.
 *
 * See docs/ADR/0007-phase-1-scope.md.
 */
export const CALLBACK_ACTIONS = [
  "save",
  "unsave",
  "shorter",
  "detailed",
  "delete",
  "delete_confirm",
  "cancel_delete",
  "show",
  "export_md",
  "export_txt",
  "export_pdf",
] as const;

export type SimpleCallbackAction = (typeof CALLBACK_ACTIONS)[number];

/** The prefix that distinguishes a format change from the actions above. */
const FORMAT_PREFIX = "format.";

export type CallbackAction =
  | { readonly kind: SimpleCallbackAction }
  | { readonly kind: "format"; readonly templateKey: TemplateKey };

export interface CallbackPayload {
  readonly action: CallbackAction;
  /**
   * The resource the action applies to — a note id in Phase 1.
   *
   * Named after blueprint 17.4's `opaque_resource_id` rather than `note_id`
   * because Phase 2 introduces job-scoped actions and the segment means the same
   * thing there.
   */
  readonly resourceId: string;
  /**
   * Blueprint 17.4's `revision`.
   *
   * Phase 1 always writes 0, and the decoder requires the field but does not act
   * on its value. That is a statement about Phase 1, not a placeholder: every
   * action above is either note-scoped or idempotent, so no click can be harmful
   * merely for being old. Clicking Save on a message from last week saves the note
   * it belongs to, which is what the user meant. Revision gains meaning in Phase 2,
   * where Retry targets a job and a stale click would re-run something that has
   * since completed.
   */
  readonly revision: number;
}

// --- The resource id --------------------------------------------------------

/**
 * A UUID's 16 bytes as 22 unpadded base64url characters.
 *
 * Base64url rather than base64 because Telegram accepts the payload as an opaque
 * string, and `+`, `/` and `=` in a value that travels through URLs invites
 * escaping bugs that only appear in production.
 */
function encodeResourceId(uuid: string): string {
  const bytes = uuidBytes(uuid);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeResourceId(encoded: string): string {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw AppError.validation("callback resource id is not base64url");
  }

  if (binary.length !== 16) {
    throw AppError.validation("callback resource id is not 16 bytes");
  }

  const hex = [...binary].map((char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** The 16 bytes of a canonical UUID. Rejects anything that is not one. */
function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "").toLowerCase();

  if (hex.length !== 32 || !/^[0-9a-f]{32}$/.test(hex)) {
    throw AppError.validation("callback resource id is not a UUID");
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

// --- The action -------------------------------------------------------------

function encodeAction(action: CallbackAction): string {
  return action.kind === "format" ? `${FORMAT_PREFIX}${action.templateKey}` : action.kind;
}

function decodeAction(token: string): CallbackAction {
  if (token.startsWith(FORMAT_PREFIX)) {
    const key = token.slice(FORMAT_PREFIX.length);
    if (!TEMPLATE_KEY_PATTERN.test(key)) {
      throw AppError.validation("callback names an invalid template key");
    }
    return { kind: "format", templateKey: key };
  }

  if (!(CALLBACK_ACTIONS as readonly string[]).includes(token)) {
    throw AppError.validation(`callback names unknown action "${token}"`);
  }

  return { kind: token as SimpleCallbackAction };
}

/** The action as it appears in a payload, and as it is logged. */
export function actionToken(action: CallbackAction): string {
  return encodeAction(action);
}

// --- The codec --------------------------------------------------------------

/**
 * Render a payload for `callback_data`.
 *
 * Throws rather than truncating if the result would not fit Telegram's limit. A
 * truncated payload would decode to a different action or a different resource,
 * which is the worst possible failure: it would act on the wrong note.
 */
export function encodeCallbackPayload(payload: CallbackPayload): string {
  const encoded = [
    VERSION,
    encodeAction(payload.action),
    encodeResourceId(payload.resourceId),
    String(payload.revision),
  ].join(SEPARATOR);

  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > TELEGRAM_MAX_CALLBACK_DATA_BYTES) {
    throw AppError.internal(
      `callback payload is ${byteLength} bytes, over the ` +
        `${TELEGRAM_MAX_CALLBACK_DATA_BYTES}-byte limit: ${encoded.length} characters`,
    );
  }

  return encoded;
}

/**
 * Parse `callback_data` into an action.
 *
 * Total over a closed vocabulary: anything unrecognised throws a validation
 * error. It never returns a partial payload and never guesses, because the caller
 * is a database write — `save`, `delete` — and a guess is how a button for one
 * note ends up acting on another.
 */
export function decodeCallbackPayload(value: string): CallbackPayload {
  const segments = value.split(SEPARATOR);

  if (segments.length !== SEGMENT_COUNT) {
    throw AppError.validation(
      `callback has ${segments.length} segments, expected ${SEGMENT_COUNT}`,
    );
  }

  const [version, actionTokenValue, resourceToken, revisionToken] = segments as [
    string,
    string,
    string,
    string,
  ];

  if (version !== VERSION) {
    throw AppError.validation(`callback version "${version}" is not supported`);
  }

  if (!/^\d{1,6}$/.test(revisionToken)) {
    throw AppError.validation("callback revision is not a small non-negative integer");
  }

  return {
    action: decodeAction(actionTokenValue),
    resourceId: decodeResourceId(resourceToken),
    revision: Number.parseInt(revisionToken, 10),
  };
}

/**
 * Parse `callback_data` without throwing, for paths that must not fail.
 *
 * Returns null for anything malformed. The webhook uses the throwing form, since a
 * malformed payload is worth a log line; this exists for tests and for callers
 * that treat "not ours" and "unparseable" alike.
 */
export function tryDecodeCallbackPayload(value: string): CallbackPayload | null {
  try {
    return decodeCallbackPayload(value);
  } catch {
    return null;
  }
}
