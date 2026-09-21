# Account-deletion runbook

## Normal path

1. User sends `/delete_account`; no state changes yet.
2. User sends exact confirmation `/delete_account confirm`.
3. Verify the account is `deletion_pending`, has a deadline seven days later,
   and active jobs are `CANCELLED` with input fields scrubbed.
4. If the user sends `/cancel_deletion` before the deadline, verify the former
   `active` or `blocked` state is restored. Cancelled jobs are not restarted.
5. The database cron runs at minute 17 each hour and finalizes due requests in
   bounded batches.

## Verification after finalization

Using the internal UUID—not Telegram identity—confirm:

- user status is `deleted`;
- Telegram user/chat IDs, username, and display name are null;
- deletion timestamp exists;
- notes, outputs, embeddings, delivery records, drafts, preferences, custom
  templates, processing jobs, Telegram updates, quota rows, and invite
  redemption are absent;
- immutable content-free usage events remain with `job_id` cleared;
- a `deletion_finalized` lifecycle event exists and contains no external
  identity or content.

Never paste Telegram identifiers, note text, or provider payloads into tickets
or logs during verification.

## Failed or overdue deletion

1. Pause new releases; do not manually hard-delete the `users` row because it
   anchors immutable usage history.
2. Inspect `cron.job_run_details` for `notinn-finalize-account-deletions` and
   classify the database error without copying row content.
3. Run `select public.finalize_due_account_deletions(50);` with the service
   operator role after the cause is fixed.
4. Re-run the verification checklist for every affected internal UUID.
5. Record timestamps, affected count, cause, correction, and whether the privacy
   incident runbook must be opened.

## Cancellation race

The database locks the user row. Cancellation succeeds only before the deadline;
finalization succeeds only at or after it. Whichever transaction obtains the
lock first re-checks the deadline/status, so the account cannot be both restored
and finalized.
