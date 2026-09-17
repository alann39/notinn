# ADR 0004 — The job state machine

**Status:** Accepted, Phase 0 — both inferences confirmed 2026-09-17
**Date:** 2026-09-16
**Decisions:** 2026-09-17

## Context

`processing_jobs.state` is the durable record of what happened to a user's note.
It is the only thing an operator can read to answer "where did this get stuck",
and the only thing a future billing or support query can join against.

That makes two properties matter more than flexibility:

1. **A job cannot claim a result it never produced.** `COMPLETED` means the user
   received a note. If a bug could set `COMPLETED` from `QUEUED`, the state would
   stop being evidence.
2. **A finished job cannot be reopened.** A terminal row is a permanent record.
   If it could be resurrected, a regenerated note could be written over one the
   user already has.

The blueprint supplies the pipeline (blueprint 14) and the terminal-state rule
(14.1). It does not supply a complete transition table, and two of its statements
cannot both be taken literally.

## Decision

### Enforcement lives in the database

`enforce_processing_job_transition()` — a `BEFORE INSERT OR UPDATE` trigger on
`processing_jobs` — is the enforcement point. The application mirrors the table in
`config/constants.ts` so it can reject an impossible transition before attempting
it, and `tests/contract/migration-constants.test.ts` asserts the two definitions
agree.

Enforcing in the trigger rather than the application is the same argument as
`update_id` deduplication: the rule holds regardless of which caller writes — an
application bug, a psql session during an incident, a future worker, a migration.

### The transitions

```
RECEIVED  → QUEUED, REJECTED, CANCELLED
QUEUED    → ACQUIRING, EXPIRED, CANCELLED
ACQUIRING → EXTRACTING, RETRYABLE_FAILED, CANCELLED
EXTRACTING→ GENERATING, RETRYABLE_FAILED, CANCELLED
GENERATING→ DELIVERING, RETRYABLE_FAILED, CANCELLED
DELIVERING→ COMPLETED, RETRYABLE_FAILED, CANCELLED
RETRYABLE_FAILED → QUEUED, FAILED, CANCELLED
COMPLETED, FAILED, REJECTED, EXPIRED, CANCELLED → (terminal, absorbing)
```

Creation is restricted to `RECEIVED` and `QUEUED`. Phase 0 uses `QUEUED`; see
[ADR 0002](0002-phase-0-scope.md).

A same-state update is always permitted — that is how `attempt_count`,
`next_attempt_at` and `last_error_code` are written between transitions.

### Inference 1: `CANCELLED` is reachable from every non-terminal state

**The conflict.** The blueprint's state diagram (14) does not show a single edge
into `CANCELLED`. Blueprint 14.1 lists `CANCELLED` as a terminal state, and 14.2
names it under non-retryable failures as _"User deleted/cancelled job"_.

A terminal state with no incoming edge is unreachable, which would make 14.1 and
14.2 describe a state that can never occur. Rather than delete a state the
blueprint names twice, it is made reachable from every non-terminal state.

**Why every state and not just one.** A user who cancels has stopped caring about
the job, and that is true at every point in the pipeline. Restricting the edge to
one state would mean a job that happened to be in `GENERATING` when the user
cancelled could not be cancelled — the user's intent would be honoured or ignored
depending on timing. Cancellation is the one transition that is genuinely
state-independent.

**Answer (2026-09-17): keep the edge from every non-terminal state.**

`CANCELLED` means "cancelled", not "cancelled before work began". Blueprint 14.2
files it under non-retryable failures as _"User deleted/cancelled job"_ — a
statement about what the user wanted, not about how far processing had got. A user
who cancels mid-`GENERATING` has still cancelled, and honouring that only from
`QUEUED` would make the user's intent depend on timing, which is the outcome the
paragraph above rejects.

Partial provider spend is not lost by the edge: it is recorded in `usage_events`,
which is where blueprint 20.1 puts metering. The job state was never the place for
it, so the "wrong if" above describes a cost that is already booked correctly.

### Inference 2: two columns are exempt from terminal immutability

**The conflict.** Blueprint 14.1 says a terminal job is immutable. Blueprint 11.5
requires that deleting a note always succeeds. But `processing_jobs.note_id`
references `notes.id`, and a completed job holds a note id — so a strictly
immutable terminal row makes note deletion fail.

**Resolution.** A terminal job is immutable _except_ for two columns, and both
exemptions are reference scrubbing rather than history:

| Column             | Changed by                              | Why                                                                                                       |
| ------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `telegram_file_id` | The cleanup routine, per blueprint 14.1 | The download URL derived from this id embeds the bot token, so it is cleared once the job is finished.    |
| `note_id`          | The `ON DELETE SET NULL` foreign key    | Blueprint 11.5 requires note deletion to always succeed. Without the exemption a completed job blocks it. |

`note_id` may only be **cleared**, never re-pointed: a non-null value that differs
from the old one is refused. That closes the hole the exemption would otherwise
open, which is that a completed job could be silently reattached to a different
note.

The immutability check is `to_jsonb(new) - 'telegram_file_id' - 'note_id' IS
DISTINCT FROM to_jsonb(old) - ...`, so the exemption list is stated once and every
other column is covered by default. A column added later inherits immutability
without anyone remembering to add it.

**Answer (2026-09-17): keep both exemptions.**

There is no third option to choose between. Blueprint 14.1 (a terminal job is
immutable) and blueprint 11.5 (deleting a note always succeeds) cannot both hold
literally while `processing_jobs.note_id` references `notes.id`. One has to bend,
and bending immutability by two named columns — one of them a secret-adjacent field
the blueprint itself requires to be cleared — is the smaller bend. Bending 11.5
instead would mean a delete that fails, which is a user-visible bug in the one
operation that must never fail.

The hole the exemption could open is already closed: `note_id` may be cleared but
never re-pointed, so a completed job cannot be silently reattached to a different
note.

### `completed_at` is constrained, not derived

```
(state IN ('COMPLETED','FAILED','REJECTED','EXPIRED','CANCELLED')) = (completed_at IS NOT NULL)
```

It is an equality, so both directions are enforced: a terminal job must record
when it finished, and a non-terminal job may not pretend to have. This is what
makes "when did this finish" answerable without inferring it from `updated_at`,
which any later write would move.

## Consequences

- The mirror in `config/constants.ts` and the trigger are checked against each
  other by a contract test, so drift is a test failure rather than a runtime
  surprise on a user's job.
- `tests/integration/state-machine.test.ts` walks four full paths against a real
  database, one step at a time, and asserts the refusals — a short-circuited
  pipeline, a reopened terminal job, a negative attempt count. Each step's
  preconditions are created by the step before it, which is the only way to prove
  the middle states are reachable; a table of edges proves nothing on its own.
- Two blueprint inferences are recorded here and were confirmed on 2026-09-17:
  `CANCELLED` keeps its edge from every non-terminal state, and the two columns stay
  exempt from terminal immutability. Both remain small changes if ever reversed —
  one `case` arm, or one exemption list — which is why neither was allowed to
  harden into the schema.

## Alternatives considered

**Enforce in the application.** Rejected — see above.

**A transition audit table.** Deferred. The state is a column, not a history, and
a job's path can be reconstructed from `created_at`, `completed_at`, `attempt_count`
and `last_error_code`. A full history table is Phase 2 work, when there is a
worker whose retry behaviour is worth auditing.

**Drop `CANCELLED` as unreachable.** Rejected: it is named twice in the blueprint,
and an unreachable terminal state is more likely a specification gap than a
specification instruction.
