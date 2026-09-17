import { assertEquals, assertRejects } from "@std/assert";
import { createClient } from "@supabase/supabase-js";
import type { ServiceClient } from "../../supabase/functions/_shared/db/client.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { NotesRepository } from "../../supabase/functions/_shared/repositories/notes.repository.ts";

/**
 * The note boundary, driven through a stubbed PostgREST.
 *
 * The contract suite asserts the *shape* of this repository against the
 * migration — that every parameter it sends exists and that every outcome it
 * names is one the SQL returns. It cannot assert what happens to a reply, and
 * what happens to a reply is where this boundary either holds or quietly does the
 * wrong thing:
 *
 *   * A PostgREST error must become a classified `AppError`. A repository that
 *     read `data` without establishing that `error` was null would turn a
 *     connection failure into "no rows", which is a schema bug — the wrong
 *     retryability verdict and a false alarm in the log.
 *
 *   * An empty result set must be an empty answer, not an internal error. This is
 *     the ordinary path for a forged callback naming somebody else's note, and
 *     PostgREST is not consistent about how it spells "no rows".
 *
 *   * A row that is not the expected shape must be an internal error, not a
 *     half-populated value. A schema change that dropped a column would otherwise
 *     surface as `undefined` travelling through the pipeline.
 *
 * The stub is the client's own `fetch`, exactly as tests/security/log-redaction
 * does it, so the request really is built by supabase-js: a wrong argument name
 * fails here for the same reason it would fail in production.
 */

const SUPABASE_URL = "https://synthetic.supabase.co";
const SERVICE_ROLE_KEY = "synthetic_service_role_key_abcdefghijklmnop";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const OUTPUT_ID = "33333333-3333-4333-8333-333333333333";

interface Stub {
  /** The pathname of every request made, e.g. `/rest/v1/rpc/persist_note`. */
  readonly calls: string[];
  /** The decoded body of the last request. */
  readonly lastBody: () => Record<string, unknown>;
}

/**
 * A client whose every request returns `body` with `status`.
 *
 * Typed as `ServiceClient` — the same type `NotesRepository` takes — rather than
 * as `ReturnType<typeof createClient>`, so that a change to the client's
 * construction is a compile error here instead of a stub that no longer resembles
 * the real thing.
 *
 * The body is returned as-is, so a caller can pass `null` to represent the empty
 * set PostgREST produces for a single-column result.
 */
function stubClient(body: unknown, status = 200): { client: ServiceClient; stub: Stub } {
  const calls: string[] = [];
  let last = "";

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );

        calls.push(url.pathname);
        if (typeof init?.body === "string") last = init.body;

        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    },
  });

  return { client, stub: { calls, lastBody: () => JSON.parse(last) as Record<string, unknown> } };
}

// --- The refusal paths -----------------------------------------------------

Deno.test("persisting a note reports the outcome the database chose", async () => {
  const { client, stub } = stubClient([{
    outcome: "created",
    note_id: NOTE_ID,
    output_id: OUTPUT_ID,
  }]);

  const result = await new NotesRepository(client).persistNote({
    userId: USER_ID,
    jobId: NOTE_ID,
    title: "A note",
    language: "en",
    sourceType: "text",
    normalizedSourceText: "A note",
    sourceTextSha256: "0".repeat(64),
    templateKey: "clean_note",
    schemaVersion: 1,
    contentJson: { title: "A note" },
    renderedText: "A note",
    provider: "gemini",
    model: "gemini-synthetic-flash",
    generationReason: "initial",
  });

  assertEquals(result.outcome, "created");
  assertEquals(result.noteId, NOTE_ID);
  assertEquals(result.outputId, OUTPUT_ID);

  // Not "the outcome was created" but "the call really was persist_note with the
  // owner it was given" — the argument name is what a PostgREST typo breaks.
  assertEquals(stub.calls, ["/rest/v1/rpc/persist_note"]);
  assertEquals(stub.lastBody()["p_user_id"], USER_ID);
});

Deno.test("a refusal is an outcome rather than a thrown error", async () => {
  // The common path for a callback naming somebody else's note. If this threw,
  // every probe of a forged payload would write an error-level log line.
  const { client } = stubClient([{ outcome: "not_found", note_id: null, output_id: null }]);

  const result = await new NotesRepository(client).regenerateNoteOutput({
    userId: USER_ID,
    noteId: NOTE_ID,
    templateKey: "clean_note",
    schemaVersion: 1,
    contentJson: {},
    renderedText: "",
    provider: "gemini",
    model: "gemini-synthetic-flash",
    generationReason: "regenerate",
  });

  assertEquals(result.outcome, "not_found");
  assertEquals(result.noteId, null);
});

