import { assert, assertEquals } from "@std/assert";
import { createClient } from "@supabase/supabase-js";
import { loadWebhookConfig } from "../../supabase/functions/_shared/config/env.ts";
import { ERROR_CODES } from "../../supabase/functions/_shared/errors/taxonomy.ts";
import { IngestionRepository } from "../../supabase/functions/_shared/repositories/ingestion.repository.ts";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import { handleWebhookRequest } from "../../supabase/functions/_shared/telegram/handler.ts";
import { TELEGRAM_SECRET_HEADER } from "../../supabase/functions/_shared/config/constants.ts";
import {
  botTextUpdate,
  callbackQueryUpdate,
  channelPostUpdate,
  documentUpdate,
  groupTextUpdate,
  photoUpdate,
  SYNTHETIC_ID_BASE,
  textUpdate,
  unsupportedContentUpdate,
  voiceUpdate,
} from "../fixtures/telegram/builders.ts";

/**
 * The webhook's authentication and rejection boundary, exercised end to end.
 *
 * These tests drive `handleWebhookRequest` — the real handler, through the real
 * service, through the real repository — over a stubbed HTTP transport. Only the
 * network is fake. Everything between the request and the RPC call is the code
 * that runs in production, so an assertion here is an assertion about the
 * deployed path rather than about a mock of it.
 *
 * The property that matters most is ordering: authentication happens before any
 * database work. It is asserted the only way it can be — by counting the requests
 * that reached the transport, which must be zero for every unauthenticated
 * caller. A test that only checked the status code would pass against an
 * implementation that authenticated *after* writing a row.
 *
 * What is deliberately NOT proven here is deduplication. `update_id` uniqueness
 * is enforced by a unique index inside `accept_and_enqueue_telegram_update`; a fake
 * transport can only assert that the application asks the database to dedup, not
 * that the database does. That proof needs a real instance and lives in
 * tests/integration/.
 */

const SUPABASE_URL = "https://synthetic.supabase.co";
const SERVICE_ROLE_KEY = "synthetic-service-role-key-not-a-credential";
const WEBHOOK_SECRET = "synthetic_webhook_secret_value";
const BOT_TOKEN = "123456789:AAFakeTokenValueThatIsLongEnoughToMatch";
const GEMINI_API_KEY = "synthetic-gemini-api-key-value";
const GEMINI_MODEL = "gemini-synthetic-flash";
const INTERNAL_WORKER_SECRET = "synthetic-internal-worker-secret-value";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

// --- The stubbed transport -------------------------------------------------

interface RpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

interface RpcResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * A Supabase client whose only transport is a function.
 *
 * `createClient` is given a `fetch` that records the call and returns a canned
 * response, so the repository's own validation, error classification and RPC
 * argument construction all run for real. The URL path identifies which function
 * was called, which is what makes the ordering assertion possible.
 */
function stubTransport(respond: (fn: string, args: Record<string, unknown>) => RpcResponse) {
  const calls: RpcCall[] = [];

  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const fn = url.pathname.split("/").pop() ?? "";
    const args = init?.body === undefined
      ? {}
      : JSON.parse(String(init.body)) as Record<string, unknown>;

    calls.push({ fn, args });

    const response = respond(fn, args);
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl },
  });

  return { client, calls };
}

/** The default happy-path responses, for tests about something other than the database. */
function happyPath(fn: string): RpcResponse {
  if (fn === "ensure_telegram_user") return { status: 200, body: USER_ID };

  if (fn === "accept_and_enqueue_telegram_update") {
    return {
      status: 200,
      body: [{
        update_id: SYNTHETIC_ID_BASE + 1,
        user_id: USER_ID,
        job_id: JOB_ID,
        outcome: "accepted",
        job_state: "QUEUED",
        chat_id: SYNTHETIC_ID_BASE + 1,
        message_id: SYNTHETIC_ID_BASE + 2,
        queue_message_id: SYNTHETIC_ID_BASE + 3,
      }],
    };
  }

  return { status: 404, body: { code: "PGRST202", message: "no such function" } };
}

interface Harness {
  readonly response: Response;
  readonly calls: RpcCall[];
  readonly lines: string[];
}

