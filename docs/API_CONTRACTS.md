# API contracts

The public HTTP contract Telegram calls and the owner-scoped database functions
used by the Edge Functions. Phase 2 adds atomic PGMQ publication, an authenticated
worker endpoint, and audio processing without adding a client-facing database
surface.

---

## 1. `POST /functions/v1/telegram-webhook`

Registered with Telegram by `deno task webhook:set`. Not called by anything else.

### Request

|                                   |                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Method                            | `POST`                                                                         |
| `X-Telegram-Bot-Api-Secret-Token` | Required. Must equal `TELEGRAM_WEBHOOK_SECRET`.                                |
| `Content-Type`                    | `application/json`                                                             |
| Body                              | A Telegram `Update`. At most 1 MiB.                                            |
| Supabase JWT                      | Not required — `verify_jwt = false` (see [ADR 0005](ADR/0005-access-model.md)) |

### Responses

| Status | Body          | When                                                |
| ------ | ------------- | --------------------------------------------------- |
| `200`  | `{"ok":true}` | Accepted, duplicated, or deliberately ignored       |
| `200`  | _empty_       | A deterministic failure — the update is lost        |
| `401`  | _empty_       | Missing or wrong secret                             |
| `200`  | _empty_       | Not a `POST`, malformed, or deterministic failure   |
| `500`  | _empty_       | Transient failure, or the function is misconfigured |

**Every response is one of two shapes, and a failure body is always empty.** Telegram
does not read the body, so its only audience is someone probing the endpoint, and
a body that names a table or a stack frame is free reconnaissance. A success body
carries a single boolean and no identifiers — not the job id, not the user id, not
the `update_id` — which `tests/security/webhook-auth.test.ts` asserts field by
field.

### Why 200 covers both "accepted" and "ignored"

Telegram redelivers on any non-2xx. A malformed body, a group message, a bot
sender and a blocked user all produce the same result on redelivery, so a non-2xx
would request a retry that cannot succeed — forever. Only two conditions return
non-2xx: a wrong secret (`401`, a statement about the request and not the update)
and a _transient_ database failure (`500`, where a retry genuinely can help).

The full decision order, and the reasoning, is [ADR 0003](ADR/0003-ingestion-contract.md).

### Content accepted

Private chats only. Exactly one content kind per message:

| Kind                              | Routed to                                   | Current handling                              |
| --------------------------------- | ------------------------------------------- | --------------------------------------------- |
| `text`                            | `clean_note` (`short_summary` if forwarded) | Generated, validated, stored, delivered       |
| `voice` / `audio`                 | `clean_note`                                | Worker transcribes + generates one note       |
| `photo` or JPEG/PNG/WebP document | `extract_and_summarize`                     | Inline Gemini image extraction + note         |
| PDF document                      | `detailed_summary`                          | Inline Gemini document extraction + note      |
| DOCX document                     | `detailed_summary`                          | Safe local extraction, then text generation   |
| TXT/Markdown document             | `clean_note`                                | Strict UTF-8 extraction, then text generation |
| anything else                     | —                                           | Ignored                                       |

A message carrying more than one of these is ambiguous and ignored. Bots, service
messages, `channel_post`, edits and reactions are ignored. Private-chat
`callback_query` updates with a bot message and callback data are handled as note
actions. `/recent` is handled as a command; other slash commands receive the
current one-sentence help response and are not stored as notes.

Non-private `message` and actionable `callback_query` updates are rejected. The
first one per chat atomically claims the fixed reply; later updates are silent.

---

## 2. `public.ensure_telegram_user(...)` → `uuid`

Resolves a Telegram account to an internal user id, creating the row on first
contact. Idempotent.

```sql
ensure_telegram_user(
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint,
  p_telegram_username text default null,
  p_display_name     text default null
) returns uuid
```

| Behaviour     |                                                                      |
| ------------- | -------------------------------------------------------------------- |
| First contact | Inserts, `status = 'active'`, returns the new id                     |
| Returning     | Upserts; the same `telegram_user_id` always resolves to the same row |
| Race          | Two concurrent first contacts resolve to one row, not two            |

`SECURITY DEFINER`, `search_path` pinned, `EXECUTE` granted to `service_role`
only. A client-role call is refused, asserted in
`tests/integration/state-machine.test.ts`.

