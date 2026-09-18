# Architecture

Phase 4. Telegram ingestion is separated from processing by an atomic PGMQ
message. One Gemini adapter handles text, audio, images, and PDFs; deterministic
extractors handle DOCX/TXT/Markdown. See
[ADR 0008](ADR/0008-phase-2-durable-worker.md) and
[ADR 0009](ADR/0009-phase-3-ephemeral-documents.md), and
[ADR 0011](ADR/0011-phase-4-search-first.md).

## The shape

```
Telegram → telegram-webhook → atomic job + PGMQ message
                  │                       │
                  └─ background nudge ───┤
                                          ▼
recovery Cron ─────────────────────→ process-job
                                          │
              Telegram file → bounded memory → validate/extract → Gemini
                                          │
                         staged note → Telegram delivery
                                          │
                              COMPLETED + queue ack
```

The background nudge is an optimisation, not the durability boundary. If it is
lost, recovery Cron reads the same PGMQ message. If two workers race, the database
claim permits only one legal `QUEUED → ACQUIRING` transition.

## Directory map

```
supabase/
  migrations/          fourteen ordered migrations; the schema's source of truth
  functions/
    telegram-webhook/index.ts     ingestion composition root
    process-job/index.ts          worker composition root
    _shared/
      config/          constants.ts (mirrors of DB enums) · env.ts (validated config)
      db/              client.ts (service-role client, timeout)
      errors/          taxonomy.ts · app-error.ts · http.ts
      observability/   logger.ts (allowlist) · correlation.ts · levels.ts · redaction.ts
      providers/       NoteAIProvider · GeminiNoteProvider
      repositories/    all PostgREST and usage writes
      security/        webhook-secret.ts (constant-time) · hashing.ts
      services/        ingestion, callbacks, rendering, file extraction, durable worker
      worker/          internal HTTP handler and background invoker
      telegram/        schema.ts (Zod) · parse-update.ts (classify) · handler.ts
  config.toml          local stack config; carries verify_jwt = false
  seed.sql             local-only; the template catalogue is a migration, not a seed
scripts/               operator tooling — webhook set/delete/info, verify-env, smoke, clear-test-data
tests/                 unit · contract · security · integration · e2e · fixtures
docs/                  this file, DATA_PRIVACY, API_CONTRACTS, TEST_PLAN, ADR/
```

## Layering, and what each layer may know

The dependency direction is one-way and enforced by convention rather than by a
linter, so it is written down:

| Layer                       | May import                      | Must not know about                      |
| --------------------------- | ------------------------------- | ---------------------------------------- |
| `telegram/handler.ts`       | services, errors, observability | The database, SQL, PostgREST             |
| `services/`                 | repositories, config, errors    | HTTP, `Request`/`Response`, status codes |
| `repositories/`             | the Supabase client, errors     | The transport, the request               |
| `errors/`, `observability/` | each other only                 | Everything above them                    |

The load-bearing consequence: every database call is in `repositories/`. A
service that talks to PostgREST directly is a service whose SQL contract cannot
be tested independently.

The other consequence: `services/` never sees a status code. The handler decides
that a retryable error becomes a `500` and a deterministic one becomes a `200`;
the service only reports what happened. This is what let the
`tests/security/webhook-auth.test.ts` suite drive the entire flow over a stubbed
`fetch` without constructing a `Request`.

## The composition root

Each Edge Function's `index.ts` is a composition root and the only module in that
function that runs at module scope. Configuration is cached per isolate.

A configuration failure returns a bare `500` with an empty body and logs the
reason — never the value. That is correct and deliberate: a delivery that arrives
while the function is misconfigured _should_ be redelivered once it is fixed, and
a `500` is how that is requested.

## Configuration

`config/env.ts` validates the environment with Zod at load, and every accessor
returns a `Secret` wrapper rather than a string. `Secret.reveal()` is the only way
to get the value, so a secret cannot be interpolated into a template literal or
passed to `JSON.stringify` by accident — the type system objects.

`describeEnvironment()` backs `deno task verify-env` and reports presence, length,
format validity and non-reversible fingerprints. It never returns a value, which
is what makes the script safe to run in a shared terminal.