/** Run one delivery through the whole path. */
async function deliver(
  body: unknown,
  options: {
    secret?: string | null;
    method?: string;
    respond?: (fn: string, args: Record<string, unknown>) => RpcResponse;
    rawBody?: string;
  } = {},
): Promise<Harness> {
  const { client, calls } = stubTransport(options.respond ?? happyPath);
  const { logger, lines } = createCapturingLogger({ level: "debug" });

  const headers = new Headers({ "content-type": "application/json" });
  const secret = options.secret === undefined ? WEBHOOK_SECRET : options.secret;
  if (secret !== null) headers.set(TELEGRAM_SECRET_HEADER, secret);

  const request = new Request(`${SUPABASE_URL}/functions/v1/telegram-webhook`, {
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" || options.method === "HEAD"
      ? undefined
      : (options.rawBody ?? JSON.stringify(body)),
  });

  // The real loader, not a hand-built object. Configuration is part of what is
  // under test: if the loader stopped producing a usable config, every one of
  // these tests should fail rather than quietly run against a fiction.
  const config = await loadWebhookConfig({
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: GEMINI_API_KEY,
    GEMINI_MODEL: GEMINI_MODEL,
    INTERNAL_WORKER_SECRET,
    NOTINN_ENV: "local",
  });

  const response = await handleWebhookRequest(request, {
    config,
    repository: new IngestionRepository(client),
    logger,
  });

  return { response, calls, lines };
}

// --- Authentication --------------------------------------------------------

Deno.test("a delivery with no secret is refused and touches nothing", async () => {
  const { response, calls } = await deliver(textUpdate(), { secret: null });

  assertEquals(response.status, 401);
  assertEquals(calls, [], "an unauthenticated delivery reached the database");
});

Deno.test("a delivery with a wrong secret is refused and touches nothing", async () => {
  const { response, calls } = await deliver(textUpdate(), { secret: "guessed_wrong_value" });

  assertEquals(response.status, 401);
  assertEquals(calls, []);
});

Deno.test("a delivery with an empty secret header is refused and touches nothing", async () => {
  // Present-but-empty is a distinct mistake from absent, and must not be treated
  // as matching an empty expectation.
  const { response, calls } = await deliver(textUpdate(), { secret: "" });

  assertEquals(response.status, 401);
  assertEquals(calls, []);
});

Deno.test("a secret that is a prefix of the real one is refused", async () => {
  const { response, calls } = await deliver(textUpdate(), { secret: "synthetic_webhook" });

  assertEquals(response.status, 401);
  assertEquals(calls, []);
});

Deno.test("a secret of the right length but the wrong content is refused", async () => {
  // Rules out a comparison that only checks the shape.
  const { response, calls } = await deliver(textUpdate(), {
    secret: "synthetic_webhook_secret_valuX",
  });

  assertEquals(response.status, 401);
  assertEquals(calls, []);
});

Deno.test("a refusal is empty and carries no clue about why", async () => {
  // Blueprint 17.1: the endpoint reveals nothing to its caller. A body naming
  // the reason would tell an attacker whether they hold a valid URL, a valid
  // secret, or a malformed payload.
  const { response } = await deliver(textUpdate(), { secret: "guessed_wrong_value" });

  assertEquals(await response.text(), "");
  assertEquals(response.headers.get("cache-control"), "no-store");
});

Deno.test("a refused delivery logs a failure without the presented secret", async () => {
  const guess = "synthetic_webhook_secret_valuX";
  const { lines } = await deliver(textUpdate(), { secret: guess });

  assert(lines.length > 0, "a refusal logged nothing, so it cannot be alerted on");
  for (const line of lines) {
    assert(!line.includes(guess), `the presented secret reached a log line: ${line}`);
    assert(!line.includes(WEBHOOK_SECRET), `the real secret reached a log line: ${line}`);
  }
});

Deno.test("a refused delivery does not log the update id", async () => {
  // The update id is the one piece of the payload that is safe to log, and it is
  // still withheld until the caller has authenticated — otherwise anyone who
  // learns the URL can write to the log.
  const { lines } = await deliver(textUpdate({ updateId: 987_654_321 }), { secret: null });

  for (const line of lines) {
    assert(!line.includes("987654321"), `an unauthenticated update id reached a log line: ${line}`);
  }
});

