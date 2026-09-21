-- Phase 6B: invite-only closed-alpha access, operator controls, and daily
-- provider-operation guards. Existing development users are grandfathered in;
-- new Telegram identities remain pending until an invite is redeemed.

create type public.closed_alpha_access_status as enum (
  'pending',
  'active',
  'suspended'
);

alter table public.users
  add column alpha_access_status public.closed_alpha_access_status not null default 'pending',
  add column alpha_access_activated_at timestamptz,
  add column alpha_access_suspended_at timestamptz;

-- Preserve every current development user. This statement runs before the
-- updated ensure function starts creating pending identities.
update public.users
   set alpha_access_status = 'active',
       alpha_access_activated_at = coalesce(alpha_access_activated_at, now())
 where status = 'active';

create index users_alpha_access_status_idx
  on public.users (alpha_access_status, created_at);

create table public.closed_alpha_invites (
  id uuid primary key default gen_random_uuid(),
  code_sha256 text not null unique,
  max_redemptions integer not null,
  redemption_count integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint closed_alpha_invites_digest_format check (code_sha256 ~ '^[0-9a-f]{64}$'),
  constraint closed_alpha_invites_max_positive check (max_redemptions between 1 and 10000),
  constraint closed_alpha_invites_count_valid check (
    redemption_count >= 0 and redemption_count <= max_redemptions
  )
);

