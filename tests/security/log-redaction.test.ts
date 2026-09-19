import { assertEquals } from "@std/assert";
import { createClient } from "@supabase/supabase-js";
import { loadWebhookConfig } from "../../supabase/functions/_shared/config/env.ts";
import { TELEGRAM_SECRET_HEADER } from "../../supabase/functions/_shared/config/constants.ts";
import { classifyPostgresError } from "../../supabase/functions/_shared/repositories/postgres-errors.ts";
import { IngestionRepository } from "../../supabase/functions/_shared/repositories/ingestion.repository.ts";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import { handleWebhookRequest } from "../../supabase/functions/_shared/telegram/handler.ts";
import {
  channelPostUpdate,
  documentUpdate,
  photoUpdate,
  textUpdate,
  unsupportedContentUpdate,
  voiceUpdate,
} from "../fixtures/telegram/builders.ts";

/**
 * The privacy guarantee, asserted against a running request.
 *
 * Phase 0 exit criterion 5 is that no user content and no secret appears in a
 * log. The allowlist in `observability/logger.ts` is the mechanism; this test is
 * the evidence, and it works by running a complete delivery through the real
 * handler, the real service and the real repository with distinctive bytes
 * planted in every user-controlled field, then searching every captured log line
 * for every one of them.
 *
 * The planted values are markers rather than plausible text on purpose. A
 * fragment like `MARKER_TEXT_...` cannot collide with an identifier, a template
 * key or a state name, so a match is unambiguously the user's bytes rather than
 * a coincidence. Each site gets its own marker, so a failure names the field
 * that leaked instead of only reporting that something did.
 *
 * The tests assert in both directions. Proving the markers are absent is only
 * meaningful if the log lines are populated — an implementation that logged
 * nothing would satisfy a one-directional test perfectly while breaking
 * observability. So every case also asserts that the expected safe fields are
 * present.
 */

const SUPABASE_URL = "https://synthetic.supabase.co";
const SERVICE_ROLE_KEY = "synthetic_service_role_key_abcdefghijklmnop";
const WEBHOOK_SECRET = "synthetic_webhook_secret_value";
const BOT_TOKEN = "123456789:AAFakeTokenValueThatIsLongEnoughToMatch";
const GEMINI_API_KEY = "synthetic-gemini-api-key-value";
const GEMINI_MODEL = "gemini-synthetic-flash";
const INTERNAL_WORKER_SECRET = "synthetic-internal-worker-secret-value";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Every distinct piece of user content planted in a request, keyed by where it
 * is planted. A leak reports the key.
 */
const MARKERS = {
  text: "MARKERTEXT_aardvark_should_never_be_logged",
  caption: "MARKERCAPTION_beluga_should_never_be_logged",
  firstName: "MARKERFIRSTNAME_capybara",
  lastName: "MARKERLASTNAME_dromedary",
  username: "MARKERUSERNAME_echidna",
  fileName: "MARKERFILENAME_ferret.pdf",
  fileId: "MARKERFILEID_gharial",
  fileUniqueId: "MARKERUNIQUEID_hedgehog",
  forwardName: "MARKERFORWARDNAME_ibex",
  forwardChatTitle: "MARKERFORWARDCHAT_jaguar",
} as const;

type MarkerKey = keyof typeof MARKERS;

/** Secrets that must never reach a log line in any circumstance. */
const SECRETS: readonly string[] = [WEBHOOK_SECRET, SERVICE_ROLE_KEY];

/**
 * An update with a marker in every user-controlled field the schema carries.
 *
 * Built by mutating the fixture rather than adding options to the builder: the
 * point of this file is which *sites* carry content, and that list belongs next
 * to the assertion that reads it.
 */
function loadedUpdate(
  kind: "text" | "document" | "photo" | "voice" = "text",
): Record<string, unknown> {
  const update = kind === "document"
    ? documentUpdate({ mimeType: "application/pdf", fileName: MARKERS.fileName })
    : kind === "photo"
    ? photoUpdate()
    : kind === "voice"
    ? voiceUpdate()
    : textUpdate();

  const message = update["message"] as Record<string, unknown>;
  const from = message["from"] as Record<string, unknown>;

  from["first_name"] = MARKERS.firstName;
  from["last_name"] = MARKERS.lastName;
  from["username"] = MARKERS.username;

  if (kind === "text") message["text"] = MARKERS.text;
  else message["caption"] = MARKERS.caption;

  if (kind === "document") {
    const document = message["document"] as Record<string, unknown>;
    document["file_id"] = MARKERS.fileId;
    document["file_unique_id"] = MARKERS.fileUniqueId;

    // A forwarded document: the origin names a person and a chat, both
    // user-controlled and both easy to log by accident.
    message["forward_origin"] = {
      type: "user",
      date: 1_760_000_000,
      sender_user: { id: 900_000_777, first_name: MARKERS.forwardName },
    };
    message["forward_from_chat"] = { id: 900_000_888, title: MARKERS.forwardChatTitle };
  }

  return update;
}

