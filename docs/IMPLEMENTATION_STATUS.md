# Implementation status

**Phase:** 0 — ingestion spine
**Date:** 2026-09-17
**Last verified:** the commands in [Verification](#verification) were run and their
output is quoted verbatim below.

---

## Exit criteria

| # | Criterion                                                             | Status                                             | Evidence                                                                                                                                                                                                                                                          |
| - | --------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | A valid signed test webhook creates exactly one deduplicated job      | **Proven in code, not yet run against a database** | `tests/security/webhook-auth.test.ts` (35 tests) proves the accepted path end to end over a stubbed transport with exactly two calls in order. `tests/integration/ingestion.test.ts` proves it against a real instance — **ignored until a target is configured** |
| 2 | Replaying the same `update_id` creates no second job                  | **Proven in code, not yet run against a database** | Same two files. The integration test counts rows rather than trusting the returned outcome                                                                                                                                                                        |
| 3 | Invalid or missing secrets are rejected                               | **Proven**                                         | 5 refusal variants in `webhook-auth.test.ts`, each asserting **zero** database calls. Over the wire in `tests/e2e/webhook.test.ts` — not yet run (no deployment)                                                                                                  |
| 4 | Non-private chats rejected or safely ignored, per documented contract | **Proven**                                         | 7 ignore cases in `webhook-auth.test.ts`, each asserting `200`, zero calls, exactly one `webhook.ignored` with a reason. Contract documented in [ADR 0003](ADR/0003-ingestion-contract.md) §16.4 deviation in [ADR 0001](ADR/0001-blueprint-deviations.md)        |
| 5 | No user content or secret in logs                                     | **Proven**                                         | 17 tests in `tests/security/log-redaction.test.ts`: 10 markers × 9 scenarios, over every log line and response body, with a positive control and a mechanism check                                                                                                |
| 6 | Migrations apply to a clean instance                                  | **Proven**                                         | A from-scratch replay on 2026-09-17: `public` dropped and rebuilt as a fresh project, then all nine applied in order. See [The replay](#the-replay)                                                                                                               |
| 7 | Automated tests pass                                                  | **Proven for what can run here**                   | 264 passed, 0 failed, 29 ignored. The 29 need a database or a deployment                                                                                                                                                                                          |
| 8 | Setup and verification commands documented and reproducible           | **Done**                                           | [README.md](../README.md), [.env.example](../.env.example), [TEST_PLAN.md](TEST_PLAN.md)                                                                                                                                                                          |

**Criterion 6 is closed** — see [The replay](#the-replay). Criteria 1 and 2 remain
written-but-unrun, and both need the same thing: `NOTINN_TEST_*` configured so the
integration suite can reach a database. That is a credential step, not a code
step; nothing about them is in doubt, they simply have not been executed.

---

## What was built

### Database — 9 migrations

`supabase/migrations/`, applied in order:

| # | File                     | Contents                                         |
| - | ------------------------ | ------------------------------------------------ |
| 1 | `enums_and_helpers`      | 6 enums, `set_updated_at()`                      |
| 2 | `users`                  | Identity, status, plan                           |
| 3 | `templates`              | The 11-key catalogue + seed                      |
| 4 | `user_preferences`       | Per-user defaults                                |
| 5 | `telegram_updates`       | The acceptance ledger                            |
| 6 | `processing_jobs`        | The job + the state-machine trigger              |
| 7 | `notes` + `note_outputs` | The user's note and its renderings               |
| 8 | `usage_events`           | Immutable metering + its trigger                 |
| 9 | `ingestion_functions`    | `ensure_telegram_user`, `accept_telegram_update` |

Every table: RLS enabled, **zero policies**, `REVOKE ALL` from `anon` and
`authenticated`. Every function: `search_path` pinned. Every trigger function:
`EXECUTE` revoked from `PUBLIC`. Two `SECURITY DEFINER` functions, granted to
`service_role` only.

### Application — 1 Edge Function

`supabase/functions/telegram-webhook/` plus 18 modules under `_shared/`: config
validation with `Secret`-wrapped accessors, a 16-code error taxonomy, an
allowlist logger, constant-time secret comparison, Zod update validation,
classification, routing, and exactly two database calls in one repository.

### Tooling — 6 scripts

`verify-env`, `set-webhook`, `delete-webhook`, `webhook-info`, `smoke-test`,
`clear-test-data`. All confirmation-guarded where they mutate anything.

### Tests — 264 passing, 29 ignored

See [TEST_PLAN.md](TEST_PLAN.md).

---

## Verification

Run on 2026-09-17, in this order:

```
$ npx deno fmt --check
Checked 63 files                                    # clean

$ npx deno lint
Checked 44 files                                    # clean

$ npx deno task check
Check × 44 (supabase, scripts, tests)               # clean, exit 0

$ npx deno test --allow-read --allow-env --allow-net
ok | 264 passed | 0 failed | 29 ignored (3s)
```

Per suite:

```
unit         ok | 178 passed | 0 failed      (1s)
contract     ok |  33 passed | 0 failed     (61ms)
security     ok |  52 passed | 0 failed    (769ms)
integration  ok |   0 passed | 0 failed | 22 ignored  (433ms)
e2e          ok |   1 passed | 0 failed |  7 ignored   (14ms)
```

The integration and e2e suites report `ok` with everything ignored: correct
behaviour with no target configured, not a pass. The 29 ignored tests are the
count of checks that need infrastructure.

### Correction: `deno check` with no arguments checks nothing

Earlier revisions of this document quoted `npx deno check` as evidence, with a
file count the command never produced. **That invocation is a silent no-op** — it
exits 0 having type-checked zero files. Measured directly on 2026-09-17:

```
$ npx deno check                    # no arguments
exit 0, files checked: 0

$ npx deno task check
exit 0, files checked: 44
```

`package.json`'s `check` script had a milder version of the same flaw: it named
one entry point, so `_shared/` was covered only through its imports and the tests
and scripts were not covered at all. Both now check all 44 files, via a glob task
added to `deno.json` and documented in [CLAUDE.md](../CLAUDE.md).

The finding is recorded rather than quietly fixed. A command that reports success
without doing work is the exact failure this project's testing rules exist to
catch, and the earlier claim was mine.

### Database state (read-only inspection of the dev project)

After the [replay](#the-replay):

```
9 migrations recorded, in file order

RLS enabled, 0 policies on all 8 tables:
  note_outputs · notes · processing_jobs · telegram_updates
  templates · usage_events · user_preferences · users

No table granted to anon, authenticated or PUBLIC.
No function granted to anon, authenticated or PUBLIC.

Advisors (security): 1 finding, INFO level
  rls_enabled_no_policy × 8
```

That advisor finding **is the intended posture** — see
[ADR 0005](ADR/0005-access-model.md). There are no ERROR or WARN findings.

---

## The replay

Run on 2026-09-17, with explicit approval, against the development project
`neqfilxouhowuyynntdh`. This closed exit criterion 6 and resolved the migration
divergence.

### What the target actually contained

The project was **empty**. Zero rows in `users`, `telegram_updates`,
`processing_jobs`, `notes`, `note_outputs`, `usage_events` and
`user_preferences`; 11 rows in `templates`, which migration 3 recreates.

The approval covered deleting "synthetic test data" — and there turned out to be
none, because `NOTINN_TEST_*` was never configured and the integration suite has
never run against this project. The only thing the drop destroyed was the seeded
catalogue, which the replay put back.

### Mechanism

`supabase db reset --linked` is the tool built for this and was not usable: the
project is not linked, and linking needs an access token or the database password,
neither of which exists on this machine and neither of which was requested. The
same operation was performed through MCP and written down as a reviewable artefact
— [supabase/reset-public-schema.sql](../supabase/reset-public-schema.sql) — rather
than left as a command that existed only in a chat message.

Read-only safety checks, run before anything was dropped:

- Schema `public` held **only this project's own objects** — 8 tables, 5
  functions, 27 indexes, 30 types, all owned by `postgres`.
- **Nothing outside `public` depended on anything inside it**, so `drop schema
  public cascade` could not take a platform object with it.
- The ledger held **exactly the nine project migrations** and nothing else.
- `postgres` owns the database and is a member of `pg_database_owner`, so
  recreating the schema `postgres`-owned is equivalent to a fresh project.

### Why the replay proves something

This is the part that matters, and it is the reason the reset script is emphatic
about its default privileges.

Supabase grants `EXECUTE` on every newly created function to `anon` and
`authenticated`; PostgreSQL grants it to `PUBLIC`. Those defaults are what put a
client-role `EXECUTE` grant on three trigger functions, which the migrations then
`REVOKE`. A replay against a schema where the defaults had **not** been restored
would have proved only that a `REVOKE` is a no-op when there is nothing to revoke.

So the defaults were restored, and then **verified to be live** — before applying
any migration, with a throwaway probe function:

```
probe, created after the reset   {=X/postgres, postgres=X/postgres, anon=X/postgres,
                                  authenticated=X/postgres, service_role=X/postgres}
set_updated_at, as the old
deployment carried it            {=X/postgres, postgres=X/postgres, anon=X/postgres,
                                  authenticated=X/postgres, service_role=X/postgres}
```

Byte-for-byte identical. The environment reproduced the exact condition that had
caused the divergence, and the migrations' `REVOKE` then stripped it. The probe was
dropped immediately afterwards.

### Result

All five functions now carry an identical ACL — see [open item 1](#1-migration-divergence--resolved-by-the-replay).
No `=X`, no `anon=X`, no `authenticated=X` anywhere.

### Ledger reconciliation

MCP's `apply_migration` stamps each ledger row with the time it ran and puts the
whole filename in `name`, where `supabase db push` records the filename's version
prefix. Left uncorrected, a later `db push` would have matched none of the nine and
tried to apply all nine against objects that already exist. Both fields were
recovered from what `apply_migration` wrote, so the correction is exact rather than
a retype:

```sql
update supabase_migrations.schema_migrations
set version = split_part(name, '_', 1),
    name    = substring(name from position('_' in name) + 1);
```

The ledger is now byte-identical to its pre-replay state. The reconciliation is
recorded in [reset-public-schema.sql](../supabase/reset-public-schema.sql) so the
next replay does not have to rediscover it.

---

## Open items

### 1. Migration divergence — RESOLVED by the replay

Three migration files had been edited **after** being applied to the dev project,
adding a `REVOKE` on three trigger functions. The deployed project kept the old
ACLs, so repository and deployment disagreed.

**The replay resolved it.** All five functions now carry an identical ACL:

```
set_updated_at                     {postgres=X/postgres,service_role=X/postgres}
enforce_processing_job_transition  {postgres=X/postgres,service_role=X/postgres}
protect_usage_event_immutability   {postgres=X/postgres,service_role=X/postgres}
ensure_telegram_user               {postgres=X/postgres,service_role=X/postgres}
accept_telegram_update             {postgres=X/postgres,service_role=X/postgres}
```

No `=X` (PUBLIC), no `anon=X`, no `authenticated=X` anywhere. Repository and
deployment now agree, so the pre-release file edit is no longer contingent on
anything.

### 2. Exit criterion 6 — CLOSED

"Migrations apply to a clean instance" is proven — see [The replay](#the-replay).
Kept in this list rather than deleted because it was the Phase 0 blocker that
shaped the work, and because the reset script it produced is a live artefact that
the next replay will need.

### 3. `error_detail` is the one allowlisted free-text log field

Stated plainly because it is the residual privacy risk. A PostgreSQL error
_message_ can quote the value that violated a constraint, and `error_detail`
accepts a message.

Mitigated: only `error.code` and `error.message` are read; **`error.details` is
never touched**, and that is the field where PostgreSQL puts `Key (…)=(…) already
exists`. Asserted twice — on the classifier directly, and end to end with the
leaking fields populated with markers. The alternative mitigations (dropping
`message`, keeping only the SQLSTATE) would remove most of the diagnostic value.

**Residual risk accepted and documented** in
[DATA_PRIVACY.md](DATA_PRIVACY.md). See also item 5.

### 4. A malformed reply from `ensure_telegram_user` loses the update

If `ensure_telegram_user` returns a row the application cannot parse, the handler
acknowledges with `200` and logs one `INTERNAL_ERROR`, and the update is **not**
recorded.

This is deliberate and follows from `INTERNAL_ERROR` being non-retryable — a bug
reproduces on retry, and the same flag routes a job to `FAILED` rather than
`RETRYABLE_FAILED` per blueprint §14. Nothing is lost in practice: the failure is
in the _accept_ call returning an unreadable row, which means the row was written
and the job is durable. But an operator reading only the status code would not know
that, which is why it is recorded here.

Asserted in `webhook-auth.test.ts` — it asserts what is true (200, empty body,
exactly one error-level `INTERNAL_ERROR`) rather than what an earlier draft of the
test assumed.

### 5. Every blueprint deviation and inference — ANSWERED 2026-09-17

All five deviations are decided and recorded in
[ADR 0001](ADR/0001-blueprint-deviations.md). Two needed a product decision:

- **§16.4** — silent ignore stays for Phase 0, which has no outbound messaging, and
  becomes a **fixed reply once per chat from Phase 1**. The message text already
  exists, unused, in `errors/taxonomy.ts`.
- **§6.3** — turned out **not to be a deviation**. Blueprint §25 schedules Meeting
  Notes for Phase 2 alongside transcription; the heuristic will judge the
  transcript, the only real evidence of what a recording is.

Three resolved with no code change: the eleventh template and TXT/Markdown →
Clean Note both stay, because §26.2 requires deterministic routing for those input
types, and the blueprint's filename is cosmetic.

The two state-machine inferences in [ADR 0004](ADR/0004-job-state-machine.md) were
confirmed the same day: `CANCELLED` keeps its edge from every non-terminal state,
and `telegram_file_id` and `note_id` stay exempt from terminal immutability.
**Nothing in the repository is now flagged for product confirmation.**

### 6. Repository history — CLOSED

Initialised on branch `main`. The initial commit `a3fe374` carries all 77 files of
Phase 0. Kept in this list rather than deleted because the migration-divergence
discussion above would normally have been answered by history, and this commit is
the first point at which that became possible.

It does not retroactively distinguish the three post-hoc migration edits described
in item 1 — they predate it, so the commit shows the edited files as their original
form. The replay is what settled that question. What the commit does provide is a
baseline: from here, every migration is a reviewable diff rather than a whole-file
snapshot with no predecessor.

`.gitattributes` ships in that same commit as a Phase 0 fix rather than a Phase 1
one. `core.autocrlf=true` on the development machine rewrites every file to CRLF on
checkout, and `deno fmt --check` fails on a CRLF tree — so without `eol=lf` a fresh
clone could not reproduce the command in [Verification](#verification), which is
exit criterion 8. It was added before committing rather than after, so every path
in the initial commit is already normalised (`i/lf w/lf`) and no later commit has to
clean up line endings.

### 7. Not reproducible on this machine, by design

No Docker and no WSL here, so `supabase start` cannot run and the integration and
e2e suites cannot execute locally. See
[ADR 0006](ADR/0006-pinned-dependencies.md). Everything else runs.

---

## Deployment checklist

Not performed. Every item requires approval.

1. `npx supabase link --project-ref <dev-ref>` — confirm the target is the
   **development** project.
2. `npx supabase db push` — expect it to apply **nothing**. The replay already
   applied all nine, and the ledger was reconciled to the filenames. A push that
   tries to re-apply them means that reconciliation did not survive.
3. `deno task verify-env` — all checks pass, no FAIL rows.
4. Generate a webhook secret (`openssl rand -hex 32`), set it as a function secret
   **and** keep it for step 6.
5. `npx supabase functions deploy telegram-webhook --no-verify-jwt` — confirm the
   dashboard reports `verify_jwt` off for this function.
6. `deno task webhook:set` — registers with the secret from step 4.
   **Requires explicit approval**: this modifies a real Telegram bot.
7. `deno task webhook:info` — confirm the registered URL and that a secret token is
   recorded.
8. `deno task smoke` — a real round trip.
9. `NOTINN_TEST_*` set → `deno task test:integration` → criteria 1 and 2 close.
   Criterion 6 is already closed by the replay.

---

## Recommended next prompt

> Phase 1: the text note MVP, per blueprint §25. Text and forwarded-message
> ingestion, the five text templates (Clean Note, Short Summary, Detailed Summary,
> Key Points, Action Items), structured-output validation, save/regenerate/recent/
> delete, and usage events. Add the Gemini Flash provider behind the
> `_shared/providers/` seam — one concrete provider plus a fake, no more. Add the
> once-per-chat reply to a non-private chat that
> [ADR 0001](ADR/0001-blueprint-deviations.md) §3 schedules for this phase, and the
> guard that makes it safe. Do not add voice, documents, search, billing or a
> dashboard; §25 puts voice in Phase 2 and images and documents in Phase 3. Start
> by telling me which Phase 0 decisions this makes wrong.

Phase 0 has no prompt outstanding. Its only remaining item is a credential step:
`NOTINN_TEST_*`, which closes exit criteria 1 and 2.