// --- Method and body guards ------------------------------------------------

Deno.test("a method other than POST is refused without a database call", async () => {
  const { response, calls } = await deliver(null, { method: "GET" });

  // 200, not 405: the response tells Telegram not to retry, and Telegram will
  // never send a GET in the first place, so this is a hostile or a mistaken
  // caller rather than a delivery to be redriven.
  assertEquals(response.status, 200);
  assertEquals(calls, []);
  assertEquals(await response.text(), "");
});

Deno.test("an empty body is refused without a database call", async () => {
  const { response, calls } = await deliver({}, { rawBody: "" });

  assertEquals(response.status, 200);
  assertEquals(calls, []);
});

Deno.test("a body that is not JSON is refused without a database call", async () => {
  const { response, calls } = await deliver({}, { rawBody: "{ not json at all" });

  assertEquals(response.status, 200);
  assertEquals(calls, []);
});

Deno.test("a body over the size limit is refused without a database call", async () => {
  // The limit is what stops an unauthenticated holder of the URL — if the secret
  // ever leaked — from making the function allocate in proportion to their input.
  const huge = JSON.stringify({ update_id: 1, padding: "x".repeat(1_200_000) });
  const { response, calls } = await deliver({}, { rawBody: huge });

  assertEquals(response.status, 200);
  assertEquals(calls, []);
});

Deno.test("a body that parses but is not an update is refused without a database call", async () => {
  const { response, calls } = await deliver({ not: "an update" });

  assertEquals(response.status, 200);
  assertEquals(calls, []);
});

// --- Non-private chats and unsupported content (exit criterion 4) ----------

const IGNORED_DELIVERIES: readonly [string, () => Record<string, unknown>][] = [
  ["a group message", () => groupTextUpdate("group")],
  ["a supergroup message", () => groupTextUpdate("supergroup")],
  ["a channel message", () => groupTextUpdate("channel")],
  ["a channel post", () => channelPostUpdate()],
  ["a message from a bot", () => botTextUpdate()],
  ["a callback query", () => callbackQueryUpdate()],
  ["a sticker", () => unsupportedContentUpdate()],
];

for (const [description, build] of IGNORED_DELIVERIES) {
  Deno.test(`${description} is safely ignored`, async () => {
    // The documented contract, and the Phase 0 reading of blueprint 16.4: the
    // update is acknowledged with a success so Telegram stops redelivering it,
    // and no job is created and no row is written. "Ignored" is the whole
    // behaviour — there is no reply, because replying is Phase 1 work.
    // See docs/ADR/0001-blueprint-deviations.md.
    const { response, calls, lines } = await deliver(build());

    assertEquals(response.status, 200, `${description} was not acknowledged`);
    assertEquals(calls, [], `${description} reached the database`);

    const ignored = lines.filter((line) =>
      line.includes("webhook.ignored") || line.includes("webhook.rejected")
    );
    assertEquals(ignored.length, 1, `${description} did not log exactly one drop`);
    assert(
      JSON.parse(ignored[0] as string).reason !== undefined,
      "the ignore was logged without a reason",
    );
  });
}

Deno.test("an ignored delivery is acknowledged identically to an accepted one", async () => {
  // If the two differed, a caller could map which content types Notinn acts on
  // by comparing responses.
  const ignored = await deliver(groupTextUpdate("group"));
  const accepted = await deliver(textUpdate());

  assertEquals(ignored.response.status, accepted.response.status);
  assertEquals(await ignored.response.text(), await accepted.response.text());
});

// --- The accepted path -----------------------------------------------------

Deno.test("a private text message is accepted and creates one job", async () => {
  const { response, calls } = await deliver(textUpdate({ updateId: 900_000_017 }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true });

  assertEquals(calls.map((call) => call.fn), [
    "ensure_telegram_user",
    "accept_and_enqueue_telegram_update",
  ]);
  assertEquals(calls[1]?.args["p_update_id"], 900_000_017);
  assertEquals(calls[1]?.args["p_template_key"], "clean_note");
  assertEquals(calls[1]?.args["p_input_type"], "text");
});