// --- The harness -----------------------------------------------------------

interface Run {
  readonly status: number;
  readonly lines: string[];
  readonly body: string;
}

async function runDelivery(
  update: unknown,
  options: {
    secret?: string | null;
    respond?: (fn: string) => { status: number; body: unknown };
    rawBody?: string;
  } = {},
): Promise<Run> {
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        const fn = url.pathname.split("/").pop() ?? "";

        if (options.respond !== undefined) {
          const response = options.respond(fn);
          return Promise.resolve(
            new Response(JSON.stringify(response.body), {
              status: response.status,
              headers: { "content-type": "application/json" },
            }),
          );
        }

        const body = fn === "ensure_telegram_user" ? USER_ID : [{
          update_id: 900_000_001,
          user_id: USER_ID,
          job_id: JOB_ID,
          outcome: "accepted",
          job_state: "QUEUED",
          chat_id: 900_000_001,
          message_id: 1,
          queue_message_id: 900_000_003,
          template_key: "clean_note",
        }];

        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    },
  });

  const { logger, lines } = createCapturingLogger({ level: "debug" });
  const headers = new Headers({ "content-type": "application/json" });
  const secret = options.secret === undefined ? WEBHOOK_SECRET : options.secret;
  if (secret !== null) headers.set(TELEGRAM_SECRET_HEADER, secret);

  const request = new Request(`${SUPABASE_URL}/functions/v1/telegram-webhook`, {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(update),
  });

  const response = await handleWebhookRequest(request, {
    config: await loadWebhookConfig({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: GEMINI_API_KEY,
      GEMINI_MODEL: GEMINI_MODEL,
      INTERNAL_WORKER_SECRET,
      NOTINN_ENV: "local",
    }),
    repository: new IngestionRepository(client),
    logger,
  });

  return { status: response.status, lines, body: await response.text() };
}

/** Assert that no planted content and no secret appears anywhere in the output. */
function assertNothingLeaked(run: Run, context: string): void {
  const haystack = [...run.lines, run.body].join("\n");

  for (const [key, marker] of Object.entries(MARKERS) as [MarkerKey, string][]) {
    assertEquals(
      haystack.includes(marker),
      false,
      `${context}: the content planted in ${key} reached the logs`,
    );
  }

  for (const secret of SECRETS) {
    assertEquals(haystack.includes(secret), false, `${context}: a secret reached the logs`);
  }
}

/**
 * Assert the log is populated, so that the absence assertions mean something.
 *
 * A logger that wrote nothing would pass every test above.
 */
function assertActuallyLogged(run: Run, context: string): void {
  assertEquals(run.lines.length > 0, true, `${context}: nothing was logged at all`);

  for (const line of run.lines) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assertEquals(typeof parsed["event"], "string", `${context}: a line has no event name`);
    assertEquals(typeof parsed["timestamp"], "string", `${context}: a line has no timestamp`);
  }
}

// --- The scenarios ---------------------------------------------------------

for (const kind of ["text", "document", "photo", "voice"] as const) {
  Deno.test(`a ${kind} message leaves no content in the logs`, async () => {
    const run = await runDelivery(loadedUpdate(kind), {
      respond: (fn) =>
        fn === "ensure_telegram_user" ? { status: 200, body: USER_ID } : {
          status: 200,
          body: [{
            update_id: 900_000_001,
            user_id: USER_ID,
            job_id: JOB_ID,
            outcome: "accepted",
            job_state: "QUEUED",
            chat_id: 900_000_001,
            message_id: 1,
            queue_message_id: 900_000_003,
            template_key: "clean_note",
          }],
        },
    });

    assertEquals(run.status, 200);
    assertActuallyLogged(run, `${kind} accepted`);
    assertNothingLeaked(run, `${kind} accepted`);
  });
}

