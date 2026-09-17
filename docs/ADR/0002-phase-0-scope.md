# ADR 0002 — Phase 0 scope: what is deliberately absent

**Status:** Accepted, Phase 0
**Date:** 2026-09-16
**Supersedes:** nothing. **Superseded by:** [ADR 0007](0007-phase-1-scope.md).

## Context

The brief forbids implementing Gemini processing, voice transcription, document
processing, search, billing, or a web dashboard during Phase 0, "except for
interfaces, schemas, or seams explicitly required by the blueprint."

That leaves a question this ADR answers: for each absent capability, **what
artifact — if any — does Phase 0 leave behind?** The answer is not the same in
every case, and the difference is the whole point.

The test applied: a seam is justified when removing it later would mean reshaping
something that already exists. A seam is _not_ justified when it is an empty
placeholder for code nobody has designed — that is speculative structure, and it
costs more to delete than it saved to write.

## Decision

### Absent with no artifact

| Capability                 | Why nothing is left behind                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini / any provider call | No adapter interface. An interface designed before its second implementation is a guess about the first, and there is exactly one provider. Phase 1 adds the abstraction with two concrete pressures — the provider and the tests — instead of one imagined one. |
| Voice transcription        | Not stubbed. The `voice` and `audio` input types exist as enum members because Telegram delivers them and they must be classified; nothing transcribes them.                                                                                                     |
| Document extraction        | Not stubbed. `pdf`, `docx`, `txt`, `md` are classified and routed; nothing parses them.                                                                                                                                                                          |
| Search                     | No index beyond the constraints the schema needs. `pgvector` is not installed, no `tsvector` column exists.                                                                                                                                                      |
| Billing                    | No table, no provider integration. `usage_events` is metering, not billing — see below.                                                                                                                                                                          |
| Web dashboard              | Not started.                                                                                                                                                                                                                                                     |

### Absent with a deliberate seam

These are the cases where something in Phase 0 would have to be reshaped if the
seam were omitted, so the seam is load-bearing now.

**1. `RECEIVED` is a valid job state that Phase 0 never uses.**

Phase 0 creates jobs directly in `QUEUED`. The blueprint's pipeline begins at
`RECEIVED`, and `processing_jobs.state` accepts both, enforced by
`enforce_processing_job_transition`. Both creation states are exercised by
`tests/integration/state-machine.test.ts`.

Why: Phase 2 introduces the queue. Without a queue there is no gap between
"accepted" and "queued", so `RECEIVED` would be a state a job passes through in
the same transaction — meaningful to the logger, meaningless in the table. The
enum member is retained rather than removed because removing and re-adding an
enum value in PostgreSQL is a migration with a rewrite, and because a job created
in `RECEIVED` must not be rejected the day the queue arrives.

**2. `usage_events` exists and nothing writes to it.**

Phase 0 meters nothing, because Phase 0 calls no provider. The table exists
anyway. A usage event is meaningful only in relation to a specific provider
operation, and the columns — `input_tokens`, `audio_seconds`, `document_pages`,
`estimated_cost_usd` — are the union of what transcription, generation and vision
cost. Designing that shape before any call is made would mean guessing at which
counters matter, and the guess would be wrong in a way that only shows up as
missing cost attribution months later, after rows exist that cannot be backfilled.

The immutability trigger (`protect_usage_event_immutability`) is built now because
it is cheap now and expensive later: adding it once rows exist means validating it
against data that may already violate it.

**3. `processing_jobs` carries the file metadata Phase 0 never reads.**

`telegram_file_id`, `telegram_file_unique_id`, `mime_type`, `original_filename`,
`size_bytes`, `duration_seconds` are populated where Telegram supplies them and
used by nothing. They are recorded at acceptance because they are available for
free in the update and cannot be recovered afterwards — a Telegram `file_id` is
not derivable from the message, and a file may be gone by the time Phase 1 asks.

This is the one place Phase 0 stores data it does not use. The justification is
that the alternative is losing it permanently.

### Explicitly not built

- **`process-job` Edge Function.** No queue, no worker, nothing to run.
- **`cleanup-temporary-data`.** There is no temporary data — nothing is stored
  outside the database, and no Storage object is created.
- **`_shared/providers/`.** See the first row of the absent table.
- **pgmq.** The extension is not enabled, no queue is created, no message is
  published or read. `processing_jobs` is itself the durable queue: a `QUEUED` row
  is the work item, and Phase 2's worker polls it or drains a queue fed from it.
  This is why the `QUEUED` state is a _durable acceptance record_ rather than a
  transient hand-off.
- **Storage buckets.** `supabase/config.toml` configures a 25 MiB object limit,
  but no bucket is created and no object is written. The limit is present so that
  a bucket created later inherits a bound rather than a default.

## Consequences

- Phase 2 can add the queue without a schema rewrite: the enum member, the
  creation-state guard and the job row itself are all already in the shape the
  queue needs.
- Phase 1 can add the provider abstraction against two real pressures rather than
  one imagined one, which is the only condition under which an interface is worth
  designing.
- The cost is that `processing_jobs` holds columns nothing reads, and
  `usage_events` holds a table nothing writes. Both are deliberate, both are
  documented here, and both are cheap to drop if the corresponding phase is
  cancelled.

## What would make this wrong

If Phase 1's provider abstraction turns out to need something Phase 0's schema
cannot express — a per-call request/response record, say, or a provider-level
retry ledger — then the "no interface" decision was wrong and Phase 1 pays a
migration. That risk is accepted: it is one migration, and the alternative is
carrying a guessed abstraction that Phase 1 would more likely discard than use.
