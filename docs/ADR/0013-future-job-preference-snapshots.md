# ADR 0013: Snapshot preferences when a job is accepted

- **Status:** accepted
- **Date:** 2026-09-19

## Context

Phase 5 introduces user-controlled output language, default templates, and
balanced/minimal retention. A durable job can wait or retry after the user changes
those settings. Reading the current preference in the worker would silently alter
an already accepted job and violate the requirement that changes affect future
jobs only.

Minimal retention also cannot rely only on TypeScript. The note write is the
actual privacy boundary, so an accidental caller omission must not persist source
text.

## Decision

The atomic ingestion RPC resolves the applicable template and copies
`output_language` and `privacy_mode` onto `processing_jobs`. The worker consumes
those immutable snapshots. A preference update therefore affects the next
accepted Telegram update, not a job already in PGMQ.

`stage_note_for_delivery` reads the job's privacy snapshot itself. For `minimal`
jobs it stores neither `notes.normalized_source_text` nor
`notes.source_text_sha256`. Staging clears direct text, Telegram file handles,
stable file identifiers, and filenames from the job row because delivery retries
reuse the staged note. Terminal transitions repeat the scrub defensively.
Raw media remains memory-only in both modes.

The `/settings` command is the server-mediated surface. Preference tables and
RPCs remain denied to `PUBLIC`, `anon`, and `authenticated`; the Telegram identity
is resolved to the internal owner before any read or update.

## Consequences

- Retries are deterministic even if settings change while a job waits.
- Minimal notes cannot be reformatted because their source was deliberately not
  retained; the bot explains this instead of reporting the note as missing.
- Existing notes are not rewritten or purged when a preference changes.
- Custom templates and export remain separate Phase 5 slices.
