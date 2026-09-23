-- Phase 7D: Admin Dashboard and Operator Observability
--
-- Security posture:
-- 1. admin_users table stores internal user IDs permitted for admin access.
-- 2. is_current_user_admin() checks if the authenticated user resolves to admin_users.
-- 3. All admin_* functions are SECURITY DEFINER with search_path = '',
--    and verify is_current_user_admin() before executing.
-- 4. Revoke all on admin_users and admin_* functions from anon and public.

-- --- 1. admin_users table ----------------------------------------------------

create table if not exists public.admin_users (
  user_id uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text not null default 'manual'
);

comment on table public.admin_users is
  'Allowlist of internal users with admin dashboard permissions.';

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.admin_users from public, service_role;

-- --- 2. Helper: check if caller is an admin ----------------------------------

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_users as a
      join public.auth_links as al on al.user_id = a.user_id
     where al.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon, authenticated;
grant execute on function public.is_current_user_admin() to service_role, authenticated;

-- --- 3. Auto-seed initial admin ----------------------------------------------
-- Seeds existing users as initial admins for local development / initial setup
insert into public.admin_users (user_id, created_by)
select id, 'initial_seed' from public.users
on conflict do nothing;

-- --- 4. RPC: check admin access from frontend --------------------------------

create or replace function public.admin_check_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_current_user_admin();
$$;

revoke all on function public.admin_check_access() from public, anon, authenticated;
grant execute on function public.admin_check_access() to service_role, authenticated;

-- --- 5. RPC: get system health -----------------------------------------------

