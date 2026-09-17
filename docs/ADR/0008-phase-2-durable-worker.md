# ADR 0008 — Phase 2 durable worker and ephemeral audio

**Status:** accepted locally; not migrated or deployed\
**Date:** 2026-09-17

## Decision

Phase 2 moves initial text and audio generation out of the Telegram request path.
`accept_and_enqueue_telegram_update` creates the job and a PGMQ message in one
database transaction. The queue payload contains only `job_id`.

After the transaction commits, the webhook sends a fixed status message and uses
`EdgeRuntime.waitUntil` to invoke `process-job`. That invocation is only a
low-latency nudge: a scheduled recovery call must also drain PGMQ, so losing the
background request cannot lose a note.

`process-job` has `verify_jwt = false` and authenticates
`X-Notinn-Worker-Secret` with a constant-time comparison. This deliberately
supports Supabase Cron or another trusted server-side scheduler without creating
an end-user session. The secret is at least 32 characters and never belongs in a
browser or Telegram request.

## Audio lifecycle

For voice and audio jobs the worker:

1. Calls Telegram `getFile` using the stored `file_id`.
2. Downloads at most 14 MiB raw into memory (leaving base64/schema headroom under
   Gemini's 20 MB total request limit) and accepts at most 30 minutes in alpha.
3. Sends the bytes inline to the same configured Gemini model used for text.
4. Requests the transcript and structured note in one JSON response.
5. Zero-fills the in-memory buffer in a `finally` block.
6. Persists only the transcript/derived note, never the raw binary or Telegram
   token-bearing URL.

There is no 12-hour raw-file bucket. A retry re-fetches from Telegram. If Telegram
no longer has the file, the job fails permanently and asks the user to resend it.

## Delivery and retry semantics

The note is staged while the job remains `DELIVERING`. The job reaches
`COMPLETED` only after Telegram accepts the delivery and only then is the queue
message deleted. If delivery fails, the retry reuses the staged note instead of
calling Gemini or inserting another note.

Transient failures move to `RETRYABLE_FAILED`, retain the PGMQ message, and become
eligible after five minutes. Three failed attempts exhaust the job. Deterministic
failures clear the Telegram file handle, notify the user with a fixed safe
sentence, and acknowledge the queue message.

## Consequences

- Webhook latency no longer includes Gemini or file download time.
- Queue publication and job creation cannot commit independently.
- Raw audio consumes memory during one attempt but no database or Storage space.
- The same Gemini API key and model configure text and audio.
- Status delivery can fail independently without losing the durable job.
- A recovery scheduler is an operational requirement; repository code supplies
  the authenticated batch endpoint, but no remote Cron is created without an
  explicit deployment action.

## Deferred

Image, PDF, DOCX, TXT, and Markdown processing remain Phase 3. Callback-triggered
format regeneration still runs in the webhook path and should move onto the same
worker before higher callback volume is supported.
