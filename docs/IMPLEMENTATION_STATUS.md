# Implementation status

**Phase:** 6C — Privacy & Account Lifecycle (deployed to development)
**Date:** 2026-09-21
**Last verified:** the commands in [Verification](#verification) were run and their
output is recorded below.

## Phase 6C privacy and deletion snapshot

The Phase 6C slice is implemented, verified, and deployed to development.

- `/privacy` and `/terms` remain readable regardless of Closed Alpha or deletion
  state and disclose the separate Notinn, Telegram, Gemini, and OpenRouter data
  boundaries.
- `/delete_account` requires exact confirmation, immediately blocks processing,
  cancels active jobs, releases reserved quota, and starts the chosen seven-day
  cancellation window. `/cancel_deletion` restores the previous access state
  before the deadline without restarting cancelled work.
- Database cron owns finalization. It deletes owned content and operational
  state, anonymizes Telegram identity, and retains only immutable content-free
  usage metadata plus lifecycle audit timestamps against an internal UUID.
- Existing command/navigation/note callbacks are lifecycle-gated so old buttons
  cannot restart provider or quota work during deletion.
- Formatting, linting, full type-checking, and the hermetic unit/contract/security
  suite pass: **603 passed, 0 failed**.
- The complete migration executed successfully against the development schema
  inside `BEGIN … ROLLBACK`; follow-up checks confirmed neither its table nor cron
  job remained.
- The formal privacy notice, Closed Alpha terms, deletion runbook, incident
  response runbook, and [ADR 0016](ADR/0016-account-deletion-lifecycle.md) record
  the user and operator contracts.
- Migration `phase6c_privacy_account_lifecycle` is recorded remotely as version
  `20260921135607`. `telegram-webhook` version 38 is ACTIVE with
  `verify_jwt=false`; an unsigned POST receives an empty HTTP 401 response.
- Gemini API is currently treated as unpaid tier: user-facing disclosure
  prohibits sensitive/confidential submissions and explains provider handling.
  Gemini AI Pro consumer access does not by itself establish Cloud API billing.
- The native menu source includes Privacy, Terms, and Delete Account. Applying it
  remains a local operator step because this workspace intentionally has no bot
  token or `.env` file.

## Phase 6B closed-alpha snapshot

The official Phase 6B slice is implemented, verified, and deployed to the
development project.

- Existing development users are grandfathered into active Closed Alpha access.
  New Telegram identities are pending and cannot create jobs or consume provider
  quota until an invitation is redeemed.
- `/start <invite>` redeems one normalized invite atomically. Postgres stores only
  a SHA-256 digest; raw invite codes exist only in the operator terminal and the
  invitation delivered to the user.
- Access states are `pending`, `active`, and `suspended`. Command, navigation, and
  note callbacks enforce the state for immediate feedback, while the lifecycle and
  quota database gates remain authoritative.
- The guarded `alpha-admin` task creates bounded, expiring invites and changes a
  Telegram user's access state. It refuses production and requires confirmation.
- Daily UTC allowances complement monthly quotas. Initial values are Alpha
  50/20/20, Free 50/50/50, and Pro 200/100/100 for new notes, regenerations, and
  Ask Notes. `/usage` displays both periods.
- RLS is enabled on all three new tables. Direct table access is revoked from
  client and service roles; narrow definer RPCs are service-role only.
- Migration `phase6b_closed_alpha_access` is recorded remotely as version
  `20260921102903`. `telegram-webhook` version 37 and `process-job` version 35
  are ACTIVE with `verify_jwt=false`; unsigned requests to both return an empty
  HTTP 401 response.
- Remote transactional smoke coverage proved invite activation, the exact daily
  boundary, quota consumption, and rollback without retaining test data. Remote
  configuration matches the approved daily and monthly limits, and the existing
  development user remains active.
- Formatting, linting, full type-checking, and the hermetic suite pass:
  **587 passed, 0 failed**. The credentialed integration/e2e gate reports
  **1 passed, 0 failed, 32 ignored** because no automated live-test identity is
  configured.
- Post-migration advisors reported no new actionable Closed Alpha defect. The
  no-policy notices are the intentional service-role-only RLS model; the existing
  `pg_net` placement warning and pre-existing `notes.current_output_id` index
  advisory remain outside this release.
- The decision is recorded in
  [ADR 0015](ADR/0015-closed-alpha-access.md).

## Cross-provider fallback snapshot

The provider-resilience layer is implemented, verified, and deployed to development.

- The generation chain is Gemini primary, the configured Gemini fallback model,
  then OpenRouter using `openrouter/free`.
- Cross-provider fallback is attempted only after a provider `429`, timeout, or
  `5xx`. Validation failures, malformed structured output, and permanent `4xx`
  responses are returned unchanged rather than hidden by another provider call.
- Text, audio, image, PDF, and grounded `/ask` generation use the same provider
  boundary. OpenRouter requests require structured-output support and deny routing
  to providers that collect user data.
- One user action still consumes one logical quota reservation. Successful usage
  records store `provider=openrouter` and the concrete model selected by the free
  router, rather than the router alias.
- `OPENROUTER_API_KEY` is optional and secret-wrapped. With no key configured,
  both functions retain their previous Gemini-only behavior. When a key is added,
  the model defaults to `openrouter/free`; `OPENROUTER_FALLBACK_MODEL` is only an
  optional override.
- Formatting, linting, full type-checking, and the hermetic suite pass:
  **573 passed, 0 failed**.
- `telegram-webhook` version 35 and `process-job` version 33 are ACTIVE with
  `verify_jwt=false`. Unsigned live requests to both functions return an empty
  HTTP 401 response.
- The operator reports that `OPENROUTER_API_KEY` is configured in development.
  Both freshly deployed functions pass configuration bootstrap without revealing
  the value; exercising the fallback still requires a genuine transient
  primary-provider failure and will not be forced against user traffic.

## Phase 6A deployed snapshot

Phase 6A is implemented, verified, and deployed to the development project.

- Alpha, Free, and Pro plan allowances are database configuration rather than
  application constants. The approved Free allowance is 50 per month for new
  notes, regenerations, and semantic answers; Alpha remains 500/200/200 and Pro
  remains 1,000/300/300.
- New-note generation, regeneration, and semantic answers reserve one logical
  monthly unit before provider work. The database serializes concurrent checks on
  the user/metric/month bucket and uses an idempotent reservation key.
- Reservations are consumed after provider work begins, including provider
  failures; pre-provider failures release them. Unreconciled reservations expire
  after twenty minutes and are reclaimed on the next bucket reservation.
- `/usage` and its main-menu action display the active plan, UTC monthly period,
  consumed units, and in-flight reservations. The native menu definition now has
  nine commands; the Telegram-side menu update remains an operator action because
  the bot token is deliberately unavailable in this workspace.
- The four quota tables contain identifiers and counters only. RLS is enabled,
  direct table access is revoked, and the four quota RPCs are available only to
  `service_role`.
- `users.plan_key` has a covering index for its new plan-catalogue foreign key.
- Formatting, linting, full type-checking, and the hermetic suite pass:
  **539 passed, 0 failed**.
- Migrations `phase6a_plan_entitlements_and_quota` and
  `phase6a_plan_fk_index` are recorded remotely. `telegram-webhook` version 33
  and `process-job` version 30 are ACTIVE with `verify_jwt=false`.
- Remote verification confirmed Free `50/50/50`, Alpha `500/200/200`, Pro
  `1,000/300/300`, a zero-use Closed Alpha `/usage` summary, deny-by-default
  table privileges, service-role-only quota RPCs, and an empty-body HTTP 401 for
  an unsigned webhook request.
- The decision and retry semantics are recorded in
  [ADR 0014](ADR/0014-atomic-plan-quota-reservations.md).

## Phase 5 current snapshot

### Phase 5.5 navigation layer

The pre-Phase-6 navigation and commercial UX layer is implemented, verified, and
deployed to the development environment.

- `/start` now provides compact onboarding, while `/menu` opens a two-column home
  dashboard for New Note, My Notes, Search, Ask Notes, Templates, Settings, and Help.
- `/help` is a category wizard with separate Create, Find, Templates, Settings,
  and Privacy guidance instead of a long command wall.
- `/settings` is now an inline wizard. Output language, privacy mode, and default
  text/voice/document formats are selectable with buttons; the active value carries
  a checkmark and successful changes return to a refreshed settings summary.
- `/recent` uses five-note pages, bounded titles, opaque Open callbacks, Previous/
  Next navigation, and useful empty-state actions.
- Search and Ask results use descriptive source/note buttons and always expose a
  follow-up action, recent notes, or the main menu. Queries remain command-based
  until a durable conversation-draft state is introduced.
- `/templates` now has a visual overview and entry points for defaults, creation,
  and management. The existing bounded command syntax remains the write path, so
  no partial template draft can be lost with an Edge Function isolate.
- Resource-independent UI callbacks use a separate validated `v2` codec. Note
  callbacks retain their owner-checked UUID-bearing `v1` contract; navigation does
  not use a fake note identifier.
- A guarded `bot-menu:set` operator command configures and reads back Telegram's
  private-chat native command menu. It is not run as part of ordinary deployment.
- No database migration, new secret, or worker deployment is required.
- Formatting, linting, full type-checking, and the hermetic suite pass:
  **519 passed, 0 failed**. The credentialed integration/e2e invocation reports
  **1 passed, 0 failed, 32 ignored** because no test target is configured.

The preference, custom-template, and export slices of Phase 5 are implemented and
deployed to development. The completed-note UI and export typography have also
received their pre-Phase-6 polish pass:

- `/settings` shows and updates output language (`mirror`, `id`, `en`), privacy
  mode (`balanced`, `minimal`), and default templates for text, voice/audio, and
  document/image inputs.
- The atomic ingestion RPC resolves template overrides and snapshots template,
  output language, and privacy mode onto the durable job. Settings changes affect
  future accepted updates only; queued/retrying jobs remain deterministic.
- The worker sends the snapped output language to Gemini. `mirror` keeps the
  existing source-language behavior.
- `stage_note_for_delivery` enforces minimal retention from the database-owned
  job snapshot. Minimal jobs persist no normalized source and no source digest;
  staging immediately scrubs direct text, Telegram file handles/identifiers, and
  filenames because delivery retries reuse the staged note. Terminal transitions
  repeat the scrub defensively.
- A minimal note cannot be regenerated or reformatted because its source was not
  retained. Telegram now explains that condition instead of saying the note is
  missing.
- Existing users were backfilled with one preference row. New users receive the
  row during idempotent onboarding.
- `/templates` lists built-in and owner-scoped custom templates. `/template create`
  accepts a name, any combination of `text`, `voice`, and `document`, and a bounded
  generation objective. `/template archive` soft-archives an owned template and
  resets any default that referenced it.
- Each user may keep at most five active custom templates. A per-owner advisory
  transaction lock makes that quota race-safe, while an active job prevents its
  template from being archived until processing finishes.
- Custom objectives always reuse Notinn's fixed structured-note schema. Generation
  reads recheck active status, owner, and source-type applicability, so callback
  data and template text are never authorization or policy controls.
- Every note initially shows only icon-labelled Save/Unsave, Options, and Delete.
  Options reveals
  regeneration, a paginated format picker, and a dedicated export submenu only
  when requested. Semantic button colors distinguish primary, success, and danger
  actions. Template labels are not queried during normal note delivery.
- List-like lines inside summaries and sections are normalized before rendering.
  Hyphen, asterisk, bullet, checkbox, and numbered prefixes become compact lists
  with continuation indentation in Telegram, Markdown, TXT, and PDF instead of
  collapsing into prose or gaining paragraph-sized gaps between every item.
- Markdown, plain-text, and PDF export use the same owner-scoped current-note read
  used by Open, validate `content_json`, and render every structured-note group
  without another Gemini request.
- PDF export uses an A4 multipage layout, deterministic wrapping, page numbers,
  document metadata, and an embedded exact UTF-8 text copy for source characters
  outside the standard PDF display font.
- Export filenames are bounded ASCII slugs, Markdown-controlled characters are
  escaped, and output is capped at 2 MiB. The generated bytes exist only in
  memory, are sent with Telegram `sendDocument`, and are zero-filled afterward;
  no export object is written to Supabase Storage.
- Preference RPCs are `SECURITY DEFINER`, use an empty `search_path`, and are
  executable only by `service_role`. Read-only production verification found one
  preference row for one user, no jobs missing snapshots, all four FK indexes,
  and no client-role execute privilege.
- Migrations `phase5_user_preference_contract`,
  `phase5_scrub_staged_job_payload`, and `phase5_custom_templates` are applied.
  `telegram-webhook` version 28 and `process-job` version 29 are active.
- The deployed Phase 5 baseline passed **515 tests**; the Phase 5.5 layer raises
  the suite to **519 passed, 0 failed**.
- Phase 5.5 is active on `telegram-webhook` version 31. The function was restored
  to the repository source after the one-time operator action, remains configured
  with `verify_jwt=false`, and rejects an unsigned POST with HTTP 401 and an empty
  body.
- Telegram's private-chat native command menu contains eight verified commands:
  `/start`, `/menu`, `/recent`, `/search`, `/ask`, `/templates`, `/settings`, and
  `/help`. The default chat menu button opens that command list.
- The bullet normalization and icon-labelled Options UI are live on
  `telegram-webhook` v28 and `process-job` v29. Both functions report ACTIVE, and
  an unsigned webhook probe remains fail-closed with HTTP 401 and an empty body.

The consistency and retention decision is recorded in
[ADR 0013](ADR/0013-future-job-preference-snapshots.md).

## Phase 4 snapshot (completed)

Library Search and the Semantic Library foundation are implemented and deployed to development:

- `/search <keywords>` searches explicitly saved notes by title, validated tags,
  retained normalized source, and current rendered output. Historical outputs do
  not create duplicate results.
- Search uses weighted stored `tsvector` columns, two GIN indexes, a partial
  owner/update index for saved notes, `websearch_to_tsquery`, ranked results, and
  deterministic tie-breaking. Queries are capped at 200 characters and results
  at ten.
- `search_saved_notes` contains the `user_id`, `is_saved`, and undeleted predicates
  in one `SECURITY DEFINER` statement. `anon` and `authenticated` have no execute
  privilege; `service_role` does.
- The development database has indexed all six existing notes and outputs. A
  controlled query matched one owned saved note and zero rows for a foreign UUID.
- The Telegram result contains opaque Open callbacks, never note IDs or query text
  in callback payloads or logs.
- `/ask <question>` lazily indexes saved current outputs in batches of at most
  twenty, retrieves up to five owner-scoped semantic matches, and generates an
  evidence-only answer with cited note titles and opaque Open buttons.
- `note_embeddings` stores 768-dimensional vectors, model/hash metadata, and
  references only—no duplicate note text and no raw files. Unsave, regeneration,
  and deletion invalidate vectors automatically.
- The embedding adapter uses `gemini-embedding-001` with retrieval-specific task
  types and manual normalization. It shares `GEMINI_API_KEY`; the non-secret
  `GEMINI_EMBEDDING_MODEL` switch is optional so every existing path stays healthy
  until semantic search is enabled.
- pgvector 0.8.2, four embedding-table indexes, client-role denials, service-role
  grants, and a zero-row foreign-owner probe are verified in development.
- `telegram-webhook` version 20 is active with `verify_jwt=false` and custom secret
  authentication. Type-check and the hermetic suite pass: **484 passed, 0 failed**.
- `GEMINI_EMBEDDING_MODEL=gemini-embedding-001` is configured. A fresh deployment
  booted successfully and still rejects an unsigned POST with an empty HTTP 401.
- A live `/ask` indexed all four saved notes with `gemini-embedding-001`, returned
  a grounded answer with sources, and left zero stale vectors. Production
  verification found four embedding rows for one owner, three embedding usage
  events, and two recent grounded-generation events; the generation fallback to
  `gemini-3.5-flash-lite` also completed successfully.

The two-slice decision and semantic security boundary are recorded in
[ADR 0011](ADR/0011-phase-4-search-first.md) and
[ADR 0012](ADR/0012-semantic-library.md).

## Phase 3 snapshot (completed)

Implemented in the working tree and deployed to development:

- Screenshots/photos and JPEG/PNG/WebP documents are content-signature checked,
  sent inline to Gemini, and returned as extracted text plus one structured note.
- PDFs are signature/encryption checked, sent as Gemini `document` input, and
  return extracted text, a structured note, and an observed page count for usage
  telemetry.
- DOCX uses a deterministic ZIP/OOXML extractor with entry-count, expanded-size,
  compression-ratio, unsafe-path, encryption, ZIP64, macro, XML-size, and
  DTD/entity guards. TXT/Markdown require strict UTF-8.
- All file downloads have metadata and streaming byte limits. Raw buffers are
  zero-filled after use and never written to Postgres, PGMQ, logs, Gemini storage,
  or Supabase Storage. The project still has zero Storage objects.
- The provider boundary now covers text, audio, image, and PDF while retaining one
  Gemini API key. `gemini-3.8-flash` is primary and `gemini-3.5-flash-lite` is a
  whole-request fallback only for 429, timeout, and Gemini 5xx failures.
- Vision usage is recorded with `operation = vision`; PDF page counts populate
  `document_pages` when the provider can determine them.
- `telegram-webhook` version 17 and `process-job` version 21 are active with
  `verify_jwt=false`; each continues to enforce its custom secret header.
- Type-check and the hermetic suite pass: **470 passed, 0 failed**. The
  credentialed integration/e2e suite remains unavailable because `.env` is not
  present in this checkout.
- A live screenshot completed after one transient Gemini retry: the note was
  delivered, `vision` usage recorded, the Telegram file handle cleared, and
  Storage remained empty.
- Early live PDFs reached Gemini but exhausted their retries on HTTP 500/429. The
  PDF contract was reduced from exhaustive extraction to a compact source digest
  capped at 12,000 characters, and safe upstream HTTP-only diagnostics were added.
  A later 3.48 MiB PDF completed successfully after one transient 429: one note
  and one `vision` usage event were created, the queue message and Telegram file
  handle were cleared, and Storage remained empty. DOCX/TXT remain in the live
  matrix.
- A live 39 KiB Markdown product specification completed on
  `gemini-3.5-flash-lite` after the primary model hit its limit. The fallback ran
  inside the same worker attempt (`attempt_count = 0`), created one note and one
  generation usage event, cleared the Telegram file handle and queue message,
  and left Storage empty. This verifies both deterministic Markdown extraction
  and the controlled same-provider fallback path.
- A live 476-byte TXT file completed on `gemini-3.5-flash-lite` in its first
  worker attempt, creating one note and one generation usage event with no final
  error.
- A live 21 KiB DOCX meeting-notes file passed deterministic OOXML extraction
  and completed on `gemini-3.5-flash-lite` in its first worker attempt, creating
  one note and one generation usage event with no final error. After both tests,
  all downloadable Telegram file handles were cleared, the processing queue and
  active-job count were zero, and Supabase Storage still contained zero objects.
  The retained `telegram_file_unique_id` values are stable non-downloadable
  Telegram identifiers, not file handles or raw content.
- Recovery now corrects a PGMQ message that is read a few seconds before
  `next_attempt_at`, preventing the normal five-minute processing visibility
  timeout from adding a second unintended delay.
- A provider-rate-limit status now tells the user that retry is automatic in
  about five minutes and that the original upload does not need to be sent again.

The data-lifecycle decision is recorded in
[ADR 0009](ADR/0009-phase-3-ephemeral-documents.md). There is deliberately no
temporary bucket or 12-hour retention window; an orphan-cleanup worker becomes
mandatory only if a future conversion path starts creating Storage objects.

## Phase 2 snapshot (completed)

Implemented in the working tree and deployed to the development project
`neqfilxouhowuyynntdh` (dashboard name: `ProjectArchii`):

- Atomic ingestion plus `pgmq.send`: a committed job always has one durable queue
  message containing only its internal UUID.
- `process-job`, authenticated with `X-Notinn-Worker-Secret`, supports direct
  low-latency and bounded batch/recovery invocations.
- The webhook schedules a background direct invocation only after durable
  ingestion. Recovery Cron runs every minute as the operational fallback.
- Initial text generation moved off the Telegram request path. Status messages
  are edited into the final result when possible.
- Voice/audio is downloaded privately into memory, bounded to 14 MiB raw / 30
  minutes so its base64 request stays below Gemini's 20 MB total-request limit,
  sent inline to the same configured model, and zero-filled in a `finally` block.
  Raw binary is never persisted.
- Gemini returns transcript plus structured note in one response. The transcript
  is delivered for review and becomes the source for later format changes,
  including Meeting Notes.
- Notes are staged in `DELIVERING`; completion and queue acknowledgement happen
  only after Telegram delivery. A delivery retry reuses the staged note without
  another Gemini request or duplicate insert.
- Seven Phase 1/2 migrations are recorded remotely, including the Phase 2 queue
  migration. Local migration filenames use the remote versions to prevent CLI
  migration-history drift.
- `telegram-webhook` and `process-job` were live-verified as version 10 with
  `verify_jwt=false`; each function enforces its own secret header.
- All eight runtime variables are configured in Supabase. Live unauthenticated
  requests to both functions return an empty HTTP 401, proving configuration
  loads and each custom secret boundary fails closed.
- `notinn-process-jobs-recovery` runs every minute. Its URL and worker secret are
  read from Vault at execution time; manual and scheduled calls returned HTTP
  200 with an empty queue.
- The Telegram webhook is registered for `message` and `callback_query`. Live
  text and voice messages each completed with zero retries, Gemini token usage
  was recorded, and PGMQ returned to zero depth. The voice test also proved the
  Delete callback: deleting the delivered note removed it and cleared the job's
  note reference as designed.
- The voice test left zero Storage buckets, zero Storage objects, and zero
  application `bytea` columns. Audio duration/size metadata was recorded, while
  the Telegram file handle was cleared after completion.
- Supabase's managed `issue_pg_net_access` event trigger restores `pg_net` ACLs
  after DDL, so the attempted revoke migration does not suppress the advisor's
  `extension_in_public` warning. Verification confirmed that `net` is not a Data
  API schema and no public Notinn function wraps it; this warning is accepted
  unless that exposure configuration changes.

Verification on this machine:

```text
deno fmt --check                 clean
deno lint                        clean
deno check ...                   all TypeScript files checked
unit + contract + security       457 passed, 0 failed
```

The integration/e2e command was invoked: its production-target guard passed and
all 32 target-dependent checks were explicitly ignored because test credentials
are not configured. The remote database verification confirmed the `notinn_jobs`
PGMQ queue, `processing_jobs.queue_message_id`, all 11 template schemas, and
service-role-only execution of the worker RPCs. A transaction-scoped live test
also created a synthetic user/update/job, verified that the queue contained the
same opaque job UUID, and rolled the transaction back; follow-up counts were
zero for the synthetic rows and queue message. Later live checks verified the
Cron worker, the registered Telegram webhook, one text round trip, one voice
round trip, and note deletion. The implementation commit was pushed to `main`.

The remainder of this file preserves the Phase 0 completion record.

---

## Phase 0 exit criteria (historical)

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

Database migration and function deployment were performed on 2026-09-17 after
the user approved continuing to the deployment stage.

1. **Done:** confirm the development target and inspect its existing Phase 0
   schema/data before writing.
2. **Done:** apply all seven Phase 1/2 migrations and align local filenames with
   the remote migration versions.
3. **Done:** verify PGMQ, template schemas, RPC grants, and advisors against the
   real database.
4. **Done:** deploy `telegram-webhook` and `process-job` with custom secret-header
   authentication and Supabase JWT verification disabled.
5. **Done:** set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
   `INTERNAL_WORKER_SECRET`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and
   `GEMINI_MODEL` plus the environment/log settings as Edge Function secrets;
   confirm both functions now reject unsigned calls with an empty HTTP 401.
   `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite` is configured and has completed
   live Markdown/TXT/DOCX paths. `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`
   is also configured for Semantic Library.
6. **Done:** configure a recovery Cron to POST
   `{"trigger":"recovery","batch_size":5}` every minute with the private worker
   header. The endpoint URL and secret are read from Vault; neither is stored in
   migration SQL or source control. A manual request returned HTTP 200 and recent
   Cron runs report `succeeded`.
7. **Done:** `deno task webhook:set` — register both `message` and
   `callback_query` with the
   secret from step 5.
8. **Done:** `deno task webhook:info` — confirm the registered URL, allowed updates, and
   secret token.
9. **Done:** real text and voice-note round trips through Telegram, PGMQ, Gemini,
   note delivery, and queue acknowledgement. The voice note was then deleted
   through its callback to verify cleanup semantics.
10. **Pending:** set `NOTINN_TEST_*` and run the automated integration and
    deployed e2e suites. Live user-path verification is complete; the credentialed
    automated suite remains a separate release gate.
11. **Done:** deploy the verified Phase 5.5 `telegram-webhook` bundle, configure
    and read back the eight-command private-chat native menu, confirm version 31
    is ACTIVE, and verify that an unsigned request still receives an empty HTTP
    401 response.
12. **Pending manual acceptance:** perform one live `/start` → Settings → Main
    Menu walkthrough in Telegram and confirm the final labels on the target
    mobile client.

---

## Recommended next step

Run `npx deno task bot-menu:set --yes` from the configured local repository, then
exercise `/privacy`, request/cancel deletion with a synthetic alpha identity, and
verify the seven-day deadline. Final deletion should be tested only with isolated
synthetic data. Before promoting beyond development, configure `NOTINN_TEST_*`
and run the automated integration/e2e release gate.
