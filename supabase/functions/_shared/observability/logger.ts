import { LOG_LEVEL_RANK, type LogLevel } from "./levels.ts";
import { redactText } from "./redaction.ts";

/**
 * Structured logging with a field allowlist.
 *
 * The requirement (blueprint 18) is that no log line ever contains message
 * content, extracted text, a transcript, a token, a file URL, a signed URL or a
 * credential. There are two ways to attempt that. The usual one is a deny list:
 * log whatever you like, and strip the bad things. It fails the first time
 * somebody logs a field nobody thought to deny, and it fails silently — a leaked
 * note looks exactly like a working system.
 *
 * This module inverts the rule. `ALLOWED_LOG_FIELDS` names every field that may
 * ever be written. A field that is not on the list is not sanitised, it is
 * **dropped**, and the line records how many fields were dropped so the omission
 * is visible rather than invisible. Content has no route to a log sink: there is
 * no field name it could arrive under.
 *
 * Two further constraints close the obvious gaps in that:
 *
 *   * Only scalars are accepted. An object or array value is dropped, because
 *     nesting is the easiest way to smuggle a payload past a flat allowlist.
 *
 *   * The event name is pattern-checked. Without that, a caller could pass a
 *     filename as the event name and reintroduce content through the one field
 *     that is always present.
 *
 * Logging never throws. A failure to log must not become a failure to serve.
 */

/**
 * Every field the application may write to a log.
 *
 * Adding to this list is a privacy decision, not a formatting decision. The
 * `DENIED_LOG_FIELDS` list below records what was deliberately left out and why;
 * the security tests assert both.
 */
export const ALLOWED_LOG_FIELDS = [
  // --- Correlation ---------------------------------------------------------
  "request_id",
  "correlation_id",
  "update_id",
  "job_id",
  "user_id",
  "note_id",
  "message_id",

  // --- Telegram message metadata (never message content) -------------------
  "telegram_user_id",
  "chat_id",
  "update_type",
  "has_text",
  "media_kind",

  // --- Job and routing -----------------------------------------------------
  "template_key",
  "input_type",
  "job_state",
  "from_state",
  "to_state",
  "outcome",
  "generation_reason",
  /**
   * The inline action that was clicked, from the closed vocabulary in
   * _shared/schemas/callback.ts (Phase 1).
   *
   * Safe to allow because the value is never user input: the decoder only ever
   * yields a member of an application-owned union, and an unrecognised token is
   * rejected before it reaches a logger. It is what makes blueprint 21.2's
   * "callback" behaviour countable without recording anything a user typed.
   */
  "callback_action",

  // --- Request and response shape ------------------------------------------
  "method",
  "route",
  "status",
  "http_status",
  "duration_ms",
  "attempt",
  "attempt_count",

  // --- Payload measurements (sizes, never contents) ------------------------
  "size_bytes",
  "duration_seconds",
  "char_length",
  "byte_length",
  "count",
  "page_count",
  "input_tokens",
  "output_tokens",

  // --- Upstream ------------------------------------------------------------
  "provider",
  "model",
  "operation",
  "provider_status",

  // --- Errors --------------------------------------------------------------
  "error_code",
  "error_name",
  "error_detail",

  // --- Runtime -------------------------------------------------------------
  "environment",
  "function_name",
  "release",
  "region",
  "reason",
  "source",
] as const;

export type LogField = (typeof ALLOWED_LOG_FIELDS)[number];

/**
 * Fields that must never be added to the allowlist.
 *
 * Kept as executable documentation so that a future change that tries to log one
 * fails a test rather than a privacy review. Each entry names a real field that
 * exists elsewhere in the system.
 */
export const DENIED_LOG_FIELDS = [
  // User content, in every form it takes.
  "source_text",
  "normalized_source_text",
  "content_json",
  "rendered_text",
  "transcript",
  "extracted_text",
  "title",
  "note_title",
  "prompt",
  "completion",

  // Filenames and profile fields are user-chosen and routinely sensitive.
  "original_filename",
  "display_name",
  "telegram_username",

  // Credentials.
  "bot_token",
  "telegram_bot_token",
  "service_role_key",
  "supabase_service_role_key",
  "webhook_secret",
  "telegram_webhook_secret",
  "api_key",
  "gemini_api_key",
  "authorization",

  // Capability-bearing values: possession of any of these is read access.
  "telegram_file_id",
  "telegram_file_unique_id",
  "file_url",
  "signed_url",
  "storage_path",
  "download_url",
] as const;

