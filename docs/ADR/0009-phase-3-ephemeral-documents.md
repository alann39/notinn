# ADR 0009: Phase 3 files remain ephemeral

**Status:** Accepted\
**Date:** 2026-09-18

## Context

Notinn now accepts screenshots, PDF, DOCX, TXT, and Markdown. The blueprint permits
a private temporary Storage bucket only when conversion or provider access truly
requires it. Gemini Interactions accepts small images and PDFs inline, while the
text-first formats can be extracted inside the worker.

Retaining raw files, even briefly, would add another copy of user data, Storage
policies, cleanup scheduling, and an orphan-failure mode without improving this
MVP path. Telegram already remains the resend source when a retry is needed.

## Decision

- Image and PDF bytes are downloaded into bounded worker memory and sent inline
  to the configured Gemini model with `store: false`.
- DOCX, TXT, and Markdown are extracted deterministically in the worker; only the
  extracted text is sent to Gemini.
- Raw buffers are zero-filled in `finally`. No raw binary is written to Postgres,
  PGMQ, logs, or Supabase Storage.
- The raw limit for image/PDF is 14 MiB so base64 plus instructions remains below
  Gemini's 20 MB request limit. DOCX is capped at 10 MiB compressed and 20 MiB
  expanded; TXT/Markdown are capped at 2 MiB before the 60,000-character product
  limit is applied.
- MIME/extension metadata only routes the job. Content signatures and container
  structure decide whether it is safe to process.
- Extracted text is retained as `notes.normalized_source_text` for regeneration.
  The existing privacy preference remains the future control point for a minimal
  derived-data mode.

## Consequences

There is no 12-hour raw-file retention and no temporary-object cleanup job in
Phase 3 because the application creates no object to clean. Storage object count
should remain zero during live image/document tests.

Large files that do not fit the inline limits are rejected with a safe resend
message; Notinn does not silently upload them to a longer-lived provider Files
API. If a future feature introduces layout conversion or another provider that
requires a URL, that feature must ship its private bucket, immediate Storage API
deletion, and ≤60-minute orphan cleanup as one change.