Deno.test("the accepted log line still says which job was created", async () => {
  // The complement of the privacy guarantee. Redaction that removed the
  // identifiers too would be easy and useless: an operator has to be able to
  // follow a note without reading it.
  const run = await runDelivery(loadedUpdate("text"));

  const accepted = run.lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((parsed) => parsed["event"] === "ingestion.accepted");

  assertEquals(accepted.length, 1, "the accepted message was not logged");
  assertEquals(accepted[0]?.["job_id"], JOB_ID);
  assertEquals(accepted[0]?.["update_id"], 900_000_001);
  assertEquals(accepted[0]?.["input_type"], "text");
  assertEquals(accepted[0]?.["template_key"], "clean_note");
});

Deno.test("an ignored message leaves no content in the logs", async () => {
  // The ignore path logs a `detail` explaining the decision. That string is
  // built from fixed vocabulary, and this is what proves it.
  const update = unsupportedContentUpdate();
  const from = (update["message"] as Record<string, unknown>)["from"] as Record<string, unknown>;
  from["first_name"] = MARKERS.firstName;
  from["username"] = MARKERS.username;

  const run = await runDelivery(update);

  assertEquals(run.status, 200);
  assertActuallyLogged(run, "ignored");
  assertNothingLeaked(run, "ignored");

  const ignored = run.lines.filter((line) => line.includes("webhook.ignored"));
  assertEquals(ignored.length, 1);
});

Deno.test("a channel post carries no content into the logs", async () => {
  const update = channelPostUpdate();
  const post = update["channel_post"] as Record<string, unknown>;
  post["text"] = MARKERS.text;
  post["caption"] = MARKERS.caption;

  const run = await runDelivery(update);

  assertEquals(run.status, 200);
  assertActuallyLogged(run, "channel post");
  assertNothingLeaked(run, "channel post");
});

Deno.test("a rejected delivery with a wrong secret leaks neither the content nor the secret", async () => {
  const run = await runDelivery(loadedUpdate("text"), { secret: "guessed_wrong_value" });

  assertEquals(run.status, 401);
  assertActuallyLogged(run, "rejected");
  assertNothingLeaked(run, "rejected");
});

Deno.test("a malformed body is not echoed into the log", async () => {
  // A JSON parse error is the obvious place a payload gets quoted: `JSON.parse`
  // reports the offending input, and a naive handler passes that through.
  const run = await runDelivery({}, {
    rawBody: `{"text": "${MARKERS.text}", "broken":`,
  });

  assertEquals(run.status, 200);
  assertActuallyLogged(run, "malformed");
  assertNothingLeaked(run, "malformed");
});

Deno.test("a payload that fails schema validation is not echoed into the log", async () => {
  // The schema error path is the other obvious one: Zod issues name the offending
  // path, and a handler that stringified the issue would write the value.
  const run = await runDelivery({ update_id: MARKERS.text, message: MARKERS.forwardName });

  assertEquals(run.status, 200);
  assertActuallyLogged(run, "schema");
  assertNothingLeaked(run, "schema");
});

Deno.test("a validation failure logs the field path and never the value", async () => {
  // The positive form. An operator needs to know *which* field was wrong.
  const run = await runDelivery({ update_id: "not a number" });

  const detail = run.lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .map((parsed) => String(parsed["error_detail"] ?? ""))
    .join(" ");

  assertEquals(detail.includes("update_id"), true, "the failing field was not named");
  assertEquals(detail.includes("not a number"), false, "the offending value was logged");
});

Deno.test("a database failure does not carry user content into the log", async () => {
  // The most realistic leak, and the least obvious. `error_detail` is an
  // allowlisted field, so a PostgreSQL message reaching it is written to the log
  // verbatim — and a PostgreSQL message can quote the value that violated a
  // constraint. The mitigation is that only `code` and `message` are used and
  // never `details`, which is where PostgreSQL puts the row values. See
  // docs/DATA_PRIVACY.md.
  const run = await runDelivery(loadedUpdate("text"), {
    respond: () => ({
      status: 409,
      body: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "telegram_updates_pkey"',
        // This is the field that quotes column values, and it must not be used.
        details: `Key (source_text)=(${MARKERS.text}) already exists.`,
        hint: `Consider ${MARKERS.caption}`,
      },
    }),
  });

  assertEquals(run.status, 200);
  assertActuallyLogged(run, "database failure");
  assertNothingLeaked(run, "database failure");
});

