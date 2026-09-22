-- Phase 6D: operations monitoring indexes and RPC functions.
-- Additive only: four indexes for operational queries, five SECURITY
-- DEFINER functions that return counts and status enums — never user content.

-- --- Indexes ----------------------------------------------------------------

-- Stale or failed job detection: filter by state, order by creation time.
create index if not exists processing_jobs_state_created_idx
  on public.processing_jobs (state, created_at);

-- Per-user job status queries.
create index if not exists processing_jobs_user_state_idx
  on public.processing_jobs (user_id, state);

-- User status filtering for aggregate views.
create index if not exists users_status_alpha_idx
  on public.users (status, alpha_access_status);

-- Stale reservation detection.
create index if not exists quota_reservations_status_created_idx
  on public.quota_reservations (status, created_at);

-- --- RPC functions ----------------------------------------------------------

-- Health overview: counts only, no user content.
create or replace function public.get_ops_health()
returns table (
  queue_depth bigint,
  stale_jobs bigint,
  failed_jobs bigint,
  deletion_backlog bigint,
  active_users bigint,
  total_notes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.processing_jobs
      where state::text not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
    (select count(*) from public.processing_jobs
      where state::text in ('QUEUED', 'ACQUIRING', 'EXTRACTING', 'GENERATING', 'DELIVERING')
        and created_at < now() - interval '10 minutes'),
    (select count(*) from public.processing_jobs
      where state::text in ('FAILED', 'RETRYABLE_FAILED')),
    (select count(*) from public.users
      where status = 'deletion_pending'::public.user_status
        and deletion_scheduled_at <= now()),
    (select count(*) from public.users
      where status = 'active'::public.user_status),
    (select count(*) from public.notes);
$$;

revoke all on function public.get_ops_health() from public, anon, authenticated;
grant execute on function public.get_ops_health() to service_role;

-- Problematic jobs: stale or failed, limited to 50 rows, no user content.
create or replace function public.get_ops_problematic_jobs(
  p_stale_seconds integer default 600
)
returns table (
  job_id uuid,
  user_id uuid,
  state text,
  attempt_count integer,
  created_at timestamptz,
  last_error_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.user_id, j.state::text, j.attempt_count, j.created_at, j.last_error_code
    from public.processing_jobs as j
   where (j.state::text in ('QUEUED', 'ACQUIRING', 'EXTRACTING', 'GENERATING', 'DELIVERING')
          and j.created_at < now() - make_interval(secs => p_stale_seconds))
      or j.state::text in ('FAILED', 'RETRYABLE_FAILED')
   order by j.created_at asc
   limit 50;
$$;

revoke all on function public.get_ops_problematic_jobs(integer) from public, anon, authenticated;
grant execute on function public.get_ops_problematic_jobs(integer) to service_role;

-- Per-user operational status: account, notes, jobs — no note content.
create or replace function public.get_user_ops_status(
  p_telegram_user_id bigint
)
returns table (
  internal_user_id uuid,
  status text,
  alpha_access_status text,
  plan_key text,
  notes_count bigint,
  active_jobs bigint,
  failed_jobs bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.status::text,
    u.alpha_access_status::text,
    u.plan_key,
    (select count(*) from public.notes as n where n.user_id = u.id),
    (select count(*) from public.processing_jobs as j
      where j.user_id = u.id
        and j.state::text not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
    (select count(*) from public.processing_jobs as j
      where j.user_id = u.id
        and j.state::text in ('FAILED', 'RETRYABLE_FAILED'))
  from public.users as u
  where u.telegram_user_id = p_telegram_user_id;
$$;

revoke all on function public.get_user_ops_status(bigint) from public, anon, authenticated;
grant execute on function public.get_user_ops_status(bigint) to service_role;

-- Safe job requeue: returns an outcome rather than throwing for expected cases.
-- The operator script decides policy; this function only executes the transition.
create or replace function public.requeue_processing_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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

  if v_job.state in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED')::public.job_state[] then
    return 'terminal';
  end if;

  if v_job.note_id is null then
    return 'no_note_yet';
  end if;

  update public.processing_jobs
     set state = 'QUEUED'::public.job_state,
         attempt_count = 0,
         last_error_code = null,
         last_error_detail = null,
         next_attempt_at = null,
         started_at = null
   where id = p_job_id;

  return 'requeued';
end;
$$;

revoke all on function public.requeue_processing_job(uuid) from public, anon, authenticated;
grant execute on function public.requeue_processing_job(uuid) to service_role;

-- Safe job cancel: transitions to CANCELLED from any non-terminal state.
-- The trigger enforce_processing_job_transition permits this edge.
create or replace function public.cancel_processing_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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

  if v_job.state in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED')::public.job_state[] then
    return 'already_terminal';
  end if;

  update public.processing_jobs
     set state = 'CANCELLED'::public.job_state,
         completed_at = now()
   where id = p_job_id;

  return 'cancelled';
end;
$$;

revoke all on function public.cancel_processing_job(uuid) from public, anon, authenticated;
grant execute on function public.cancel_processing_job(uuid) to service_role;
