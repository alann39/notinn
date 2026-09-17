# ADR 0003 — The ingestion contract

**Status:** Accepted, Phase 0
**Date:** 2026-09-16

## Context

`POST /functions/v1/telegram-webhook` is the only way anything enters Notinn. Its
contract decides what Telegram learns, what the database records, and what happens
when a delivery is hostile, malformed, duplicated or late.

Telegram's delivery model constrains most of it:

- **At-least-once, not exactly-once.** Telegram retries a delivery that does not
  get a 2xx, and can therefore deliver the same `update_id` more than once.
- **Retries stop on 2xx and continue on anything else.** A 5xx is a request to
  redeliver; a 200 is a statement that the update has been dealt with.
- **The response body is not read.** Telegram looks at the status code and
  discards the body, so the body is not a channel to Telegram. It is a channel to
  an operator, and this ADR treats it as one.
- **Delivery is unauthenticated apart from a shared secret.** Telegram echoes
  `X-Telegram-Bot-Api-Secret-Token` on every request; nothing else identifies the
  caller. Supabase JWT verification is disabled for this function
  (`supabase/config.toml`), because Telegram cannot present one.

## Decision

### The contract, in order

Every request passes through these steps, and the first one that matches decides
the outcome. The order is the contract: a request that fails an earlier check is
never evaluated against a later one.

| # | Step                                                                                          | On failure                  |
| - | --------------------------------------------------------------------------------------------- | --------------------------- |
| 1 | Method must be `POST`                                                                         | `405`, empty body           |
| 2 | `X-Telegram-Bot-Api-Secret-Token` must equal the configured secret, compared in constant time | `401`, empty body           |
| 3 | Body must be at most 1 MiB                                                                    | Acknowledged `200`, ignored |
| 4 | Body must parse as JSON and as a Telegram `Update`                                            | Acknowledged `200`, ignored |
| 5 | Chat must be `private`                                                                        | Acknowledged `200`, ignored |
| 6 | Message must carry exactly one supported content kind                                         | Acknowledged `200`, ignored |
| 7 | Sender must not be a bot; message must not be a service message                               | Acknowledged `200`, ignored |
| 8 | Sender must not be blocked, deletion-pending or deleted                                       | Acknowledged `200`, no row  |

Steps 3–8 acknowledge with `200` and `{"ok": true}`. This is deliberate and is
the central decision of this ADR.

**A request that has passed step 2 is considered handled, and steps 3–8 are
therefore not retried.** A malformed body will be malformed on redelivery. A
group message will still be a group message. A blocked user is still blocked. A
non-2xx for any of these makes Telegram redeliver an update that Notinn will
reject identically, forever, while the failure is already fully visible to an
operator in the logs. The one thing a non-2xx buys is a retry that cannot
succeed.

Step 2 is the exception, and returns `401`. A wrong secret is not a statement
about the update — it is a statement about the request, and the correct response
is to refuse it outright so that a scanner learns nothing and a misconfigured
deployment fails loudly. Nothing about a `401` here causes a redelivery loop,
because a genuine Telegram delivery always carries the right secret.

### Failure inside the database

When a step reaches the database and the write fails, the status is decided by
whether retrying could succeed — `errors/http.ts`:

- **Transient** (connection loss, serialisation failure, deadlock, shutdown):
  `500`, empty body. Telegram redelivers, which is what we want.
- **Deterministic** (constraint violation, data exception, `INTERNAL_ERROR`):
  `200`, empty body. Retrying identical bytes against a deterministic failure
  reproduces it. The failure is logged at `error` level with a classified detail.

This is why a malformed row is acknowledged: the alternative is an infinite
redelivery of a request that cannot succeed.

### What is recorded

For an accepted message, exactly two writes, both idempotent:

1. `ensure_telegram_user` — upserts the sender by `telegram_user_id`, returning
   the internal id. A returning user resolves to the same row.
2. `accept_telegram_update` — records the `telegram_updates` row and creates the
   `processing_jobs` row in one transaction, returning
   `accepted` | `duplicate` | `user_not_active` and the job id.

**`update_id` is the deduplication key, and the guarantee lives in the database**,
in the `processing_jobs_update_id_key` unique constraint that
`accept_telegram_update` relies on. Putting it in the database rather than the
application is the point: the guarantee holds even if a second caller, a second
function or a future service also writes jobs. `tests/integration/ingestion.test.ts`
proves it by counting rows, not by reading the returned outcome.

A replay resolves to the **same job id** rather than to nothing, so a caller that
lost the first response can still find out what happened.

### The payload digest

Every recorded update stores a SHA-256 of the raw request bytes. It is a
_tripwire, not a key_: deduplication does not consult it. If a `file_id`-bearing
update were redelivered with different bytes, the digest of the first delivery is
what remains on the row, and Phase 1 compares the two rather than reconstructing
them. Phase 0 records it and does nothing with it — which is the only honest
option, since there is no later phase to do the comparing yet.

### What is never logged

The log allowlist (`observability/logger.ts`) is a whitelist of field names, and
a field not on it is dropped rather than sanitised. No message text, caption,
transcript, extracted content, filename, `file_id`, forward origin, username,
token, URL or signed URL can reach a line. This is asserted end to end by
`tests/security/log-redaction.test.ts`, which plants distinctive markers in every
user-controlled field and searches every captured line for every one of them. See
[DATA_PRIVACY.md](../DATA_PRIVACY.md).

## Alternatives considered

**Return a non-2xx for ignored updates.** Rejected: it converts a handled
decision into an unbounded redelivery loop, for no gain, since the log already
records the decision.

**Deduplicate in the application.** Rejected: the guarantee would hold only while
every writer remembers to consult it. The constraint holds regardless.

**Trust the payload digest for deduplication.** Rejected: Telegram guarantees
`update_id` uniqueness, not byte stability, and deduplicating on content hash
would treat a redelivery with different whitespace as new work.

**Reply to ignored messages.** Deferred, and now scheduled. Phase 0 has no
outbound messaging, so silence here is a capability limit rather than a choice.
Phase 1 introduces replies and sends §16.4's fixed response **once per chat** — see
[ADR 0001](0001-blueprint-deviations.md) §3.

## Consequences

- Telegram's retry behaviour is a non-issue for every decision Notinn makes about
  a delivery: the only retryable failures are the ones where a retry can help.
- A delivery that fails at step 3–8 leaves no trace in the database. The log is
  the only record, which is why every ignore carries a fixed-vocabulary reason.
- The `401` path is the one place the contract refuses rather than absorbs. It is
  asserted in `tests/security/webhook-auth.test.ts` and, over the wire, in
  `tests/e2e/webhook.test.ts`.
- **The silence around steps 3–8 is a Phase 0 property, not a permanent rule.** From
  Phase 1, step 5 alone — a non-private chat — receives one fixed reply per chat,
  because §16.4 asks for a response to groups and channels and nothing else. Steps
  3, 4, 6, 7 and 8 stay silent permanently: a malformed body has nobody to answer, a
  bot cannot be told anything useful, and a blocked user is blocked.