---

## 3. `public.accept_telegram_update(...)` → `table` (inner primitive)

Records an accepted update and creates exactly one job, in one transaction.

Production ingestion calls `accept_and_enqueue_telegram_update`, below. This
inner function remains the single deduplication primitive and is wrapped in the
same transaction as PGMQ publication.

```sql
accept_telegram_update(
  p_update_id             bigint,
  p_update_type           text,
  p_user_id               uuid,
  p_chat_id               bigint,
  p_message_id            bigint,
  p_input_type            public.input_type,
  p_template_key          text,
  p_payload_digest        text default null,
  p_source_text           text default null,
  p_telegram_file_id      text default null,
  p_telegram_file_unique_id text default null,
  p_original_filename     text default null,
  p_mime_type             text default null,
  p_size_bytes            bigint default null,
  p_duration_seconds      integer default null
) returns table (
  update_id  bigint,
  user_id    uuid,
  job_id     uuid,
  outcome    text,          -- 'accepted' | 'duplicate' | 'user_not_active'
  job_state  public.job_state,
  chat_id    bigint,
  message_id bigint
)
```

### Outcomes

| `outcome`         | Meaning                                                                  | `job_id`             |
| ----------------- | ------------------------------------------------------------------------ | -------------------- |
| `accepted`        | The update was not seen before. A job was created.                       | The new job          |
| `duplicate`       | This `update_id` is already recorded. Nothing was created.               | **The existing job** |
| `user_not_active` | The sender is blocked, deletion-pending or deleted. Nothing was written. | `null`               |

**A duplicate resolves to the existing job rather than to nothing.** A caller that
lost the first response can still find out what happened, and it costs one extra
column in the return type.

`user_not_active` is not an error and not a log at `error` level. It is a normal
outcome of a normal state; the webhook sends the fixed public refusal without
creating or queueing a job.

### The deduplication guarantee

`p_update_id` is the key. Uniqueness is enforced by
`processing_jobs_update_id_key`, a real constraint, so the guarantee holds even if
a second caller, a second function or a future service also writes jobs. It is not
enforced by a check-then-insert in application code, which would hold only while
every writer remembered to consult it.

`tests/integration/ingestion.test.ts` proves it by counting rows, not by reading
the returned outcome — because a test that read only the outcome would pass even
if a second job had been created.

### On a replayed update with different bytes

Deduplication keys on `update_id` alone, and the replay returns `duplicate`.
Telegram guarantees the id is unique per update; a payload that arrived twice with
different bytes is a corrupted delivery, not a new message. `p_payload_digest` is
recorded on the first delivery and duplicate ingestion compares the two, logging
only a fixed mismatch reason. See [ADR 0003](ADR/0003-ingestion-contract.md).

### Failure modes

| Failure                        | SQLSTATE            | Classification                         |
| ------------------------------ | ------------------- | -------------------------------------- |
| Unknown `p_template_key`       | `23503`             | Deterministic → `200`, update lost     |
| Duplicate `update_id` (raced)  | `23505`             | Deterministic → `200`                  |
| Non-private chat id            | `23514`             | Deterministic → `200`                  |
| Constraint violation           | `23*`               | Deterministic → `200`                  |
| Connection, deadlock, shutdown | `08*`, `40*`, `57*` | Transient → `500`, Telegram redelivers |

The grouping is deliberate: **class 23** is deterministic and retrying is waste;
everything else is treated as transient, because the asymmetry favours it.
Guessing "retryable" when wrong costs a duplicate delivery, which `update_id`
deduplication absorbs. Guessing "not retryable" when wrong loses a user's note.

---

## 4. Internal TypeScript contract

`IngestionResult`, returned by `services/ingestion.service.ts`:

```ts
interface IngestionResult {
  outcome: "accepted" | "duplicate" | "user_not_active";
  userId: string;
  jobId: string | null;
  jobState: JobState | null;
}
```

