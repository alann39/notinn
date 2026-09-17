/**
 * Redaction: the last line of defence before a string reaches a log sink.
 *
 * The logger's field allowlist is the primary control — it decides *which*
 * values may be logged at all. This module decides what a permitted value may
 * look like once it gets there, which matters because a permitted field can
 * still carry something it should not. A `provider_request_id` field is
 * innocuous by name and hostile in content if an upstream error string is
 * pasted into it.
 *
 * The rules, in order of importance (blueprint 18):
 *
 *   1. Credentials are removed: bot tokens, service keys, JWTs, bearer tokens.
 *   2. URLs lose everything that could identify a stored object. Telegram file
 *      URLs and Supabase signed URLs are both capability-bearing: possession of
 *      the URL is authorisation to read the file.
 *   3. Long opaque runs are removed, because a value that looks like random data
 *      in a log field is far more likely to be a key than a legitimate value.
 *   4. Whitespace is collapsed and the result is truncated, so that a log line
 *      stays one line and a hostile payload cannot forge additional log entries.
 *
 * This module deliberately does not attempt to detect user content. Recognising
 * "a note about the Q3 budget" as sensitive is not a problem regexes can solve,
 * which is exactly why content must never reach a field the logger permits.
 * Redaction is the backstop, not the strategy.
 */

import { sha256Hex } from "../security/hashing.ts";

/** Replaces a removed run. Fixed width so the length of a secret is not leaked. */
const MASK = "[redacted]";

/** Length of the short correlation digests this module produces. */
const DIGEST_LENGTH = 12;

/**
 * Any run of whitespace, collapsed to a single space.
 *
 * JavaScript's `\s` already covers every character that can break a line in some
 * parser, including carriage return, line feed, tab, form feed, non-breaking
 * space, and the Unicode line and paragraph separators U+2028 and U+2029. Using
 * it avoids embedding those characters literally, which would be self-defeating:
 * U+2028 is itself a line terminator in JavaScript source, so a literal one
 * would terminate the very expression meant to match it.
 */
const WHITESPACE_RUN = /\s+/g;

/** Telegram bot tokens: an account id, a colon, then a long opaque tail. */
const TELEGRAM_BOT_TOKEN = /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g;

/** Supabase API keys, current and legacy naming. */
const SUPABASE_KEY = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}\b/g;

/** Any URL. Handled by redactUrl so the scheme and host survive for diagnosis. */
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;

/** JSON Web Tokens, including the legacy Supabase service-role key format. */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/** A bearer or basic credential presented in an Authorization-style value. */
const AUTH_SCHEME = /\b(?:bearer|basic)[ \t]+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Private key blocks, which span lines and must therefore be matched first. */
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/** A long unbroken run of base64url, hex or opaque identifier characters. */
const OPAQUE_RUN = /\b[A-Za-z0-9_-]{40,}\b/g;

export interface RedactOptions {
  /** Maximum length of the result. Defaults to 500 characters. */
  readonly maxLength?: number;
}

/**
 * Make a string safe to write to a log sink.
 *
 * Safe here means: contains no credential, no capability-bearing URL, and no
 * unbounded opaque run. It does NOT mean "contains no user content" — that
 * guarantee comes from never routing user content into a loggable field.
 */
export function redactText(input: string, options: RedactOptions = {}): string {
  const maxLength = options.maxLength ?? 500;

  let output = input
    .replace(PRIVATE_KEY_BLOCK, MASK)
    .replace(JWT, MASK)
    .replace(TELEGRAM_BOT_TOKEN, MASK)
    .replace(SUPABASE_KEY, MASK)
    .replace(AUTH_SCHEME, MASK)
    .replace(URL_PATTERN, (match) => redactUrl(match))
    .replace(OPAQUE_RUN, MASK);

  // Collapsing whitespace is what stops a hostile value forging log entries.
  output = output.replace(WHITESPACE_RUN, " ").trim();

  if (output.length > maxLength) {
    output = `${output.slice(0, maxLength)}…[truncated ${output.length - maxLength} chars]`;
  }

  return output;
}

/**
 * Reduce a URL to its scheme and host.
 *
 * Path and query are dropped wholesale rather than filtered by parameter name,
 * because the set of parameters that carry capability changes with every storage
 * provider and signed-URL scheme. Dropping everything after the host is the only
 * rule that stays correct.
 */
function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}/[redacted]`;
  } catch {
    // Not parseable as a URL. It is still URL-shaped, so it still goes.
    return "[redacted-url]";
  }
}

/**
 * A stable, non-reversible short digest of a value.
 *
 * Used where an operator needs to correlate two log lines that mention the same
 * identifier without the identifier itself being written down. Digests of
 * low-entropy values are guessable, so this is only appropriate for values that
 * are already long and random, such as a secret or a file id.
 */
export async function digestForLogging(value: string): Promise<string> {
  return (await sha256Hex(value)).slice(0, DIGEST_LENGTH);
}

/** Exposed for the redaction tests, which assert each rule independently. */
export const REDACTION_PATTERNS = {
  TELEGRAM_BOT_TOKEN,
  SUPABASE_KEY,
  URL_PATTERN,
  JWT,
  AUTH_SCHEME,
  PRIVATE_KEY_BLOCK,
  OPAQUE_RUN,
  MASK,
} as const;
