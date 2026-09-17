import { assert, assertEquals } from "@std/assert";
import {
  ALLOWED_LOG_FIELDS,
  createCapturingLogger,
  createLogger,
  DENIED_LOG_FIELDS,
  type LogFields,
} from "../../supabase/functions/_shared/observability/logger.ts";

/**
 * The structured logger's privacy guarantees.
 *
 * Blueprint 18 requires that no log line ever contains message content,
 * extracted text, a transcript, a token, a file URL, a signed URL or a
 * credential. The mechanism is an allowlist: a field that is not named in
 * `ALLOWED_LOG_FIELDS` is not sanitised, it is dropped.
 *
 * These tests attack that mechanism from both ends. They check that every
 * deliberately-denied field really is dropped at runtime, and that the two lists
 * cannot drift into each other. A deny list would fail the first of those the
 * day somebody logged a field nobody thought to deny, and it would fail
 * silently — a leaked note looks exactly like a working system.
 */

/** A value that must never reach a log line. */
const SENSITIVE = "SYNTHETIC-USER-CONTENT-DO-NOT-LOG";

function parseLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

// --- The two lists ---------------------------------------------------------

Deno.test("no field is both allowed and denied", () => {
  const allowed = new Set<string>(ALLOWED_LOG_FIELDS);
  const overlapping = DENIED_LOG_FIELDS.filter((field) => allowed.has(field));

  assertEquals(overlapping, [], `these fields are on both lists: ${overlapping.join(", ")}`);
});

Deno.test("every denied field is dropped at runtime", () => {
  // The list is executable documentation. This is the part that makes it bind:
  // a field named there cannot be logged even by a caller who bypasses the
  // TypeScript types, which is what a plain-JavaScript or `as any` call site is.
  const { logger, lines } = createCapturingLogger();

  const fields = Object.fromEntries(
    DENIED_LOG_FIELDS.map((field) => [field, SENSITIVE]),
  ) as LogFields;

  logger.info("test.denied_fields", fields);

  assertEquals(lines.length, 1);
  const line = lines[0] as string;

  assert(!line.includes(SENSITIVE), "a denied field's value reached the log line");
  for (const field of DENIED_LOG_FIELDS) {
    assert(!line.includes(`"${field}"`), `${field} was written to the log line`);
  }

  // Dropping is recorded rather than silent, so an omission is visible.
  assertEquals(parseLine(line)["dropped_fields"], DENIED_LOG_FIELDS.length);
});

// --- Allowlisted fields ----------------------------------------------------

Deno.test("allowlisted fields are written with their values", () => {
  const { logger, lines } = createCapturingLogger();

  logger.info("message.accepted", {
    update_id: 900_000_001,
    input_type: "text",
    template_key: "clean_note",
    has_text: true,
  });

  const line = parseLine(lines[0] as string);
  assertEquals(line["event"], "message.accepted");
  assertEquals(line["level"], "info");
  assertEquals(line["update_id"], 900_000_001);
  assertEquals(line["input_type"], "text");
  assertEquals(line["template_key"], "clean_note");
  assertEquals(line["has_text"], true);
  assertEquals(line["dropped_fields"], undefined);
});

Deno.test("a field that is not on either list is dropped too", () => {
  // The allowlist is the rule; the deny list only records intent. An unknown
  // field name gets no special treatment.
  const { logger, lines } = createCapturingLogger();

  logger.info("test.unknown_field", { some_new_field: SENSITIVE } as unknown as LogFields);

  assert(!(lines[0] as string).includes(SENSITIVE));
  assertEquals(parseLine(lines[0] as string)["dropped_fields"], 1);
});

// --- Only scalars ----------------------------------------------------------

Deno.test("an object or array value is dropped, not serialised", () => {
  // Nesting is the easiest way to smuggle a payload past a flat allowlist: an
  // allowed field name with a note body inside it.
  const { logger, lines } = createCapturingLogger();

  logger.info("test.nested", {
    error_detail: { nested: SENSITIVE },
    provider_status: [SENSITIVE, SENSITIVE],
  } as unknown as LogFields);

  assert(!(lines[0] as string).includes(SENSITIVE));
  assertEquals(parseLine(lines[0] as string)["dropped_fields"], 2);
});

Deno.test("null, number and boolean values are written as they are", () => {
  const { logger, lines } = createCapturingLogger();

  logger.info("test.scalars", {
    error_code: null,
    duration_ms: 1200,
    has_text: false,
  });

  const line = parseLine(lines[0] as string);
  assertEquals(line["error_code"], null);
  assertEquals(line["duration_ms"], 1200);
  assertEquals(line["has_text"], false);
});

// --- Values are redacted as well as filtered -------------------------------

Deno.test("a credential inside a permitted field is still removed", () => {
  // The allowlist decides which fields may be written; redaction decides what a
  // permitted field may look like. Both are needed: `error_detail` is an allowed
  // name and hostile in content.
  const { logger, lines } = createCapturingLogger();

  logger.error("request.failed", {
    error_detail: "upstream rejected 123456789:AAFakeTokenValueThatIsLongEnoughToMatch",
  });

  const line = lines[0] as string;
  assert(!line.includes("AAFake"));
  assert(line.includes("[redacted]"));
});

Deno.test("a file URL in a permitted field loses its path", () => {
  const { logger, lines } = createCapturingLogger();

  logger.error("file.failed", {
    error_detail:
      "GET https://api.telegram.org/file/bot123456789:AAFakeTokenValueThatIsLongEnoughToMatch/voice/f.oga",
  });

  const line = lines[0] as string;
  assert(!line.includes("AAFake"));
  assert(!line.includes("f.oga"));
  assert(line.includes("api.telegram.org"));
});

