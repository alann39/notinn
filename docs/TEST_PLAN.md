# Test plan

Five suites, layered by what they need to run. The layering is not decoration: it
is what lets a developer without Docker (see
[ADR 0006](ADR/0006-pinned-dependencies.md)) still prove the hermetic Phase 4
surface.

| Suite                       | Files | Tests | Needs               | Command                      |
| --------------------------- | ----- | ----: | ------------------- | ---------------------------- |
| [unit](#unit)               | 22    |   334 | nothing             | `deno task test:unit`        |
| [contract](#contract)       | 2     |    94 | nothing             | `deno task test:contract`    |
| [security](#security)       | 3     |    56 | nothing             | `deno task test:security`    |
| [integration](#integration) | 4     |    25 | a Supabase project  | `deno task test:integration` |
| [e2e](#e2e)                 | 1     |     8 | a deployed function | `deno task test:integration` |

`deno task test` runs unit + contract + security: **484 tests, no database and no
outbound network.**

The integration and e2e suites are _ignored_, not failed, when no target is
configured, so the number of ignored tests is the count of checks that need
infrastructure rather than checks that were skipped to make a run go green.

Latest hermetic run (unit + contract + security, 2026-09-18): **484 passed, 0
failed.** Integration and e2e were not run because Docker/Podman and a deployed
test target are unavailable.

---

## Unit — 334 tests

Pure functions, no I/O, no doubles where a real call is possible.

| File                                | Covers                                                                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.test.ts`                       | Webhook/worker config validation, secret strength, provider/model requirements, JWT role decoding, and safe environment reporting                                                                                                |
| `errors.test.ts`                    | The taxonomy: every code has a retryable flag and a log level; `AppError` keeps the public message and the internal detail apart; `httpStatusForError` maps `401`/`500`/`200`                                                    |
| `input-routing.test.ts`             | Default template per input type, forwarded-text override, MIME and extension resolution, and that every template the router can produce exists in the catalogue                                                                  |
| `job-state.test.ts`                 | The transition table's shape: every terminal state has no outgoing edges, every non-terminal state can reach a terminal one, `CANCELLED` is reachable from every non-terminal state, creation states are `RECEIVED` and `QUEUED` |
| `logger.test.ts`                    | The allowlist: unknown fields dropped, objects and arrays dropped, denied fields dropped even when explicitly passed, level filtering, child context                                                                             |
| `parse-update.test.ts`              | Classification: private vs group vs channel, bots, service messages, one-content-kind rule, unsupported kinds, forwarded detection                                                                                               |
| `command-service.test.ts`           | `/search` plus `/ask` validation, lazy indexing, grounded answers, empty results, and opaque Open callbacks                                                                                                                      |
| `callback.test.ts`                  | Versioned callback payload encoding, UUID opacity, action vocabulary, and Telegram's 64-byte limit                                                                                                                               |
| `gemini-note-provider.test.ts`      | Gemini text/audio/image/PDF inline requests, response schemas, extracted-source validation, usage metadata, wrong-template rejection, invalid JSON, and rate-limit mapping                                                       |
| `gemini-embedding-provider.test.ts` | Batched document and question embeddings, 768-dimensional normalization, model guard, and rate-limit mapping                                                                                                                     |
| `document-extraction.test.ts`       | UTF-8 text decoding, image magic bytes, PDF encryption rejection, DOCX extraction, and macro rejection                                                                                                                           |
| `job-worker-service.test.ts`        | Text/audio/image/PDF/document state paths, in-memory buffer scrubbing, note staging, usage metering, delivery retry idempotency, transient retry, and file limits                                                                |
| `note-rendering.test.ts`            | Telegram-safe HTML, semantic splitting, inline keyboards, and callback round-trips                                                                                                                                               |
| `structured-note.test.ts`           | Application-authoritative structured-note validation and non-fabrication bounds                                                                                                                                                  |
| `text-note-service.test.ts`         | The inline job path, persistence, usage metering, delivery, and retryable provider failure                                                                                                                                       |
| `telegram-download.test.ts`         | Private `getFile` flow, metadata/content-length/stream byte limits, expired file mapping, and token-bearing URL containment                                                                                                      |
| `worker-invoker.test.ts`            | Background worker URL/header/body contract and non-2xx handling; only opaque `job_id` crosses the boundary                                                                                                                       |
| `redaction.test.ts`                 | Redaction of values that reach a log line: bearer tokens, bot-token URLs, signed URLs, private key blocks, newline collapsing (so a value cannot forge a line), truncation                                                       |
| `webhook-secret.test.ts`            | Constant-time comparison: prefix, suffix, length and case differences all refused; the mismatched value never appears in the thrown error                                                                                        |

---

## Contract — 94 tests

`contract/migration-constants.test.ts` is the drift guard. It reads the migration
SQL from disk and asserts the TypeScript mirrors in `config/constants.ts` agree
with it.

It is a parser, and parsing SQL with a regex is where this file's own bugs lived —
twice, the test was wrong and the migration was right. The two things that made it
correct are in the file:

- **A quote-aware statement scanner.** The template seed's Short Summary
  description reads _"A concise TL;DR and a few key points"_, and the semicolon in
  `TL;DR` truncates a naive `until the next ;` parse halfway through the
  catalogue. The scanner tracks whether it is inside a single-quoted string, and
  says in its own doc comment what it does not understand (dollar-quoting) and
  where it is therefore unsafe to reuse.
- **Positional tuple-key extraction**, rather than matching the value list, for
  the same reason.

What it asserts:

| Group         | Assertions                                                                                                                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enums         | 6 mirrored enums match member-for-member, including a reverse set-equality check so a member added to the DB and not the mirror is caught too                                                                                                                                                              |
| Templates     | The 11-key catalogue matches, in both directions                                                                                                                                                                                                                                                           |
| State machine | The transition mirror matches the trigger's `case` arms; the terminal list matches; creation states match; a state the trigger omits is treated as terminal                                                                                                                                                |
| Access model  | RLS enabled and no policy on all 8 tables; no table granted to a client role; `search_path` pinned on **every** function; every function is `SECURITY DEFINER` or a trigger function; no client-role `EXECUTE` on any function; definer functions granted to `service_role`; the revoke precedes the grant |
| RPC surface   | Repository RPC argument names ⊇ the declared parameters; every required parameter supplied; the outcome vocabulary matches on both sides                                                                                                                                                                   |
| Hygiene       | One definition per object; no `DROP TABLE`, `TRUNCATE` or `DISABLE ROW LEVEL SECURITY`; the migration file set matches the expected list; timestamps in order                                                                                                                                              |

The access-model group is what caught three genuine gaps: three trigger functions
carried PostgreSQL's default `EXECUTE` grant to `PUBLIC`. They were unreachable —
`returns trigger` cannot be an RPC — and the grant was revoked anyway, because a
surface that exists by accident of a return type is not a control. Those were
migration fixes, not test weakening.

---

## Security — 56 tests

Three suites, all hermetic and exercising the real authentication boundary.

The technique both share: `createClient` is given a `global.fetch` that answers
from a table of canned responses. The handler, the service, the repository and the
Supabase client all run for real — including the client's URL construction and
error wrapping — while nothing leaves the process. A test that stubbed the
_repository_ could only assert that the application asks for deduplication, which
is not the property anyone cares about.

### `webhook-auth.test.ts` — 35 tests

| Group                | Assertions                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret enforcement   | 5 variants (absent, empty, wrong, prefix, wrong length) each refused with `401` **and zero database calls**; the refusal body is empty with `no-store`; no secret and no `update_id` in the log |
| Non-updates          | GET, empty body, non-JSON, oversized body, a body without `update_id` — each acknowledged `200` with zero calls                                                                                 |
| Ignores              | 7 delivery kinds (group, supergroup, channel, channel post, bot, callback query, sticker) each acknowledged `200`, zero calls, exactly one `webhook.ignored` carrying a reason                  |
| Indistinguishability | The ignored response and the accepted response are byte-identical, so a probe cannot tell them apart                                                                                            |
| The accepted path    | Exactly `["ensure_telegram_user", "accept_and_enqueue_telegram_update"]` in that order                                                                                                          |
| Duplicates           | A replay is acknowledged `200`, is not logged as an error, and its response is byte-identical to the first                                                                                      |
| Failure mapping      | Transient → `500`; a constraint violation → `200`; a malformed row → `200` with exactly one error-level `INTERNAL_ERROR`; every failure body empty; no database message echoed                  |
| Response shape       | `{"ok":true}` and nothing else — no job id, user id, state or `update_id`                                                                                                                       |

### `log-redaction.test.ts` — 17 tests

Ten markers, one per user-controlled site (text, caption, first name, last name,
username, filename, `file_id`, `file_unique_id`, forward sender name, forward chat
title). Every captured log line **and** every response body is searched for every
marker, across text, document, photo, voice, ignored, channel-post, malformed,
schema-invalid, rejected and database-failure paths.

### `worker-auth.test.ts` — 4 tests

Missing and wrong internal secrets produce a bare `401` before a queue read, a
valid batch trigger reads the queue exactly once, and a malformed authenticated
body produces a bare `400`. The planted wrong secret is absent from every log.

Two details make the suite meaningful rather than reassuring:

- **A positive control.** Every case asserts the log is populated and every line
  has an `event` and a `timestamp`. A logger that wrote nothing would pass a
  one-directional absence check perfectly.
- **A mechanism check, not just a sample check.** One test walks every string
  field of every line and requires it to be either fixed vocabulary, an identifier
  or one of three documented exemptions. The marker tests prove _this_ request did
  not leak; that test proves no allowlisted field is a channel for free text at
  all.

---

## Integration — 25 tests (ignored without a target)

These are the only tests that touch a real database, and they exist for the
guarantees the database owns. See [harness.ts](../tests/integration/harness.ts).

| File                    | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingestion.test.ts`     | Exit criteria **1** and **2**: a first delivery creates exactly one job, asserted by counting rows and checking the job's columns; three replays yield `accepted`/`duplicate`/`duplicate` with one job id and one row; a replay with _different_ bytes still creates no second job; an unknown template key is refused by the foreign key; the ledger row records the digest and the job link; the catalogue is applied and every entry is active; first contact creates one `active` user                                                     |
| `state-machine.test.ts` | A job cannot be created terminal; both creation states are accepted; four full paths walked one step at a time (`COMPLETED`, retry-then-requeue, `EXPIRED`, `CANCELLED`); the pipeline cannot be short-circuited; an illegal transition is refused; a terminal job cannot be reopened; `completed_at` enforced in both directions; one `update_id` backs one job; a negative attempt count is refused; **a client-role key reads nothing and cannot call the functions**; the expected tables exist; the migration ledger records ≥ 9 versions |
| `phase1.test.ts`        | Owner-scoped note lifecycle, append-only regeneration/current-output move, and once-per-chat rejection claim                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `phase2.test.ts`        | Atomic ingestion returns a queue message id, the job resolves to the same PGMQ id, and the first claim moves exactly to `ACQUIRING` with the expected opaque job link                                                                                                                                                                                                                                                                                                                                                                          |

Note on why `ingestion.test.ts` counts rows rather than trusting the returned
outcome: a test that read only `result.outcome === "duplicate"` would pass even if
a second job had been created. The outcome is a claim; the row count is the fact.

### Safety design

The integration suite writes rows, so the harness is built so that pointing it at
the wrong database takes deliberate effort:

- Target variables are named `NOTINN_TEST_*` — names that appear **nowhere** in
  the application — so a run cannot inherit the credentials exported for the
  function.
- `NOTINN_ENV=production` aborts at import, before a single row is read.
- Setting only one of the two variables throws, rather than silently disabling.
- Every identifier is above `SYNTHETIC_ID_FLOOR` (4 × 10¹²), orders of magnitude
  above any real Telegram id.
- Clock-seeded counters give each run its own id block, so "a first delivery
  creates one job" is exercised on a genuine first delivery every run.
- **No test deletes anything.** Cleanup is `deno task clear-test-data`, a separate
  confirmation-guarded program that acknowledges synthetic PGMQ messages before
  deleting their application rows.

The two RLS tests skip explicitly when no publishable key is configured, and say
so in a comment — the alternative, asserting the negative without a key, would be
a test that passes by doing nothing.

---

## e2e — 8 tests (7 ignored without a deployment)

`e2e/webhook.test.ts` posts real HTTP to a real deployment. Everything else tests
the code; this tests whether the code is correctly _deployed_, which is a
different question with a different failure mode.

| Check                                               | Catches                                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A signed delivery is accepted                       | The function is reachable and configured                                                                                                                                                                |
| No secret → `401`; wrong secret → `401`             | The webhook was registered **with** a `secret_token`. Without it, Telegram echoes no header and every delivery is refused — a bot that appears completely dead while the logs look like hostile traffic |
| A request with no Supabase JWT reaches the function | `verify_jwt = false` took effect. This lives in `config.toml` and is invisible to every other kind of test                                                                                              |
| A redelivery is acknowledged                        | Telegram's retry is handled over the wire, not only in a stub                                                                                                                                           |
| A group message is acknowledged                     | The ignore contract holds in the deployment                                                                                                                                                             |
| No failure response names the system                | No stack frame, filename, or `supabase`/`postgres`/`deno` in any failure body                                                                                                                           |

Plus one test that runs **unconditionally**, even when no target is configured: it
asserts that `NOTINN_ENV=production` and a configured webhook URL are never both
set. That one is a guard, not a check, and it must not be skippable.

---

## Manual verification

One check cannot be automated from here. It is documented as an operator step in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md):

1. **A real Telegram delivery to a live bot** — proving the registration is
   correct end to end. Requires a bot token and explicit approval to register a
   webhook, per the project's constraints.

A second manual check — **a from-scratch migration replay**, proving exit
criterion 6 — was performed on 2026-09-17 and is no longer outstanding. It needed
a disposable project, because `supabase start` cannot run without Docker. The
procedure, the evidence that it tested what it claimed to, and its result are
recorded under [The replay](IMPLEMENTATION_STATUS.md#the-replay).

---

## What is not tested, and why

- **No coverage threshold.** A percentage would be satisfiable by testing
  getters, and it is not the property that matters. The suites are organised by
  _claim_ — each file's header names the claim it proves — and the exit criteria
  are mapped to tests in the report rather than to a number.
- **No browser or UI tests.** Telegram is the MVP interface; no browser UI exists.
- **No load or concurrency testing.** The `update_id` race is covered at the
  constraint level (a second insert is refused), which is the correctness
  property. Worker throughput and queue-depth testing require an applied PGMQ
  migration and are part of deployment verification.
- **No mutation testing.** Worth doing after the multimodal paths stabilise.
