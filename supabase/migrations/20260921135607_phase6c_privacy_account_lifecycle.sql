-- Phase 6C: privacy disclosure and reversible account-deletion lifecycle.
-- A request blocks all new work immediately, remains cancellable for seven
-- days, then removes user-owned content and unlinks the retained content-free
-- usage ledger from every Telegram identifier.

alter table public.users
  alter column telegram_user_id drop not null,
  alter column telegram_chat_id drop not null,
  add column deletion_requested_at timestamptz,
  add column deletion_scheduled_at timestamptz,
  add column deleted_at timestamptz,
  add column pre_deletion_status public.user_status,
  add constraint users_deletion_lifecycle_shape check (
    (status = 'deletion_pending'
      and deletion_requested_at is not null
      and deletion_scheduled_at is not null
      and deletion_scheduled_at > deletion_requested_at
      and deleted_at is null
      and pre_deletion_status in ('active', 'blocked'))
    or
    (status = 'deleted'
      and deletion_requested_at is not null
      and deletion_scheduled_at is not null
      and deleted_at is not null
      and telegram_user_id is null
      and telegram_chat_id is null
      and telegram_username is null
      and display_name is null
      and pre_deletion_status is null)
    or
    (status in ('active', 'blocked')
      and deletion_requested_at is null
      and deletion_scheduled_at is null
      and deleted_at is null
      and pre_deletion_status is null)
  );

comment on column public.users.deletion_scheduled_at is
  'UTC deadline seven days after an account-deletion request. Cancellation is allowed only before this instant.';
comment on column public.users.deleted_at is
  'Final anonymisation time. The user row remains only to anchor immutable content-free usage metadata.';

create table public.account_lifecycle_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  deletion_scheduled_at timestamptz,
  constraint account_lifecycle_events_type check (
    event_type in ('deletion_requested', 'deletion_cancelled', 'deletion_finalized')
  )
);

comment on table public.account_lifecycle_events is
  'Content-free lifecycle audit. Stores only an internal UUID, event type, and timestamps; no Telegram identity or note content.';

create index account_lifecycle_events_user_occurred_idx
  on public.account_lifecycle_events (user_id, occurred_at desc);

create index users_deletion_due_idx
  on public.users (deletion_scheduled_at)
  where status = 'deletion_pending';

alter table public.account_lifecycle_events enable row level security;
revoke all on table public.account_lifecycle_events from anon, authenticated;
revoke all on table public.account_lifecycle_events from public, service_role;