Deno.test("the user is resolved before the job is accepted", async () => {
  // The reverse order would leave an orphaned job whenever the upsert raced, and
  // the foreign key would reject the insert rather than the race being absorbed.
  const { calls } = await deliver(textUpdate());

  assertEquals(calls[0]?.fn, "ensure_telegram_user");
  assertEquals(calls[1]?.args["p_user_id"], USER_ID);
});

Deno.test("each accepted delivery creates exactly one job", async () => {
  // One update, one accept call. Two would be a duplicate job for one message.
  const { calls } = await deliver(textUpdate());

  assertEquals(
    calls.filter((call) => call.fn === "accept_and_enqueue_telegram_update").length,
    1,
  );
});

Deno.test("a replayed update is acknowledged without being reported as failed", async () => {
  // Telegram redelivers. The database recognises the update_id and returns
  // `duplicate`; the endpoint must still answer 2xx, or Telegram will keep
  // redelivering forever. That no second job is created is the database's
  // guarantee and is proven against a real instance in tests/integration/.
  const { response, calls, lines } = await deliver(textUpdate(), {
    respond: (fn) =>
      fn === "ensure_telegram_user"
        ? { status: 200, body: USER_ID }
        : fn === "telegram_update_digest_matches"
        ? { status: 200, body: true }
        : {
          status: 200,
          body: [{
            update_id: SYNTHETIC_ID_BASE + 1,
            user_id: USER_ID,
            job_id: JOB_ID,
            outcome: "duplicate",
            job_state: "QUEUED",
            chat_id: SYNTHETIC_ID_BASE + 1,
            message_id: SYNTHETIC_ID_BASE + 2,
            queue_message_id: SYNTHETIC_ID_BASE + 3,
          }],
        },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true });
  assertEquals(calls.length, 3);

  for (const line of lines) {
    assertEquals(
      JSON.parse(line).level === "error",
      false,
      `a replay was logged as an error: ${line}`,
    );
  }
});

Deno.test("a reply to a duplicate is byte-identical to a reply to a new update", async () => {
  // The endpoint must not become an oracle for whether an update was seen.
  const accepted = await deliver(textUpdate());
  const duplicate = await deliver(textUpdate(), {
    respond: (fn) =>
      fn === "ensure_telegram_user"
        ? { status: 200, body: USER_ID }
        : fn === "telegram_update_digest_matches"
        ? { status: 200, body: true }
        : {
          status: 200,
          body: [{
            update_id: SYNTHETIC_ID_BASE + 1,
            user_id: USER_ID,
            job_id: JOB_ID,
            outcome: "duplicate",
            job_state: "QUEUED",
            chat_id: SYNTHETIC_ID_BASE + 1,
            message_id: SYNTHETIC_ID_BASE + 2,
            queue_message_id: SYNTHETIC_ID_BASE + 3,
          }],
        },
  });

  assertEquals(accepted.response.status, duplicate.response.status);
  assertEquals(await accepted.response.text(), await duplicate.response.text());
});

Deno.test("a refusal for an inactive account is acknowledged without creating a job", async () => {
  const { response, calls } = await deliver(textUpdate(), {
    respond: (fn) =>
      fn === "ensure_telegram_user" ? { status: 200, body: USER_ID } : {
        status: 200,
        body: [{
          update_id: SYNTHETIC_ID_BASE + 1,
          user_id: USER_ID,
          job_id: null,
          outcome: "user_not_active",
          job_state: null,
          chat_id: null,
          message_id: null,
          queue_message_id: null,
        }],
      },
  });

  assertEquals(response.status, 200);
  assertEquals(calls.length, 2);
});

Deno.test("every media kind that Phase 0 accepts reaches the database once", async () => {
  const deliveries = [
    voiceUpdate(),
    photoUpdate(),
    documentUpdate({ mimeType: "application/pdf", fileName: "synthetic.pdf" }),
  ];

  for (const update of deliveries) {
    const { response, calls } = await deliver(update);

    assertEquals(response.status, 200);
    assertEquals(calls.map((call) => call.fn), [
      "ensure_telegram_user",
      "accept_and_enqueue_telegram_update",
    ]);
  }
});

// --- Failure mapping -------------------------------------------------------

