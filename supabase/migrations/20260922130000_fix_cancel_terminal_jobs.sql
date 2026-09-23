-- Fix: allow operators to cancel terminal jobs (FAILED → CANCELLED, etc.)
--
-- Context:
--   1. cancel_processing_job() had a casting bug: the ::job_state[] cast applied
--      to the boolean result of `in`, not to the array literal.  Fixed by
--      comparing state::text against text literals.
--
--   2. enforce_processing_job_transition() treated all terminal states as fully
--      absorbing, blocking FAILED → CANCELLED.  An operator who decides a
--      terminal job is noise should be able to silence it.  CANCELLED is "more
--      final" than any other terminal state — it marks operator intent — so the
--      transition is safe and does not reopen the job for processing.
--
--   3. Both functions use search_path = ''; references are fully qualified.

-- ── 1. Amend the trigger to allow terminal → CANCELLED ──────────────────────

CREATE OR REPLACE FUNCTION public.enforce_processing_job_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
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

  -- Same-state update: always allowed (attempt_count, next_attempt_at, etc.).
  if new.state = old.state then
    -- Terminal same-state: still enforce column immutability.
    if old.state::text = any (v_terminal) then
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
    end if;
    return new;
  end if;

  -- Legal transitions, from blueprint 14.
  --
  -- CANCELLED is reachable from every non-terminal state (inference in
  -- docs/ADR/0004-job-state-machine.md).  Terminal states may also transition
  -- to CANCELLED so operators can silence noisy terminal jobs.
  v_allowed := case old.state::text
    when 'RECEIVED'         then new.state::text in ('QUEUED', 'REJECTED', 'CANCELLED')
    when 'QUEUED'           then new.state::text in ('ACQUIRING', 'EXPIRED', 'CANCELLED')
    when 'ACQUIRING'        then new.state::text in ('EXTRACTING', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'EXTRACTING'       then new.state::text in ('GENERATING', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'GENERATING'       then new.state::text in ('DELIVERING', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'DELIVERING'       then new.state::text in ('COMPLETED', 'RETRYABLE_FAILED', 'CANCELLED')
    when 'RETRYABLE_FAILED' then new.state::text in ('QUEUED', 'FAILED', 'CANCELLED')
    when 'COMPLETED'        then new.state::text in ('CANCELLED')
    when 'FAILED'           then new.state::text in ('CANCELLED')
    when 'REJECTED'         then new.state::text in ('CANCELLED')
    when 'EXPIRED'          then new.state::text in ('CANCELLED')
    when 'CANCELLED'        then false
    else false
  end;

  if not v_allowed then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'processing_jobs: invalid state transition %s -> %s',
        old.state, new.state
      );
  end if;

  return new;
end;
$function$;

-- ── 2. Fix cancel_processing_job() ─────────────────────────────────────────
--    Remove the broken casting and the early-return for terminal states,
--    letting the amended trigger handle the terminal → CANCELLED edge.

CREATE OR REPLACE FUNCTION public.cancel_processing_job(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_job public.processing_jobs%rowtype;
begin
  select j.* into v_job
    from public.processing_jobs as j
   where j.id = p_job_id
   for update;

  if not found then
    return 'not_found';
  end if;

  -- Already CANCELLED → no-op.  Other terminal states fall through;
  -- the trigger now allows terminal → CANCELLED.
  if v_job.state::text = 'CANCELLED' then
    return 'already_terminal';
  end if;

  update public.processing_jobs
     set state = 'CANCELLED'::public.job_state
   where id = p_job_id;

  return 'cancelled';
end;
$function$;
