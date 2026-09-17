-- Phase 0 / migration 6 of 9
-- public.processing_jobs and the job state machine.
--
-- In Phase 0 the job table *is* the durable queue: a row in QUEUED is a unit of
-- work that has been durably accepted and is awaiting a worker. The RECEIVED
-- state remains in the transition map because it is the state a job takes when
-- it has been persisted but not yet handed to a queue, which is what Phase 2's
-- pgmq integration will need. See docs/ADR/0004-job-state-machine.md.

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),

  -- Immutable owner. Every query that touches a job is scoped by this column.
  user_id uuid not null references public.users (id) on delete cascade,

  -- Telegram deduplication. UNIQUE here as well as a primary key on
  -- telegram_updates, because this is the constraint that guarantees one job per
  -- accepted update even under concurrent redelivery.
  update_id bigint not null references public.telegram_updates (update_id) on delete cascade,

  chat_id bigint not null,
  message_id bigint not null,
  status_message_id bigint,

  input_type public.input_type not null,

  -- Ephemeral. Cleared on reaching a terminal state; never logged, never placed
  -- in queue messages, never exposed to the AI provider (blueprint 16.3).
  telegram_file_id text,
  telegram_file_unique_id text,

  -- Present only for direct text input. Retention depends on privacy_mode.
  source_text text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  duration_seconds integer,

  template_key text not null references public.templates (key),

  state public.job_state not null default 'QUEUED',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,

  -- Safe operational code plus sanitised detail. Neither column may ever contain
  -- user content (blueprint 21.1).
  last_error_code text,
  last_error_detail text,

  -- Produced note. Foreign key added in migration 7, once notes exists.
  note_id uuid,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',

  constraint processing_jobs_update_id_key unique (update_id),
  constraint processing_jobs_attempt_count_non_negative check (attempt_count >= 0),
  constraint processing_jobs_size_bytes_non_negative check (size_bytes is null or size_bytes >= 0),
  constraint processing_jobs_duration_seconds_non_negative check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint processing_jobs_expires_after_created check (expires_at > created_at),
  constraint processing_jobs_last_error_code_format check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'
  ),
  constraint processing_jobs_mime_type_length check (mime_type is null or length(mime_type) <= 255),
  constraint processing_jobs_original_filename_length check (
    original_filename is null or length(original_filename) <= 255
  ),
  constraint processing_jobs_terminal_state_has_completed_at check (
    (state in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED'))
      = (completed_at is not null)
  )
);

comment on table public.processing_jobs is
  'Durable unit of work (blueprint 13.5). One row per accepted update; state transitions are enforced by trigger, not by convention.';

comment on column public.processing_jobs.state is
  'Initial states are RECEIVED and QUEUED only. Terminal states are absorbing: after reaching one, the row may only have telegram_file_id cleared.';

comment on column public.processing_jobs.expires_at is
  'Job cleanup horizon. A non-terminal job past this timestamp is abandoned and may be expired by the cleanup routine.';

comment on column public.processing_jobs.telegram_file_id is
  'Secret-adjacent: the Telegram download URL derived from this id embeds the bot token. Never log, persist in queue payloads, or forward to the AI provider.';

create index processing_jobs_user_created_idx on public.processing_jobs (user_id, created_at desc);

-- Recovery scan (blueprint 15.2): jobs that are due for another attempt.
create index processing_jobs_due_idx on public.processing_jobs (next_attempt_at)
  where state in ('QUEUED', 'RETRYABLE_FAILED');

-- Per-user active job limit (blueprint 18.3).
create index processing_jobs_active_per_user_idx on public.processing_jobs (user_id)
  where state not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- Abandoned job expiry and terminal file-id scrubbing.
create index processing_jobs_expires_at_idx on public.processing_jobs (expires_at)
  where state not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- Supports the mandatory index on the note_id foreign key (migration 7) so that
-- deleting a note does not scan the whole job table.
create index processing_jobs_note_id_idx on public.processing_jobs (note_id)
  where note_id is not null;

-- Now that processing_jobs exists, close the circular reference from the update
-- ledger.
alter table public.telegram_updates
  add constraint telegram_updates_processing_job_id_fkey
  foreign key (processing_job_id) references public.processing_jobs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- State machine
-- ---------------------------------------------------------------------------