Deno.test("a transient database failure answers 5xx so Telegram redelivers", async () => {
  // The whole point of the retryable verdict: a note that arrives a minute late
  // instead of never.
  const { response } = await deliver(textUpdate(), {
    respond: () => ({ status: 500, body: { code: "08006", message: "connection failure" } }),
  });

  assertEquals(response.status, 500);
});

Deno.test("a constraint violation answers 200 because a retry cannot fix it", async () => {
  // A deterministic failure. Redelivering it would multiply the failure rather
  // than resolve it, and the error is logged at error level, which is the real
  // alerting path.
  const { response, lines } = await deliver(textUpdate(), {
    respond: () => ({
      status: 409,
      body: {
        code: "23503",
        message:
          'insert or update violates foreign key constraint "processing_jobs_template_key_fkey"',
      },
    }),
  });

  assertEquals(response.status, 200);
  assert(
    lines.some((line) => JSON.parse(line).level === "error"),
    "a constraint violation was not logged at error level",
  );
});

Deno.test("a database failure that returns a malformed row is treated as a bug", async () => {
  // An unrecognised row shape means the database and the application disagree,
  // which is a bug rather than a bad request, and the taxonomy marks a bug as
  // non-retryable — so the answer is 200 and the recovery path is the error log,
  // not redelivery. That is deliberate rather than incidental: the same flag
  // routes a job to FAILED rather than RETRYABLE_FAILED (blueprint 14), and a
  // bug that reached the retry queue would be retried forever instead of being
  // noticed.
  //
  // Nothing is lost by answering 200 here. This failure is the accept call
  // returning a row it does not understand, which means the row was written —
  // the job is already durable and a Phase 1 worker will pick it up. See
  // docs/IMPLEMENTATION_STATUS.md for the one path where that reasoning does not
  // hold.
  const { response, lines } = await deliver(textUpdate(), {
    respond: (fn) =>
      fn === "ensure_telegram_user"
        ? { status: 200, body: USER_ID }
        : { status: 200, body: [{ nonsense: true }] },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.text(), "");

  const errors = lines.filter(
    (line) => JSON.parse(line).error_code === ERROR_CODES.INTERNAL_ERROR,
  );
  assertEquals(errors.length, 1, "a bug was not logged at error level");
  assertEquals(JSON.parse(errors[0] as string).level, "error");
});

Deno.test("a malformed reply is never reported to the caller as its detail", async () => {
  // The detail names the function and the problem, which is useful to an
  // operator and would describe the system's internals to a caller.
  const { response } = await deliver(textUpdate(), {
    respond: (fn) =>
      fn === "ensure_telegram_user"
        ? { status: 200, body: USER_ID }
        : { status: 200, body: [{ nonsense: true }] },
  });

  const body = await response.text();
  assertEquals(body.includes("accept_and_enqueue_telegram_update"), false);
  assertEquals(body.includes("shape"), false);
});

Deno.test("a failed delivery never carries a body", async () => {
  // Neither a 5xx nor a 2xx-on-failure may describe what went wrong.
  const retryable = await deliver(textUpdate(), {
    respond: () => ({ status: 500, body: { code: "08006", message: "connection failure" } }),
  });
  const nonRetryable = await deliver(textUpdate(), {
    respond: () => ({ status: 409, body: { code: "23503", message: "constraint" } }),
  });

  assertEquals(await retryable.response.text(), "");
  assertEquals(await nonRetryable.response.text(), "");
});

Deno.test("a failed delivery leaks no database message to the caller", async () => {
  const { response } = await deliver(textUpdate(), {
    respond: () => ({
      status: 500,
      body: { code: "08006", message: "could not connect to server: internal-host-42" },
    }),
  });

  const body = await response.text();
  assertEquals(body.includes("internal-host-42"), false);
  assertEquals(body.includes("08006"), false);
});

Deno.test("no response body names a job, a state or an outcome", async () => {
  // Blueprint 17.1. The success body is `{"ok":true}` and nothing else; a job id
  // in the response would let a caller who learned the URL enumerate jobs.
  const { response } = await deliver(textUpdate());
  const body = await response.text();

  assertEquals(body, '{"ok":true}');
  for (const fragment of [JOB_ID, USER_ID, "QUEUED", "accepted", "update_id"]) {
    assert(!body.includes(fragment), `the response exposed ${fragment}`);
  }
});