Deno.test("a PostgreSQL detail is never part of the classified error", () => {
  // The same guarantee asserted directly on the classifier, so that a change to
  // the HTTP path cannot weaken it unnoticed.
  const error = classifyPostgresError({
    code: "23505",
    message: 'duplicate key value violates unique constraint "telegram_updates_pkey"',
    details: `Key (source_text)=(${MARKERS.text}) already exists.`,
    hint: `Consider ${MARKERS.caption}`,
  });

  const detail = error.internalDetail ?? "";
  assertEquals(detail.includes(MARKERS.text), false, "details was folded into the error detail");
  assertEquals(detail.includes(MARKERS.caption), false, "hint was folded into the error detail");
  assertEquals(detail.includes("23505"), true, "the SQLSTATE was dropped, so the error is useless");
});

Deno.test("a database failure logs a classified detail an operator can act on", async () => {
  const run = await runDelivery(loadedUpdate("text"), {
    respond: () => ({
      status: 500,
      body: { code: "08006", message: "connection failure" },
    }),
  });

  const detail = run.lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .map((parsed) => String(parsed["error_detail"] ?? ""))
    .join(" ");

  assertEquals(detail.includes("08006"), true, "the SQLSTATE was not logged");
});

Deno.test("the webhook secret is never logged even on the success path", async () => {
  // The secret is a credential the function holds on every request. Nothing
  // reads it except the comparison, and this is the assertion that nothing
  // accidentally starts.
  const run = await runDelivery(loadedUpdate("text"));

  for (const line of run.lines) {
    assertEquals(
      line.includes(WEBHOOK_SECRET) || line.includes(SERVICE_ROLE_KEY),
      false,
      `a credential reached a log line: ${line}`,
    );
  }
});

/**
 * A string field is safe only if it is from the fixed vocabulary, an identifier,
 * or the one field that is deliberately free text.
 */
Deno.test("no allowlisted field carries free text", async () => {
  // The marker assertions above prove that the content in *this* request did not
  // reach a line. This one checks the mechanism rather than the sample: that no
  // field on the allowlist is being used as a channel for text at all. A field
  // which started carrying free text would be a leak the moment the content
  // stopped looking like a marker.
  //
  // Two carve-outs, both deliberate:
  //
  //   * `error_detail` is free text by design — it carries a classified
  //     explanation for an operator. It cannot be pattern-checked here, and what
  //     constrains it is asserted elsewhere: that a PostgreSQL error contributes
  //     only its SQLSTATE and message and never the `details` field, which is
  //     where PostgreSQL quotes row values. See the two tests above and
  //     docs/DATA_PRIVACY.md.
  //
  //   * `timestamp` and `request_id` are generated, not received. A UUID has the
  //     same shape as a UUID-shaped message, so they are excluded and the
  //     identifier pattern below is not made weaker to accommodate them.
  const vocabulary = new Set([
    "debug",
    "info",
    "warn",
    "error",
    "local",
    "telegram-webhook",
    "webhook.accepted",
    "webhook.ignored",
    "ingestion.accepted",
    "accepted",
    "text",
    "clean_note",
    "QUEUED",
  ]);

  // Identifiers and version strings only — no spaces, no punctuation that prose
  // would use.
  const identifierLike = /^(?:[0-9a-fA-F][0-9a-fA-F-]{7,63}|[0-9]+|\d+\.\d+\.\d+)$/;
  const exempt = new Set(["timestamp", "request_id", "error_detail"]);

  const run = await runDelivery(loadedUpdate("text"));
  assertActuallyLogged(run, "free text");

  for (const line of run.lines) {
    for (const [key, value] of Object.entries(JSON.parse(line) as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      if (exempt.has(key)) continue;

      assertEquals(
        vocabulary.has(value) || identifierLike.test(value),
        true,
        `log field ${key} carried free text: ${JSON.stringify(value)}`,
      );
    }
  }
});

Deno.test("a log line is always one line of JSON", async () => {
  // A multi-line value would break the log drain's line framing, and a newline
  // is the simplest way to inject a forged entry into a log.
  const run = await runDelivery(loadedUpdate("text"));

  for (const line of run.lines) {
    assertEquals(line.includes("\n"), false, "a log line contained a newline");
    assertEquals(line.startsWith("{") && line.endsWith("}"), true, `not a JSON object: ${line}`);
  }
});