const ALLOWED_SET: ReadonlySet<string> = new Set<string>(ALLOWED_LOG_FIELDS);

/** A scalar that survived the allowlist. */
export type LogValue = string | number | boolean | null;

export type LogFields = Partial<Record<LogField, LogValue>>;

export interface LogContext {
  readonly request_id?: string;
  readonly function_name?: string;
  readonly environment?: string;
  readonly release?: string;
  readonly region?: string;
  readonly [key: string]: LogValue | undefined;
}

/** Where finished log lines go. Injectable so tests can capture them. */
export type LogSink = (line: string) => void;

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly context?: LogContext;
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** A logger carrying additional fixed context, sharing the same sink. */
  child(extra: LogContext): Logger;
  /** The level floor this logger is filtering at. */
  readonly level: LogLevel;
}

/** Event names are dotted lower-case identifiers. Nothing else is accepted. */
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;

/** Used when a caller supplies an event name that fails the pattern. */
const FALLBACK_EVENT = "log.invalid_event";

function defaultSink(line: string): void {
  // stdout is what the Supabase log drain collects.
  console.log(line);
}

/**
 * Reduce a caller-supplied field map to the allowlisted, redacted scalars.
 *
 * Returns the surviving fields and the number dropped, so that dropping is
 * recorded rather than silent.
 */
function filterFields(fields: LogFields | undefined): {
  kept: Record<string, LogValue>;
  dropped: number;
} {
  const kept: Record<string, LogValue> = {};
  if (fields === undefined) return { kept, dropped: 0 };

  let dropped = 0;

  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_SET.has(key)) {
      dropped += 1;
      continue;
    }

    if (value === null || typeof value === "number" || typeof value === "boolean") {
      kept[key] = value;
      continue;
    }

    if (typeof value === "string") {
      kept[key] = redactText(value);
      continue;
    }

    // Objects, arrays, functions: never. Nesting is a content channel.
    dropped += 1;
  }

  return { kept, dropped };
}

function filterContext(context: LogContext | undefined): Record<string, LogValue> {
  const kept: Record<string, LogValue> = {};
  if (context === undefined) return kept;

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    if (!ALLOWED_SET.has(key)) continue;

    if (typeof value === "string") {
      kept[key] = redactText(value);
      continue;
    }
    kept[key] = value;
  }

  return kept;
}

export function createLogger(options: LoggerOptions): Logger {
  const { level, context, sink = defaultSink, now = () => new Date() } = options;
  const floor = LOG_LEVEL_RANK[level];
  const baseContext = filterContext(context);

  function emit(eventLevel: LogLevel, event: string, fields?: LogFields): void {
    if (LOG_LEVEL_RANK[eventLevel] < floor) return;

    try {
      const eventName = EVENT_NAME_PATTERN.test(event) && event.length <= 64
        ? event
        : FALLBACK_EVENT;

      const { kept, dropped } = filterFields(fields);

      const line = JSON.stringify({
        timestamp: now().toISOString(),
        level: eventLevel,
        event: eventName,
        ...baseContext,
        ...kept,
        ...(dropped > 0 ? { dropped_fields: dropped } : {}),
      });

      sink(line);
    } catch {
      // Logging must never break the request it is describing.
    }
  }

  return {
    level,
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    child: (extra) =>
      createLogger({
        level,
        context: { ...baseContext, ...filterContext(extra) },
        sink,
        now,
      }),
  };
}

/**
 * A logger that records lines in memory.
 *
 * Used by tests to assert what would have been written. This is the mechanism
 * behind the "no user content in logs" security test: a full request is run with
 * content present, and the captured lines are searched for every fragment of it.
 */
export function createCapturingLogger(
  options: Omit<LoggerOptions, "sink"> = { level: "debug" },
): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger({ ...options, sink: (line) => lines.push(line) });
  return { logger, lines };
}
