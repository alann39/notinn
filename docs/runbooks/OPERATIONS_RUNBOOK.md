# Operations runbook

## Operator command reference

All commands require `NOTINN_ENV` set in `.env` and refuse to run against production.

| Command                                                | Purpose                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `deno task ops health`                                 | Queue depth, stale jobs, failed jobs, deletion backlog, active users |
| `deno task ops jobs`                                   | List stale or failed jobs (max 50)                                   |
| `deno task ops usage`                                  | Aggregate usage across all users                                     |
| `deno task ops user <id>`                              | Per-user account status, notes, and jobs                             |
| `deno task ops requeue <job-id>`                       | Safely requeue a stuck job                                           |
| `deno task ops requeue <job-id> --allow-provider-call` | Requeue even if AI has not been called yet                           |
| `deno task ops cancel <job-id>`                        | Cancel a stuck job                                                   |

All mutating commands (`requeue`, `cancel`) require `--yes` for non-interactive execution.

## Common incidents

### Queue stall

**Symptoms:** `ops health` shows `stale_jobs > 0`. Users report notes stuck in "Processing…".

**Diagnosis:**

```bash
deno task ops jobs
```

Identify the oldest stalled job and its `last_error_code`.

**Resolution:**

- If the job has a `note_id` (note was generated but delivery failed): `deno task ops requeue <job-id> --yes`
- If the job has no `note_id` (AI was never called or failed): investigate the error before requeuing. Use `--allow-provider-call` only after confirming the root cause.
- If the job is permanently stuck: `deno task ops cancel <job-id> --yes`

### Failed generation

**Symptoms:** `ops health` shows `failed_jobs > 0`. `ops jobs` shows jobs with `last_error_code` of `generation_failed` or `provider_error`.

**Diagnosis:**

Check if the error is transient (provider 429, timeout) or permanent (validation failure, unsupported format).

**Resolution:**

- Transient: the retry mechanism should handle it automatically. If retries are exhausted, requeue manually.
- Permanent: cancel the job and inform the user.

### Cron miss

**Symptoms:** Deletion backlog grows. Recovery queue does not drain.

**Diagnosis:**

Check the Supabase dashboard → Database → Cron Jobs for `notinn-recovery` and `notinn-finalize-account-deletions`. Look for recent run status and errors.

**Resolution:**

- If the cron job is paused: resume it from the dashboard.
- If the cron job errors: check the Edge Function logs for `process-job` or `ops-monitor`.
- As an interim measure, trigger recovery manually: `deno task ops health` to verify the queue, then invoke the recovery endpoint directly.

### User account issues

**Symptoms:** A specific user reports they cannot create notes, or their access state is unexpected.

**Diagnosis:**

```bash
deno task ops user <telegram-user-id>
```

Check `status`, `alpha_access_status`, and `plan_key`.

**Resolution:**

- If `alpha_access_status` is `pending`: the user needs an invite redemption via `/start <invite-code>`.
- If `alpha_access_status` is `suspended`: use `deno task alpha-admin activate <telegram-user-id> --yes` to restore.
- If `status` is `blocked` for a non-alpha user: investigate before changing. The database trigger enforces lifecycle constraints.

### Deletion backlog

**Symptoms:** `ops health` shows `deletion_backlog > 0`.

**Diagnosis:**

Overdue deletions mean `finalize_due_account_deletions` cron has not run or failed.

**Resolution:**

1. Check cron status in the Supabase dashboard.
2. If the cron is healthy but backlogged, the 7-day window is working as designed — wait for the next cron run.
3. If the cron is failing, check Edge Function logs and fix the underlying issue.

## Escalation guidance

When a situation exceeds the scope of these procedures:

- Data loss or corruption: follow the backup/restore runbook (`BACKUP_RESTORE.md`).
- Credential compromise: follow the secret rotation runbook (`SECRET_ROTATION.md`).
- Unexpected data exposure or privacy incident: follow the incident response runbook (`INCIDENT_RESPONSE.md`).
- Production deployment issues: refer to the deployment checklist in `IMPLEMENTATION_STATUS.md`.