create or replace function public.enforce_processing_job_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_terminal constant text[] := array['COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
  v_allowed boolean;
begin
  if tg_op = 'INSERT' then
    if new.state::text <> all (array['RECEIVED', 'QUEUED']) then
      raise exception using
        errcode = 'check_violation',
        message = format(
          'processing_jobs: a job must be created in RECEIVED or QUEUED, not %s',
          new.state
        );
    end if;
    return new;
  end if;

  -- A terminal state is absorbing. This is what lets a temporary failure be
  -- reported exactly once and lets the cleanup routine scrub telegram_file_id
  -- without reopening a finished job.
  --
  -- Two columns are exempt, and both are reference scrubbing rather than history:
  --
  --   telegram_file_id  cleared at terminal state by blueprint 14.1.
  --   note_id           cleared by the ON DELETE SET NULL foreign key when the
  --                     user deletes the produced note. Without this exemption a
  --                     completed job would block note deletion, which blueprint
  --                     11.5 requires to always succeed.
  --
  -- note_id may only be cleared, never re-pointed, so a completed job can never
  -- be silently reattached to a different note.
  if old.state::text = any (v_terminal) then
    if new.state <> old.state then
      raise exception using
        errcode = 'check_violation',
        message = format(
          'processing_jobs: terminal state %s cannot transition to %s',
          old.state,
          new.state
        );
    end if;

    if new.note_id is not null and new.note_id is distinct from old.note_id then
      raise exception using
        errcode = 'check_violation',
        message = format(
          'processing_jobs: terminal job %s may only clear note_id, not re-point it',
          old.id
        );
    end if;

    if (to_jsonb(new) - 'telegram_file_id' - 'note_id')
      is distinct from (to_jsonb(old) - 'telegram_file_id' - 'note_id')
    then
      raise exception using
        errcode = 'check_violation',
        message = format(
          'processing_jobs: terminal job %s is immutable except for telegram_file_id and note_id',
          old.id
        );
    end if;

    return new;
  end if;

  -- Non-transition updates: bumping attempt_count, scheduling next_attempt_at,
  -- recording a safe error code, or clearing a file id.
  if new.state = old.state then
    return new;
  end if;

  -- Legal transitions, from blueprint 14.
  --
  -- CANCELLED has no edge in the blueprint's state diagram but is listed as a
  -- terminal state in 14.1 and named in 14.2 under non-retryable failures
  -- ("User deleted/cancelled job"), so it must be reachable. It is allowed from
  -- every non-terminal state. See docs/ADR/0004-job-state-machine.md.
  v_allowed := case old.state::text
    when 'RECEIVED'         then new.state::text in ('QUEUED', 'REJECTED', 'CANCELLED')
    when 'QUEUED'           then new.state::text in ('ACQUIRING', 'EXPIRED', 'CANCELLED')
    when 'ACQUIRING'        then new.state::text in ('EXTRACTING', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'EXTRACTING'       then new.state::text in ('GENERATING', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'GENERATING'       then new.state::text in ('DELIVERING', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'DELIVERING'       then new.state::text in ('COMPLETED', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'RETRYABLE_FAILED' then new.state::text in ('QUEUED', 'FAILED', 'CANCELLED')
    else false
  end;

  if not v_allowed then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'processing_jobs: invalid state transition %s -> %s',
        old.state,
        new.state
      );
  end if;

  return new;
end;
$$;

comment on function public.enforce_processing_job_transition() is
  'Guards processing_jobs inserts and updates. Raises check_violation on an illegal transition or on any mutation of a terminal job other than clearing telegram_file_id.';

-- Revoked for the same reason as public.set_updated_at. This is a trigger
-- function and so is not callable by a client, but it keeps the grant to PUBLIC
-- that PostgreSQL gives every new function, and the deny-by-default posture is
-- worth holding uniformly rather than defending case by case. Firing a trigger
-- does not check EXECUTE on the function, so the trigger is unaffected.
revoke all on function public.enforce_processing_job_transition()
  from public, anon, authenticated;

create trigger processing_jobs_enforce_transition
  before insert or update on public.processing_jobs
  for each row
  execute function public.enforce_processing_job_transition();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.processing_jobs enable row level security;

revoke all on table public.processing_jobs from anon, authenticated;