// --- Event names -----------------------------------------------------------

Deno.test("an event name that fails the pattern is replaced", () => {
  // The event name is the one field always present. Without a pattern check a
  // caller could pass a filename as the event name and reintroduce content.
  const { logger, lines } = createCapturingLogger();

  logger.info(SENSITIVE);
  logger.info("has spaces and CAPITALS");
  logger.info("x".repeat(65));

  for (const line of lines) {
    assertEquals(parseLine(line)["event"], "log.invalid_event");
  }
  assert(!lines.join("").includes(SENSITIVE));
});

Deno.test("a well-formed dotted event name is kept", () => {
  const { logger, lines } = createCapturingLogger();

  logger.debug("webhook.delivery.received");
  assertEquals(parseLine(lines[0] as string)["event"], "webhook.delivery.received");
});

// --- Levels ----------------------------------------------------------------

Deno.test("a message below the configured floor produces nothing", () => {
  const { logger, lines } = createCapturingLogger({ level: "warn" });

  logger.debug("test.debug");
  logger.info("test.info");
  assertEquals(lines.length, 0);

  logger.warn("test.warn");
  logger.error("test.error");
  assertEquals(lines.length, 2);
});

Deno.test("the floor is exposed so callers can skip work", () => {
  const { logger } = createCapturingLogger({ level: "error" });
  assertEquals(logger.level, "error");
});

Deno.test("the level is written into the line", () => {
  const { logger, lines } = createCapturingLogger();

  logger.debug("test.d");
  logger.info("test.i");
  logger.warn("test.w");
  logger.error("test.e");

  assertEquals(lines.map((line) => parseLine(line)["level"]), ["debug", "info", "warn", "error"]);
});

// --- Context ---------------------------------------------------------------

Deno.test("the base context is attached to every line", () => {
  const { logger, lines } = createCapturingLogger({
    level: "debug",
    context: { request_id: "req_1", function_name: "telegram-webhook", environment: "local" },
  });

  logger.info("test.one");
  logger.info("test.two");

  for (const line of lines) {
    const parsed = parseLine(line);
    assertEquals(parsed["request_id"], "req_1");
    assertEquals(parsed["function_name"], "telegram-webhook");
    assertEquals(parsed["environment"], "local");
  }
});

Deno.test("a child logger adds context without losing the parent's", () => {
  const { logger, lines } = createCapturingLogger({
    level: "debug",
    context: { request_id: "req_1", environment: "local" },
  });

  const child = logger.child({ job_id: "job_1", update_id: 900_000_001 });
  child.info("job.queued");

  const parsed = parseLine(lines[0] as string);
  assertEquals(parsed["request_id"], "req_1");
  assertEquals(parsed["environment"], "local");
  assertEquals(parsed["job_id"], "job_1");
  assertEquals(parsed["update_id"], 900_000_001);
});

Deno.test("a non-allowlisted context field is dropped", () => {
  // Context is filtered by the same allowlist. A child logger is a convenient
  // place to hang a filename or a bot token without thinking.
  const { logger, lines } = createCapturingLogger({
    level: "debug",
    context: { request_id: "req_1", source_text: SENSITIVE, bot_token: SENSITIVE },
  });

  logger.info("test.context_filtering");

  const line = lines[0] as string;
  assert(!line.includes(SENSITIVE));
  assert(!line.includes("source_text"));
  assert(!line.includes("bot_token"));
  assertEquals(parseLine(line)["request_id"], "req_1");
});

Deno.test("a child shares its parent's sink and level", () => {
  const { logger, lines } = createCapturingLogger({ level: "warn" });

  const child = logger.child({ job_id: "job_1" });
  child.info("test.below_floor");
  assertEquals(lines.length, 0);

  child.warn("test.at_floor");
  assertEquals(lines.length, 1);
});

// --- Well-formedness -------------------------------------------------------

Deno.test("a line is one JSON object with an ISO timestamp, with no newline in it", () => {
  // A line that spanned lines would be read as several entries by the log drain.
  const { logger, lines } = createCapturingLogger();

  logger.info("test.shape");
  const line = lines[0] as string;

  assert(!line.includes("\n"));
  const parsed = parseLine(line);
  assertEquals(typeof parsed["timestamp"], "string");
  assertEquals(new Date(parsed["timestamp"] as string).toISOString(), parsed["timestamp"]);
});

Deno.test("the timestamp comes from the injected clock when one is given", () => {
  const { logger, lines } = createCapturingLogger({
    level: "debug",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });

  logger.info("test.clock");
  assertEquals(parseLine(lines[0] as string)["timestamp"], "2026-01-01T00:00:00.000Z");
});

// --- Logging never breaks the request it describes -------------------------

Deno.test("a sink that throws does not propagate", () => {
  const logger = createLogger({
    level: "debug",
    sink: () => {
      throw new Error("synthetic sink failure");
    },
  });

  // The assertion is that this line does not throw.
  logger.error("test.sink_failure");
});

Deno.test("a field whose accessor throws does not propagate", () => {
  const hostile = {
    get error_detail(): string {
      throw new Error("synthetic accessor failure");
    },
  } as unknown as LogFields;

  const { logger, lines } = createCapturingLogger();
  logger.error("test.accessor_failure", hostile);

  assertEquals(lines.length, 0);
});

Deno.test("the default sink writes to the console, which is what the log drain reads", () => {
  const captured: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.join(" "));
  };

  try {
    createLogger({ level: "debug" }).info("test.default_sink", { update_id: 900_000_002 });
  } finally {
    console.log = original;
  }

  assertEquals(captured.length, 1);
  assertEquals(parseLine(captured[0] as string)["event"], "test.default_sink");
});