Deno.test("deleting a note that is already gone is not an error", async () => {
  const { client } = stubClient([{ outcome: "not_found", note_id: null }]);

  const result = await new NotesRepository(client).deleteNote(USER_ID, NOTE_ID);

  assertEquals(result.outcome, "not_found");
});

Deno.test("saving a note reports the stored value, not the requested one", async () => {
  // The function returns what the row holds after the write. A repository that
  // echoed its own argument would make the two indistinguishable, and the
  // difference is the only evidence the write happened.
  const { client } = stubClient([{ outcome: "updated", note_id: NOTE_ID, is_saved: true }]);

  const result = await new NotesRepository(client).setNoteSaved(USER_ID, NOTE_ID, true);

  assertEquals(result.outcome, "updated");
  assertEquals(result.isSaved, true);
});

// --- The empty set ---------------------------------------------------------

Deno.test("no recent notes is an empty list", async () => {
  const { client } = stubClient([]);

  assertEquals(await new NotesRepository(client).listRecentSavedNotes(USER_ID, 10), []);
});

Deno.test("no recent notes stays empty when PostgREST spells it null", async () => {
  // The single-column case. Reading null as a malformed reply would report an
  // ordinary empty list as an internal bug.
  const { client } = stubClient(null);

  assertEquals(await new NotesRepository(client).listRecentSavedNotes(USER_ID, 10), []);
});

Deno.test("a note that is not regenerable reads as absent", async () => {
  // Covers "no such note", "somebody else's note" and "already deleted" at once,
  // which is the point: the three must be indistinguishable to the caller.
  const { client } = stubClient([]);

  assertEquals(await new NotesRepository(client).findNoteForRegeneration(USER_ID, NOTE_ID), null);
});

Deno.test("an empty single-row reply is an internal error, not a null outcome", async () => {
  // The counterpart of the two above. Every write function returns a row on every
  // path including its refusals, so no rows from one of those means the database
  // and this file disagree — and reporting it as a refusal would let a broken
  // function look like a policy decision.
  const { client } = stubClient([]);

  await assertRejects(
    () => new NotesRepository(client).deleteNote(USER_ID, NOTE_ID),
    AppError,
  );
});

// --- Failures --------------------------------------------------------------

Deno.test("a transient database failure is retryable", async () => {
  const { client } = stubClient({ code: "08006", message: "connection failure" }, 500);

  const error = await assertRejects(
    () => new NotesRepository(client).deleteNote(USER_ID, NOTE_ID),
    AppError,
  );

  assertEquals(error.code, "database_error");
  assertEquals(error.retryable, true);
  assertEquals(error.internalDetail?.includes("08006"), true);
});

Deno.test("an integrity violation is a bug and is not retryable", async () => {
  // A unique-constraint failure here means the caller asked for something the
  // schema forbids — for instance a second note for the same job, which
  // persist_note guards against by returning `existing`. Retrying reproduces it.
  const { client } = stubClient(
    {
      code: "23505",
      message: 'duplicate key value violates unique constraint "notes_source_job_id_key"',
      details: "Key (source_job_id)=(sensitive value that must not be read) already exists.",
    },
    409,
  );

  const error = await assertRejects(
    () => new NotesRepository(client).deleteNote(USER_ID, NOTE_ID),
    AppError,
  );

  assertEquals(error.code, "internal_error");
  assertEquals(error.retryable, false);
  assertEquals(
    error.internalDetail?.includes("sensitive value that must not be read"),
    false,
    "details was folded into the error detail",
  );
});

Deno.test("a row that is not the expected shape is an internal error", async () => {
  // What a dropped column looks like from here. The alternative is `undefined`
  // travelling onward as though it were a value.
  const { client } = stubClient([{ outcome: "deleted" }]);

  const error = await assertRejects(
    () => new NotesRepository(client).deleteNote(USER_ID, NOTE_ID),
    AppError,
  );

  assertEquals(error.code, "internal_error");
});

Deno.test("an outcome the database has never returned is an internal error", async () => {
  // The contract test asserts the two vocabularies agree. This is what happens if
  // somebody widens the SQL without widening the schema here: the value is
  // rejected rather than handled as though it were a known outcome.
  const { client } = stubClient([{ outcome: "invented_later", note_id: null }]);

  await assertRejects(
    () => new NotesRepository(client).deleteNote(USER_ID, NOTE_ID),
    AppError,
  );
});