create or replace function public.admin_get_health()
returns table (
  queue_depth bigint,
  stale_jobs bigint,
  failed_jobs bigint,
  deletion_backlog bigint,
  active_users bigint,
  total_notes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return query
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
end;
$$;

revoke all on function public.admin_get_health() from public, anon, authenticated;
grant execute on function public.admin_get_health() to service_role, authenticated;

-- --- 6. RPC: list problematic / active / failed jobs -------------------------

create or replace function public.admin_list_jobs(
  p_limit integer default 50
)
returns table (
  job_id uuid,
  user_id uuid,
  state text,
  attempt_count integer,
  created_at timestamptz,
  last_error_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return query
    select j.id, j.user_id, j.state::text, j.attempt_count, j.created_at, j.last_error_code
      from public.processing_jobs as j
     where (j.state::text in ('QUEUED', 'ACQUIRING', 'EXTRACTING', 'GENERATING', 'DELIVERING')
            and j.created_at < now() - interval '10 minutes')
        or j.state::text in ('FAILED', 'RETRYABLE_FAILED')
        or j.state::text in ('QUEUED', 'ACQUIRING', 'EXTRACTING', 'GENERATING', 'DELIVERING')
     order by
       case
         when j.state::text in ('FAILED', 'RETRYABLE_FAILED') then 1
         when j.created_at < now() - interval '10 minutes' then 2
         else 3
       end,
       j.created_at desc
     limit coalesce(p_limit, 50);
end;
$$;

revoke all on function public.admin_list_jobs(integer) from public, anon, authenticated;
grant execute on function public.admin_list_jobs(integer) to service_role, authenticated;

-- --- 7. RPC: requeue job -----------------------------------------------------

create or replace function public.admin_requeue_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return public.requeue_processing_job(p_job_id);
end;
$$;

revoke all on function public.admin_requeue_job(uuid) from public, anon, authenticated;
grant execute on function public.admin_requeue_job(uuid) to service_role, authenticated;

-- --- 8. RPC: cancel job ------------------------------------------------------

create or replace function public.admin_cancel_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return public.cancel_processing_job(p_job_id);
end;
$$;

revoke all on function public.admin_cancel_job(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_job(uuid) to service_role, authenticated;

-- --- 9. RPC: list users with operational stats -------------------------------

create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  telegram_user_id bigint,
  status text,
  alpha_access_status text,
  plan_key text,
  created_at timestamptz,
  notes_count bigint,
  active_jobs bigint,
  failed_jobs bigint,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return query
    select
      u.id,
      u.telegram_user_id,
      u.status::text,
      u.alpha_access_status::text,
      u.plan_key,
      u.created_at,
      (select count(*) from public.notes as n where n.user_id = u.id),
      (select count(*) from public.processing_jobs as j
        where j.user_id = u.id
          and j.state::text not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
      (select count(*) from public.processing_jobs as j
        where j.user_id = u.id
          and j.state::text in ('FAILED', 'RETRYABLE_FAILED')),
      exists(select 1 from public.admin_users as a where a.user_id = u.id) as is_admin
    from public.users as u
    where (
      p_search is null
      or p_search = ''
      or u.telegram_user_id::text like '%' || trim(p_search) || '%'
      or u.plan_key like '%' || trim(p_search) || '%'
      or u.id::text like '%' || trim(p_search) || '%'
    )
    order by u.created_at desc
    limit coalesce(p_limit, 50)
    offset coalesce(p_offset, 0);
end;
$$;

revoke all on function public.admin_list_users(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to service_role, authenticated;

-- --- 10. RPC: change user plan -----------------------------------------------

create or replace function public.admin_set_user_plan(
  p_user_id uuid,
  p_plan_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telegram_id bigint;
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  select telegram_user_id into v_telegram_id
    from public.users
   where id = p_user_id;

  if not found then
    return 'not_found';
  end if;

  return public.change_user_plan(v_telegram_id, p_plan_key);
end;
$$;

revoke all on function public.admin_set_user_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_plan(uuid, text) to service_role, authenticated;

-- --- 11. RPC: set user status ------------------------------------------------

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  if p_status not in ('active', 'suspended', 'pending') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  update public.users
     set alpha_access_status = case
           when p_status = 'active' then 'active'::public.closed_alpha_access_status
           when p_status = 'suspended' then 'suspended'::public.closed_alpha_access_status
           else 'pending'::public.closed_alpha_access_status
         end,
         alpha_access_activated_at = case when p_status = 'active' then now() else alpha_access_activated_at end,
         alpha_access_suspended_at = case when p_status = 'suspended' then now() else null end,
         updated_at = now()
   where id = p_user_id;

  if not found then
    return 'not_found';
  end if;

  return 'updated';
end;
$$;

revoke all on function public.admin_set_user_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_status(uuid, text) to service_role, authenticated;

-- --- 12. RPC: list closed alpha invites --------------------------------------

create or replace function public.admin_list_invites()
returns table (
  id uuid,
  code_sha256 text,
  max_redemptions integer,
  redemption_count integer,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return query
    select i.id, i.code_sha256, i.max_redemptions, i.redemption_count, i.expires_at, i.revoked_at, i.created_at
      from public.closed_alpha_invites as i
     order by i.created_at desc
     limit 100;
end;
$$;

revoke all on function public.admin_list_invites() from public, anon, authenticated;
grant execute on function public.admin_list_invites() to service_role, authenticated;

-- --- 13. RPC: create closed alpha invite -------------------------------------

create or replace function public.admin_create_invite(
  p_code_sha256 text,
  p_max_redemptions integer,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return public.create_closed_alpha_invite(p_code_sha256, p_max_redemptions, p_expires_at);
end;
$$;

revoke all on function public.admin_create_invite(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_create_invite(text, integer, timestamptz) to service_role, authenticated;

-- --- 14. RPC: revoke closed alpha invite -------------------------------------

create or replace function public.admin_revoke_invite(
  p_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  update public.closed_alpha_invites
     set revoked_at = now()
   where id = p_invite_id
     and revoked_at is null;

  return found;
end;
$$;

revoke all on function public.admin_revoke_invite(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_invite(uuid) to service_role, authenticated;
