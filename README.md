# Notinn

Telegram-first note capture. Send Notinn a message, a voice note, a screenshot, a
PDF or a document, and get back a structured, searchable note.

**Status: Phase 3 is deployed in development.** Text, voice/audio, screenshots,
PDF, DOCX, TXT, and Markdown are processed by the durable PGMQ worker using one
configured Gemini model. Raw media is downloaded into bounded memory, never
stored, and zero-filled after processing. DOCX/TXT/Markdown are extracted locally
before model generation. See
[docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

---

## Requirements

- Node.js ≥ 22 (for the local toolchain — see below)
- A Supabase project (development)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

**Docker is not required.** Deno and the Supabase CLI are installed as local npm
devDependencies and invoked through `npx`, so nothing is added to `PATH` and no
global state changes. The trade-off is that `supabase start` cannot run where
Docker is unavailable, which is why the test suite is layered — see
[Testing](#testing).

## Setup

```bash
npm install                 # installs deno + supabase locally
cp .env.example .env        # then fill it in
```

`.env` is git-ignored. **Never commit it**, and never paste a token or key into a
chat, an issue or a log. `.env.example` documents every variable and contains no
values.

Verify the environment before anything else:

```bash
npx deno task verify-env
```

This reports presence, length, format validity and non-reversible fingerprints.
It never prints a secret, so its output is safe to paste into an incident channel.

## Database

```bash
npx supabase link --project-ref <ref>   # confirm the target first
npx supabase db push                    # apply migrations
```

Sixteen migrations in `supabase/migrations/`. They are the schema's source of truth;
migrations are never edited after being applied to a shared project (one
pre-release exception is recorded in
[docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)).

Local development, if Docker is available:

```bash
npx supabase start
npx supabase db reset      # DESTRUCTIVE: drops and re-applies. Local only.
```

## Deploy

```bash
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy process-job --no-verify-jwt
```

`--no-verify-jwt` is required for both endpoints. Telegram authenticates with its
webhook secret; trusted worker callers authenticate with
`X-Notinn-Worker-Secret`. Both are checked in constant time.

## Webhook

**These scripts change where a real bot delivers a real user's messages.** They
ask for confirmation before acting and refuse outright outside an interactive
terminal unless `--yes` is passed.

```bash
npx deno task webhook:info      # what is registered now — read-only
npx deno task webhook:set       # register
npx deno task webhook:delete    # remove
npx deno task smoke             # one real round trip
```

`webhook:set` registers with a secret token. Without it the endpoint is
unauthenticated and every delivery that does carry a secret is refused — the two
failure modes are indistinguishable from the bot appearing to be dead.

The webhook commands load `.env` automatically and need only
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_WEBHOOK_URL`.
They deliberately do not load the Supabase service-role key. The `smoke` command
also inspects database rows, so it still needs `SUPABASE_URL` and the service-role
key.

## Testing

```bash
npx deno task test                  # 456 tests, no database, no network
npx deno task test:unit             # pure functions
npx deno task test:contract         # migrations vs. the TypeScript mirrors
npx deno task test:security         # auth + log redaction
npx deno task test:integration      # needs a project
```

The integration and e2e suites are **ignored, not failed**, when no target is
configured. They need:

```bash
NOTINN_TEST_SUPABASE_URL=https://<dev-ref>.supabase.co
NOTINN_TEST_SERVICE_ROLE_KEY=<dev service-role key>
NOTINN_TEST_ANON_KEY=<dev publishable key>      # optional; two RLS checks skip without it
```

These names appear **nowhere** in the application, deliberately: a test run cannot
inherit the credentials exported for the function. `NOTINN_ENV=production` aborts
the run. Every row written carries an identifier above `4×10¹²`, reserving that
range for synthetic data.

```bash
npx deno task clear-test-data       # remove test rows — asks first
```

No test deletes anything. Cleanup is this one program, behind a confirmation
prompt, and it will not touch a row below the reserved floor.

## Layout

```
supabase/migrations/         16 migrations — the schema's source of truth
supabase/functions/
  telegram-webhook/          authenticated ingestion + background worker trigger
  process-job/               authenticated PGMQ consumer
  _shared/                   config · db · errors · observability · repositories
                             security · services · telegram
scripts/                     operator tooling
tests/                       unit · contract · security · integration · e2e
docs/                        ARCHITECTURE · API_CONTRACTS · DATA_PRIVACY · TEST_PLAN
                             IMPLEMENTATION_STATUS · ADR/
```

## Documentation

|                                                           |                                                         |
| --------------------------------------------------------- | ------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | Layering, the composition root, the database            |
| [API_CONTRACTS.md](docs/API_CONTRACTS.md)                 | Telegram, worker, provider, and RPC contracts           |
| [DATA_PRIVACY.md](docs/DATA_PRIVACY.md)                   | What is stored, what is never logged, why               |
| [TEST_PLAN.md](docs/TEST_PLAN.md)                         | Every suite, what it proves, what is untested           |
| [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) | Current phase, verification output, and deployment gaps |
| [ADR/](docs/ADR/)                                         | Architecture decisions and deferred work                |

## Conventions

- **No user content in logs, ever.** An allowlist, not a deny-list — an
  unrecognised field is dropped rather than sanitised.
- **The database is the enforcement point.** Deduplication, the job state machine
  and access control are constraints and triggers, not application conventions.
- **Every database call is in one file.** `_shared/repositories/`. When a service
  talks to PostgREST directly, its SQL becomes untestable without a database.
- **Fail closed.** A new log field is dropped until someone adds it; a new table
  is unreadable until someone grants it.
- **`TODO` comments name the phase that will resolve them.** A TODO without a
  target phase is a note to nobody.