create table public.closed_alpha_invite_redemptions (
  invite_id uuid not null references public.closed_alpha_invites (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete restrict,
  redeemed_at timestamptz not null default now(),
  primary key (invite_id, user_id),
  unique (user_id)
);

comment on column public.closed_alpha_invites.code_sha256 is
  'SHA-256 of the normalized invite code. Raw invite codes never enter Postgres.';
comment on table public.closed_alpha_invite_redemptions is
  'One immutable redemption per closed-alpha user; contains identifiers only.';

-- New identities are deliberately created as lifecycle-blocked and
-- alpha-pending. Invite redemption activates both gates atomically. Existing
-- identities retain their current lifecycle status on conflict.
create or replace function public.ensure_telegram_user(
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint,
  p_telegram_username text default null,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  insert into public.users as u (
    telegram_user_id, telegram_chat_id, telegram_username, display_name,
    status, alpha_access_status
  ) values (
    p_telegram_user_id,
    p_telegram_chat_id,
    nullif(btrim(p_telegram_username), ''),
    nullif(btrim(p_display_name), ''),
    'blocked'::public.user_status,
    'pending'::public.closed_alpha_access_status
  )
  on conflict (telegram_user_id) do update
    set telegram_chat_id = excluded.telegram_chat_id,
        telegram_username = excluded.telegram_username,
        display_name = excluded.display_name,
        updated_at = now()
    where u.telegram_chat_id is distinct from excluded.telegram_chat_id
       or u.telegram_username is distinct from excluded.telegram_username
       or u.display_name is distinct from excluded.display_name
  returning u.id into v_user_id;

  if v_user_id is null then
    select u.id into v_user_id
      from public.users as u
     where u.telegram_user_id = p_telegram_user_id;
  end if;

  insert into public.user_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return v_user_id;
end;
$$;

create or replace function public.get_closed_alpha_access(p_user_id uuid)
returns table (
  access_status public.closed_alpha_access_status,
  activated_at timestamptz,
  suspended_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.alpha_access_status, u.alpha_access_activated_at, u.alpha_access_suspended_at
    from public.users as u
   where u.id = p_user_id
     and u.status not in ('deletion_pending', 'deleted');
$$;

create or replace function public.redeem_closed_alpha_invite(
  p_user_id uuid,
  p_code_sha256 text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_invite public.closed_alpha_invites%rowtype;
begin
  if p_code_sha256 !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;

  select u.* into v_user
    from public.users as u
   where u.id = p_user_id
   for update;
  if not found or v_user.status in ('deletion_pending', 'deleted') then
    return 'user_not_active';
  end if;
  if v_user.alpha_access_status = 'active' then return 'already_active'; end if;
  if v_user.alpha_access_status = 'suspended' then return 'suspended'; end if;

  select invite.* into v_invite
    from public.closed_alpha_invites as invite
   where invite.code_sha256 = p_code_sha256
   for update;
  if not found or v_invite.revoked_at is not null then return 'invalid'; end if;
  if v_invite.expires_at <= now() then return 'expired'; end if;
  if v_invite.redemption_count >= v_invite.max_redemptions then return 'exhausted'; end if;

  insert into public.closed_alpha_invite_redemptions (invite_id, user_id)
  values (v_invite.id, p_user_id)
  on conflict (user_id) do nothing;
  if not found then return 'already_active'; end if;

  update public.closed_alpha_invites
     set redemption_count = redemption_count + 1
   where id = v_invite.id;
  update public.users
     set status = 'active',
         alpha_access_status = 'active',
         alpha_access_activated_at = now(),
         alpha_access_suspended_at = null,
         updated_at = now()
   where id = p_user_id;
  return 'activated';
end;
$$;

-- Operator-only surfaces. They are never wired into the Telegram webhook.
create or replace function public.create_closed_alpha_invite(
  p_code_sha256 text,
  p_max_redemptions integer,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_code_sha256 !~ '^[0-9a-f]{64}$'
     or p_max_redemptions not between 1 and 10000
     or p_expires_at <= now() then
    raise exception using errcode = '22023', message = 'invalid closed-alpha invite';
  end if;
  insert into public.closed_alpha_invites (code_sha256, max_redemptions, expires_at)
  values (p_code_sha256, p_max_redemptions, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_closed_alpha_access(
  p_telegram_user_id bigint,
  p_access_status public.closed_alpha_access_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users as u
     set alpha_access_status = p_access_status,
         status = case
           when p_access_status = 'active' then 'active'::public.user_status
           else 'blocked'::public.user_status
         end,
         alpha_access_activated_at = case
           when p_access_status = 'active' then coalesce(u.alpha_access_activated_at, now())
           else u.alpha_access_activated_at
         end,
         alpha_access_suspended_at = case
           when p_access_status = 'suspended' then now()
           else null
         end,
         updated_at = now()
   where u.telegram_user_id = p_telegram_user_id
     and u.status not in ('deletion_pending', 'deleted');
  return found;
end;
$$;

create or replace function public.revoke_closed_alpha_invite(p_code_sha256 text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code_sha256 !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.closed_alpha_invites
     set revoked_at = coalesce(revoked_at, now())
   where code_sha256 = p_code_sha256;
  return found;
end;
$$;

-- Daily limits complement, rather than replace, the approved monthly limits.
alter table public.plan_entitlements add column daily_limit bigint;
update public.plan_entitlements
   set daily_limit = case
     when plan_key = 'alpha' and metric = 'note_generation' then 50
     when plan_key = 'alpha' then 20
     when plan_key = 'free' then 50
     when plan_key = 'pro' and metric = 'note_generation' then 200
     else 100
   end;
alter table public.plan_entitlements
  alter column daily_limit set not null,
  add constraint plan_entitlements_daily_limit_positive check (daily_limit > 0),
  add constraint plan_entitlements_daily_not_above_monthly check (daily_limit <= monthly_limit);

create table public.quota_daily_buckets (
  user_id uuid not null references public.users (id) on delete restrict,
  metric public.quota_metric not null,
  usage_date date not null,
  used_units bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, usage_date),
  constraint quota_daily_buckets_used_non_negative check (used_units >= 0)
);

-- Extend the reservation result with daily counters. One monthly-bucket lock
-- serializes both checks, so two requests cannot spend the last daily unit.
drop function public.reserve_plan_quota(uuid, public.quota_metric, text, bigint, uuid);
create or replace function public.reserve_plan_quota(
  p_user_id uuid,
  p_metric public.quota_metric,
  p_reservation_key text,
  p_units bigint default 1,
  p_job_id uuid default null
)
returns table (
  outcome text, reservation_id uuid, plan_key text, metric public.quota_metric,
  monthly_limit bigint, used_units bigint, reserved_units bigint,
  period_start date, period_end date, daily_limit bigint,
  daily_used_units bigint, daily_reserved_units bigint, usage_date date
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plan_key text; v_monthly_limit bigint; v_daily_limit bigint;
  v_period_start date := date_trunc('month', timezone('UTC', now()))::date;
  v_usage_date date := timezone('UTC', now())::date;
  v_period_end date; v_used bigint; v_reserved bigint; v_daily_used bigint;
  v_daily_reserved bigint; v_reclaimed bigint;
  v_existing public.quota_reservations%rowtype; v_reservation_id uuid;
begin
  if p_units <= 0 or length(btrim(p_reservation_key)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid quota reservation arguments';
  end if;
  select u.plan_key into v_plan_key from public.users u
   where u.id = p_user_id and u.status = 'active' and u.alpha_access_status = 'active';
  if not found then
    return query select 'user_not_active'::text, null::uuid, null::text, p_metric,
      null::bigint, 0::bigint, 0::bigint, v_period_start,
      (v_period_start + interval '1 month')::date, null::bigint,
      0::bigint, 0::bigint, v_usage_date;
    return;
  end if;
  select e.monthly_limit, e.daily_limit into v_monthly_limit, v_daily_limit
    from public.plan_entitlements e join public.plans p on p.plan_key = e.plan_key
   where e.plan_key = v_plan_key and e.metric = p_metric and p.is_active;
  if not found then
    return query select 'plan_not_configured'::text, null::uuid, v_plan_key, p_metric,
      null::bigint, 0::bigint, 0::bigint, v_period_start,
      (v_period_start + interval '1 month')::date, null::bigint,
      0::bigint, 0::bigint, v_usage_date;
    return;
  end if;
  v_period_end := (v_period_start + interval '1 month')::date;
  insert into public.quota_buckets (user_id, metric, period_start)
  values (p_user_id, p_metric, v_period_start) on conflict do nothing;
  select b.used_units, b.reserved_units into v_used, v_reserved
    from public.quota_buckets b where b.user_id = p_user_id
     and b.metric = p_metric and b.period_start = v_period_start for update;
  with released as (
    update public.quota_reservations r set status = 'released', updated_at = now()
     where r.user_id = p_user_id and r.metric = p_metric
       and r.period_start = v_period_start and r.status = 'reserved'
       and r.expires_at <= now() returning r.reserved_units
  ) select coalesce(sum(released.reserved_units), 0)::bigint into v_reclaimed from released;
  if v_reclaimed > 0 then
    v_reserved := greatest(0, v_reserved - v_reclaimed);
    update public.quota_buckets b set reserved_units = v_reserved, updated_at = now()
     where b.user_id = p_user_id and b.metric = p_metric and b.period_start = v_period_start;
  end if;
  insert into public.quota_daily_buckets (user_id, metric, usage_date)
  values (p_user_id, p_metric, v_usage_date) on conflict do nothing;
  select b.used_units into v_daily_used from public.quota_daily_buckets b
   where b.user_id = p_user_id and b.metric = p_metric and b.usage_date = v_usage_date for update;
  select coalesce(sum(r.reserved_units), 0)::bigint into v_daily_reserved
    from public.quota_reservations r where r.user_id = p_user_id and r.metric = p_metric
     and r.status = 'reserved' and timezone('UTC', r.created_at)::date = v_usage_date;
  select r.* into v_existing from public.quota_reservations r
   where r.user_id = p_user_id and r.metric = p_metric and r.reservation_key = p_reservation_key;
  if found then
    return query select ('existing_' || v_existing.status::text), v_existing.id,
      v_plan_key, p_metric, v_monthly_limit, v_used, v_reserved, v_period_start,
      v_period_end, v_daily_limit, v_daily_used, v_daily_reserved, v_usage_date;
    return;
  end if;
  if v_daily_used + v_daily_reserved + p_units > v_daily_limit then
    return query select 'daily_exceeded'::text, null::uuid, v_plan_key, p_metric,
      v_monthly_limit, v_used, v_reserved, v_period_start, v_period_end,
      v_daily_limit, v_daily_used, v_daily_reserved, v_usage_date;
    return;
  end if;
  if v_used + v_reserved + p_units > v_monthly_limit then
    return query select 'exceeded'::text, null::uuid, v_plan_key, p_metric,
      v_monthly_limit, v_used, v_reserved, v_period_start, v_period_end,
      v_daily_limit, v_daily_used, v_daily_reserved, v_usage_date;
    return;
  end if;
  insert into public.quota_reservations
    (user_id, job_id, metric, reservation_key, period_start, reserved_units)
  values (p_user_id, p_job_id, p_metric, p_reservation_key, v_period_start, p_units)
  returning id into v_reservation_id;
  v_reserved := v_reserved + p_units;
  update public.quota_buckets b set reserved_units = v_reserved, updated_at = now()
   where b.user_id = p_user_id and b.metric = p_metric and b.period_start = v_period_start;
  return query select 'reserved'::text, v_reservation_id, v_plan_key, p_metric,
    v_monthly_limit, v_used, v_reserved, v_period_start, v_period_end,
    v_daily_limit, v_daily_used, v_daily_reserved + p_units, v_usage_date;
end;
$$;

create or replace function public.consume_plan_quota(
  p_user_id uuid, p_reservation_id uuid, p_actual_units bigint default 1
)
returns text language plpgsql security definer set search_path = '' as $$
declare v_reservation public.quota_reservations%rowtype; v_usage_date date;
begin
  if p_actual_units < 0 then
    raise exception using errcode = '22023', message = 'actual quota units cannot be negative';
  end if;
  select r.* into v_reservation from public.quota_reservations r
   where r.id = p_reservation_id and r.user_id = p_user_id;
  if not found then return 'not_found'; end if;
  perform 1 from public.quota_buckets b where b.user_id = p_user_id
   and b.metric = v_reservation.metric and b.period_start = v_reservation.period_start for update;
  if not found then raise exception using errcode = '23503', message = 'quota bucket is missing'; end if;
  select r.* into v_reservation from public.quota_reservations r
   where r.id = p_reservation_id and r.user_id = p_user_id for update;
  if v_reservation.status <> 'reserved' then return v_reservation.status::text; end if;
  if p_actual_units > v_reservation.reserved_units then
    raise exception using errcode = '22023', message = 'actual quota units exceed reservation';
  end if;
  v_usage_date := timezone('UTC', v_reservation.created_at)::date;
  insert into public.quota_daily_buckets (user_id, metric, usage_date)
  values (p_user_id, v_reservation.metric, v_usage_date) on conflict do nothing;
  perform 1 from public.quota_daily_buckets b where b.user_id = p_user_id
   and b.metric = v_reservation.metric and b.usage_date = v_usage_date for update;
  update public.quota_buckets b set
    reserved_units = greatest(0, b.reserved_units - v_reservation.reserved_units),
    used_units = b.used_units + p_actual_units, updated_at = now()
   where b.user_id = p_user_id and b.metric = v_reservation.metric
     and b.period_start = v_reservation.period_start;
  update public.quota_daily_buckets b set used_units = b.used_units + p_actual_units,
    updated_at = now() where b.user_id = p_user_id and b.metric = v_reservation.metric
    and b.usage_date = v_usage_date;
  update public.quota_reservations r set status = 'consumed', actual_units = p_actual_units,
    updated_at = now() where r.id = p_reservation_id;
  return 'consumed';
end;
$$;

drop function public.get_user_usage_summary(uuid);
create or replace function public.get_user_usage_summary(p_user_id uuid)
returns table (
  plan_key text, plan_name text, metric public.quota_metric, monthly_limit bigint,
  used_units bigint, reserved_units bigint, remaining_units bigint,
  period_start date, period_end date, daily_limit bigint, daily_used_units bigint,
  daily_reserved_units bigint, daily_remaining_units bigint, usage_date date
)
language sql stable security definer set search_path = '' as $$
  with subject as (
    select u.plan_key from public.users u
     where u.id = p_user_id and u.status = 'active' and u.alpha_access_status = 'active'
  ), periods as (
    select date_trunc('month', timezone('UTC', now()))::date as period_start,
           timezone('UTC', now())::date as usage_date
  )
  select p.plan_key, p.display_name, e.metric, e.monthly_limit,
    coalesce(m.used_units, 0), coalesce(m.reserved_units, 0),
    greatest(0, e.monthly_limit - coalesce(m.used_units, 0) - coalesce(m.reserved_units, 0)),
    periods.period_start, (periods.period_start + interval '1 month')::date,
    e.daily_limit, coalesce(d.used_units, 0),
    coalesce((select sum(r.reserved_units) from public.quota_reservations r
      where r.user_id = p_user_id and r.metric = e.metric and r.status = 'reserved'
       and timezone('UTC', r.created_at)::date = periods.usage_date), 0)::bigint,
    greatest(0, e.daily_limit - coalesce(d.used_units, 0) - coalesce((select sum(r.reserved_units)
      from public.quota_reservations r where r.user_id = p_user_id and r.metric = e.metric
       and r.status = 'reserved' and timezone('UTC', r.created_at)::date = periods.usage_date), 0)),
    periods.usage_date
   from subject join public.plans p on p.plan_key = subject.plan_key
   join public.plan_entitlements e on e.plan_key = p.plan_key cross join periods
   left join public.quota_buckets m on m.user_id = p_user_id and m.metric = e.metric
    and m.period_start = periods.period_start
   left join public.quota_daily_buckets d on d.user_id = p_user_id and d.metric = e.metric
    and d.usage_date = periods.usage_date
   where p.is_active order by e.metric;
$$;

alter table public.closed_alpha_invites enable row level security;
alter table public.closed_alpha_invite_redemptions enable row level security;
alter table public.quota_daily_buckets enable row level security;
revoke all on table public.closed_alpha_invites from anon, authenticated;
revoke all on table public.closed_alpha_invite_redemptions from anon, authenticated;
revoke all on table public.quota_daily_buckets from anon, authenticated;
revoke all on table public.closed_alpha_invites, public.closed_alpha_invite_redemptions,
  public.quota_daily_buckets from public, service_role;

revoke all on function public.ensure_telegram_user(bigint, bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.get_closed_alpha_access(uuid) from public, anon, authenticated;
revoke all on function public.redeem_closed_alpha_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.create_closed_alpha_invite(text, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.set_closed_alpha_access(bigint, public.closed_alpha_access_status)
  from public, anon, authenticated;
revoke all on function public.revoke_closed_alpha_invite(text)
  from public, anon, authenticated;
revoke all on function public.reserve_plan_quota(uuid, public.quota_metric, text, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_plan_quota(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.get_user_usage_summary(uuid) from public, anon, authenticated;

grant execute on function public.get_closed_alpha_access(uuid) to service_role;
grant execute on function public.ensure_telegram_user(bigint, bigint, text, text) to service_role;
grant execute on function public.redeem_closed_alpha_invite(uuid, text) to service_role;
grant execute on function public.create_closed_alpha_invite(text, integer, timestamptz) to service_role;
grant execute on function public.set_closed_alpha_access(bigint, public.closed_alpha_access_status)
  to service_role;
grant execute on function public.revoke_closed_alpha_invite(text) to service_role;
grant execute on function public.reserve_plan_quota(uuid, public.quota_metric, text, bigint, uuid)
  to service_role;
grant execute on function public.consume_plan_quota(uuid, uuid, bigint) to service_role;
grant execute on function public.get_user_usage_summary(uuid) to service_role;
