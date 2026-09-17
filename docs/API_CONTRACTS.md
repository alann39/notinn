# API contracts

Two contracts: the HTTP endpoint Telegram calls, and the two database functions
the Edge Function calls. Everything else in Phase 0 is internal.

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
| `405`  | _empty_       | Not a `POST`                                        |
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

| Kind                            | Routed to                                    | Phase 0 handling                   |
| ------------------------------- | -------------------------------------------- | ---------------------------------- |
| `text`                          | `clean_note` (`short_summary` if forwarded)  | Stored as `source_text`            |
| `voice` / `audio`               | `clean_note`                                 | Metadata recorded; not transcribed |
| `photo`                         | `extract_and_summarize`                      | Metadata recorded                  |
| `document` (PDF, DOCX, TXT, MD) | `detailed_summary` (`clean_note` for TXT/MD) | Metadata recorded                  |
| anything else                   | —                                            | Ignored                            |

A message carrying more than one of these is ambiguous and ignored. Bots, service
messages, `callback_query`, `channel_post`, edits and reactions are all ignored.

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

## 3. `public.accept_telegram_update(...)` → `table`

Records an accepted update and creates exactly one job, in one transaction.

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
outcome of a normal state, and Phase 0 does not reply — the blueprint's fixed
response to a blocked user is Phase 1 work.

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
recorded on the first delivery and Phase 1 compares the two — Phase 0 has nothing
to compare yet. See [ADR 0003](ADR/0003-ingestion-contract.md).

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