The service never sees a status code; the handler decides that. `services/` may
not import HTTP types, and `repositories/` is the only layer that talks to
PostgREST. See [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 5. Phase 1 database surface

All functions below are `SECURITY DEFINER`, pin `search_path = ''`, are revoked
from `PUBLIC`, `anon`, and `authenticated`, and are granted only to
`service_role`:

| Function                        | Contract                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `claim_rejected_chat_reply`     | Atomically returns `true` to at most one caller per non-private chat                         |
| `persist_note`                  | Creates the note and first output, points to it, and completes a `DELIVERING` job atomically |
| `regenerate_note_output`        | Appends an owned note output without changing the current pointer                            |
| `set_current_output`            | Moves an owned note's pointer after successful delivery                                      |
| `set_note_saved`                | Idempotently applies Save or Unsave to an owned note                                         |
| `delete_note`                   | Hard-deletes one owned note and cascades its outputs                                         |
| `list_recent_saved_notes`       | Returns saved notes, newest update first                                                     |
| `find_note_for_regeneration`    | Reads owned source text before a provider call can be made                                   |
| `find_note_for_display`         | Reads the owned current output and saved state for rendering                                 |
| `find_template_for_generation`  | Returns one active system or owned template and its JSON Schema                              |
| `advance_processing_job`        | Compare-and-set transition for one owned job                                                 |
| `mark_processing_job_retryable` | Moves one owned active job to `RETRYABLE_FAILED` with fixed safe detail                      |

`usage_events` is the deliberate exception: it is one immutable server-written
row with no multi-statement invariant, so `UsageRepository` inserts it directly.

## 6. Provider contract

`NoteAIProvider.generateText` receives normalised source text, a template
instruction, its JSON Schema, a template key, a generation reason, and an optional
output language. It returns a validated `StructuredNote` plus provider/model,
request id, and token counts. The Gemini adapter uses the Interactions API with
`response_format.mime_type=application/json`, the stored schema, and
`store=false`; provider output is never persisted or rendered until
`parseStructuredNote` accepts it.

`NoteAIProvider.generateAudio` receives bounded bytes, the verified MIME type,
and the same template contract. The Gemini adapter sends audio through
`inlineData` and requires one JSON envelope containing `transcript` and `note`.
The token-bearing Telegram URL, Telegram identifiers, and filename never reach
the provider. The buffer is zero-filled after the call whether it succeeds or
throws.

---

## 7. `POST /functions/v1/process-job`

Internal queue consumer. It is not a user-facing API.

| Header / field                  | Contract                                                         |
| ------------------------------- | ---------------------------------------------------------------- |
| Method                          | `POST`                                                           |
| `X-Notinn-Worker-Secret`        | Required; constant-time match to `INTERNAL_WORKER_SECRET`        |
| Supabase JWT                    | Not required; `verify_jwt = false`                               |
| Direct body                     | `{"job_id":"uuid","trigger":"immediate                           |
| Batch/recovery body             | `{"trigger":"queue                                               |
| Missing/wrong secret            | Bare `401`; no queue or database access                          |
| Malformed authenticated request | Bare `400`                                                       |
| Accepted request                | JSON operational counters; never content, file ids, or filenames |

The webhook schedules the direct form with `EdgeRuntime.waitUntil`; a recovery
scheduler calls the batch form. A direct invocation still resolves and deletes
the PGMQ message, so there is one acknowledgement mechanism rather than a fast
path that bypasses durability.

## 8. Phase 2 database surface

| Function                             | Contract                                                               |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `accept_and_enqueue_telegram_update` | Calls the ingestion primitive and `pgmq.send` in one transaction       |
| `read_processing_queue`              | Reads 1–10 messages with a bounded 30–900 second visibility timeout    |
| `delete_processing_queue_message`    | Acknowledges a completed, permanent, exhausted, or stale queue message |
| `find_processing_queue_message_id`   | Resolves a direct invocation to the same durable queue message         |
| `claim_processing_job`               | Claims due work, requeues due retries, and terminalises exhausted jobs |
| `set_processing_job_status_message`  | Attaches the bot-owned progress message to an active owned job         |
| `stage_note_for_delivery`            | Idempotently persists a note while the job remains `DELIVERING`        |
| `complete_processing_job`            | Completes only a `DELIVERING` job after Telegram delivery              |
| `fail_processing_job`                | Walks a permanent failure through the legal state transition           |

All are `SECURITY DEFINER`, have an empty pinned `search_path`, and are executable
only by `service_role`. The PGMQ payload is exactly `{ "job_id": "uuid" }`.
