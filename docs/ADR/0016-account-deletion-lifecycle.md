# ADR 0016: reversible account deletion with anonymized usage history

- Status: accepted
- Date: 2026-09-21

## Decision

Account deletion has a seven-day cancellation window. Confirmation immediately
changes the user to `deletion_pending`, cancels active work, scrubs its input,
and blocks commands/callbacks other than privacy, terms, and cancellation.

An hourly database cron finalizes due requests. Finalization deletes all
user-owned content and operational state, then nulls every Telegram identity
field and marks the retained account anchor `deleted`. Immutable, content-free
`usage_events` and lifecycle audit timestamps remain against only that internal
UUID.

## Why

Immediate hard deletion makes accidental requests unrecoverable and conflicts
with the immutable usage ledger's restrictive user foreign key. A database-owned
deadline survives Edge Function restarts and does not depend on the user
returning to Telegram. An anonymized anchor preserves auditable usage accounting
without retaining the external identity or note content.

## Consequences

- Cancellation restores the prior `active` or `blocked` status but never restarts
  cancelled jobs.
- Finalized deletion is irreversible.
- Original Telegram messages and AI-provider copies remain governed by those
  providers; Notinn cannot claim to delete them.
- A new Telegram interaction after finalization may create a new internal account
  with no link to the anonymized former account.