create or replace function public.get_account_lifecycle(p_user_id uuid)
returns table (
  account_status public.user_status,
  deletion_requested_at timestamptz,
  deletion_scheduled_at timestamptz,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.status, u.deletion_requested_at, u.deletion_scheduled_at, u.deleted_at
    from public.users as u
   where u.id = p_user_id;
$$;

create or replace function public.request_account_deletion(p_user_id uuid)
returns table (outcome text, deletion_scheduled_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_scheduled_at timestamptz;
begin
  select u.* into v_user
    from public.users as u
   where u.id = p_user_id
   for update;

  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if v_user.status = 'deleted' then
    return query select 'deleted'::text, v_user.deletion_scheduled_at;
    return;
  end if;
  if v_user.status = 'deletion_pending' then
    return query select 'already_pending'::text, v_user.deletion_scheduled_at;
    return;
  end if;

  v_scheduled_at := now() + interval '7 days';

  -- Cancel all work before changing the lifecycle gate. The state-machine
  -- trigger explicitly permits CANCELLED from every non-terminal state.
  update public.processing_jobs as job
     set state = 'CANCELLED',
         completed_at = now(),
         next_attempt_at = null,
         telegram_file_id = null,
         telegram_file_unique_id = null,
         source_text = null,
         original_filename = null,
         mime_type = null,
         last_error_code = 'ACCOUNT_DELETION_REQUESTED',
         last_error_detail = 'cancelled before account deletion grace period'
   where job.user_id = p_user_id
     and job.state not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED');

  perform pgmq.delete('notinn_jobs', job.queue_message_id)
    from public.processing_jobs as job
   where job.user_id = p_user_id
     and job.queue_message_id is not null;

  -- Release in-flight quota so a cancelled request is never counted as usage.
  with released as (
    update public.quota_reservations as reservation
       set status = 'released', updated_at = now()
     where reservation.user_id = p_user_id
       and reservation.status = 'reserved'
    returning reservation.metric, reservation.period_start, reservation.reserved_units
  ), totals as (
    select metric, period_start, sum(reserved_units)::bigint as units
      from released
     group by metric, period_start
  )
  update public.quota_buckets as bucket
     set reserved_units = greatest(0, bucket.reserved_units - totals.units),
         updated_at = now()
    from totals
   where bucket.user_id = p_user_id
     and bucket.metric = totals.metric
     and bucket.period_start = totals.period_start;

  update public.users
     set status = 'deletion_pending',
         pre_deletion_status = v_user.status,
         deletion_requested_at = now(),
         deletion_scheduled_at = v_scheduled_at,
         deleted_at = null,
         updated_at = now()
   where id = p_user_id;

  insert into public.account_lifecycle_events (
    user_id, event_type, deletion_scheduled_at
  ) values (
    p_user_id, 'deletion_requested', v_scheduled_at
  );

  return query select 'scheduled'::text, v_scheduled_at;
end;
$$;

create or replace function public.cancel_account_deletion(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  select u.* into v_user
    from public.users as u
   where u.id = p_user_id
   for update;

  if not found then return 'not_found'; end if;
  if v_user.status = 'deleted' then return 'deleted'; end if;
  if v_user.status <> 'deletion_pending' then return 'not_pending'; end if;
  if v_user.deletion_scheduled_at <= now() then return 'expired'; end if;

  update public.users
     set status = coalesce(v_user.pre_deletion_status, 'active'::public.user_status),
         deletion_requested_at = null,
         deletion_scheduled_at = null,
         deleted_at = null,
         pre_deletion_status = null,
         updated_at = now()
   where id = p_user_id;

  insert into public.account_lifecycle_events (user_id, event_type)
  values (p_user_id, 'deletion_cancelled');
  return 'cancelled';
end;
$$;

create or replace function public.finalize_account_deletion(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  select u.* into v_user
    from public.users as u
   where u.id = p_user_id
   for update;

  if not found then return 'not_found'; end if;
  if v_user.status = 'deleted' then return 'already_deleted'; end if;
  if v_user.status <> 'deletion_pending' then return 'not_pending'; end if;
  if v_user.deletion_scheduled_at > now() then return 'not_due'; end if;

  perform pgmq.delete('notinn_jobs', job.queue_message_id)
    from public.processing_jobs as job
   where job.user_id = p_user_id
     and job.queue_message_id is not null;

  update public.processing_jobs as job
     set state = 'CANCELLED',
         completed_at = now(),
         next_attempt_at = null,
         telegram_file_id = null,
         telegram_file_unique_id = null,
         source_text = null,
         original_filename = null,
         mime_type = null,
         last_error_code = 'ACCOUNT_DELETED',
         last_error_detail = 'cancelled by finalized account deletion'
   where job.user_id = p_user_id
     and job.state not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED');

  -- Notes delete their outputs, deliveries, drafts, and embeddings by cascade.
  delete from public.notes where user_id = p_user_id;
  delete from public.user_preferences where user_id = p_user_id;
  delete from public.processing_jobs where user_id = p_user_id;
  delete from public.telegram_updates where user_id = p_user_id;
  delete from public.templates where owner_user_id = p_user_id;
  delete from public.quota_reservations where user_id = p_user_id;
  delete from public.quota_daily_buckets where user_id = p_user_id;
  delete from public.quota_buckets where user_id = p_user_id;
  delete from public.closed_alpha_invite_redemptions where user_id = p_user_id;

  update public.users
     set status = 'deleted',
         telegram_user_id = null,
         telegram_chat_id = null,
         telegram_username = null,
         display_name = null,
         alpha_access_status = 'suspended',
         alpha_access_suspended_at = coalesce(alpha_access_suspended_at, now()),
         deleted_at = now(),
         pre_deletion_status = null,
         updated_at = now()
   where id = p_user_id;

  insert into public.account_lifecycle_events (
    user_id, event_type, deletion_scheduled_at
  ) values (
    p_user_id, 'deletion_finalized', v_user.deletion_scheduled_at
  );
  return 'deleted';
end;
$$;

create or replace function public.finalize_due_account_deletions(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count integer := 0;
begin
  for v_user_id in
    select u.id
      from public.users as u
     where u.status = 'deletion_pending'
       and u.deletion_scheduled_at <= now()
     order by u.deletion_scheduled_at
     limit greatest(1, least(p_limit, 500))
     for update skip locked
  loop
    if public.finalize_account_deletion(v_user_id) = 'deleted' then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

comment on function public.request_account_deletion(uuid) is
  'Blocks the account immediately, cancels active work, and starts a reversible seven-day deletion grace period.';
comment on function public.cancel_account_deletion(uuid) is
  'Cancels a still-open deletion request. Cancelled jobs remain cancelled and may be resent.';
comment on function public.finalize_account_deletion(uuid) is
  'Deletes user-owned content after the grace period and anonymises Telegram identity while preserving content-free usage records.';
comment on function public.finalize_due_account_deletions(integer) is
  'Finalises a bounded batch of due account deletions for the hourly database cron.';

-- The database owns the deadline, so finalisation does not depend on a user
-- returning to Telegram or an Edge Function isolate remaining alive.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule(
  'notinn-finalize-account-deletions',
  '17 * * * *',
  'select public.finalize_due_account_deletions(50);'
);

revoke all on function public.get_account_lifecycle(uuid)
  from public, anon, authenticated;
revoke all on function public.request_account_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_account_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_account_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_due_account_deletions(integer)
  from public, anon, authenticated;

grant execute on function public.get_account_lifecycle(uuid) to service_role;
grant execute on function public.request_account_deletion(uuid) to service_role;
grant execute on function public.cancel_account_deletion(uuid) to service_role;
grant execute on function public.finalize_account_deletion(uuid) to service_role;
grant execute on function public.finalize_due_account_deletions(integer) to service_role;