## Errors

One taxonomy (`errors/taxonomy.ts`), 16 codes, each carrying `retryable` and a log
level. `AppError` splits a **public message** (safe to show a user) from an
**internal detail** (safe to log, never returned).

`httpStatusForError` maps a failure to a status, and the mapping is the contract:

| Condition      | Status | Why                                                           |
| -------------- | ------ | ------------------------------------------------------------- |
| `UNAUTHORIZED` | `401`  | Wrong secret is a statement about the request, not the update |
| Retryable      | `500`  | Telegram redelivers, which is what we want                    |
| Not retryable  | `200`  | A deterministic failure reproduces on redelivery              |

`INTERNAL_ERROR` is **not retryable**, which reads backwards and is deliberate: it
means "a bug", and re-running a bug produces the bug. The same flag routes a job
to `FAILED` rather than `RETRYABLE_FAILED` per blueprint §14, so the two agree.

Response bodies are empty on every failure path. Telegram discards the body
anyway, so the only audience for it is an attacker — and a body that describes the
system is free reconnaissance. `tests/e2e/webhook.test.ts` asserts no failure
response contains a stack frame, a filename, or the words `supabase`, `postgres`
or `deno`.

## Observability

Structured JSON, one line per event, allowlist-filtered (see
[DATA_PRIVACY.md](DATA_PRIVACY.md)). Events: `webhook.accepted`,
`webhook.ignored`, `webhook.failed`, `ingestion.accepted`, `ingestion.duplicate`,
`ingestion.user_not_active`.

Every request resolves a `request_id` — a valid one from the caller is reused, an
invalid or absent one is replaced with a generated UUID. This is what makes a
delivery traceable through a log drain without correlating on `update_id`, which
is the one identifier an attacker can choose.

`createCapturingLogger` is the test seam: it collects lines in memory instead of
writing them, which is how the redaction suite can search actual output rather
than assert that a function was called.

## The database

Twenty migrations are the current source of truth. The first nine were replayed
against a disposable project and all Phase 1/2 migrations are applied to the
development project. The design decisions that shape them:

- **PostgreSQL is the enforcement point** for the state machine, `update_id`
  deduplication and row level security. See [ADR 0004](ADR/0004-job-state-machine.md)
  and [ADR 0005](ADR/0005-access-model.md).
- **Enums, not lookup tables**, for the closed vocabularies — with `templates` as a
  real table, because a template is product configuration an operator edits and a
  job holds a validated foreign key to it.
- **Partial indexes** matching the queries that exist: the recovery scan, the
  active-job limit, the expiry sweep.
- **`update_id` is the deduplication key**, and its uniqueness is a constraint
  rather than a convention.
- **Every public RPC is `SECURITY DEFINER`** because RLS is on with no policies;
  each pins an empty `search_path` and is granted to `service_role` only.

`tests/contract/migration-constants.test.ts` is the drift guard: it parses the
migration SQL and asserts that the TypeScript mirrors in `config/constants.ts`
match the enums, the transition table, the template catalogue and the terminal
state list. A migration and a constant that disagree is a test failure, not a
runtime surprise.

## Testing

Five layers, each answering a different question:

| Suite         | Question                                 | Needs                     |
| ------------- | ---------------------------------------- | ------------------------- |
| `unit`        | Does this pure function behave?          | nothing                   |
| `contract`    | Do the migrations and the mirrors agree? | nothing (parses SQL)      |
| `security`    | Does content leak, is auth enforced?     | nothing (stubbed `fetch`) |
| `integration` | Do the database's guarantees hold?       | a real project            |
| `e2e`         | Is the deployment configured?            | a deployed function       |

The security suite runs the **real** handler, service and repository over a
stubbed `fetch`, injecting `global.fetch` into `createClient`. That is the
technique worth naming: it exercises the whole path — including the Supabase
client's own URL construction and error wrapping — while keeping the test
hermetic. A test that stubbed the repository would only assert that the
application asks for deduplication, which is not the property anyone cares about.

See [TEST_PLAN.md](TEST_PLAN.md) for the full mapping to exit criteria.
