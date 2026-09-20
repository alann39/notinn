-- Phase 6A: configurable plan entitlements and atomic monthly quota control.
--
-- Quota is enforced in logical, pre-provider units. Provider token/page/audio
-- details remain in immutable usage_events for cost analysis; these counters
-- answer the separate question "may this expensive operation start?".

create type public.quota_metric as enum (
  'note_generation',
  'regeneration',
  'semantic_answer'
);

create type public.quota_reservation_status as enum (
  'reserved',
  'consumed',
  'released'
);

create table public.plans (
  plan_key text primary key,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_key_format check (plan_key ~ '^[a-z][a-z0-9_]{0,31}$'),
  constraint plans_display_name_not_blank check (length(btrim(display_name)) between 1 and 80)
);

create table public.plan_entitlements (
  plan_key text not null references public.plans (plan_key) on delete restrict,
  metric public.quota_metric not null,
  monthly_limit bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_key, metric),
  constraint plan_entitlements_limit_positive check (monthly_limit > 0)
);

create table public.quota_buckets (
  user_id uuid not null references public.users (id) on delete restrict,
  metric public.quota_metric not null,
  period_start date not null,
  used_units bigint not null default 0,
  reserved_units bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, period_start),
  constraint quota_buckets_used_non_negative check (used_units >= 0),
  constraint quota_buckets_reserved_non_negative check (reserved_units >= 0),
  constraint quota_buckets_month_start check (
    period_start = date_trunc('month', period_start::timestamp)::date
  )
);

create table public.quota_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  job_id uuid references public.processing_jobs (id) on delete set null,
  metric public.quota_metric not null,
  reservation_key text not null,
  period_start date not null,
  reserved_units bigint not null,
  actual_units bigint,
  status public.quota_reservation_status not null default 'reserved',
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric, reservation_key),
  constraint quota_reservations_key_length check (
    length(btrim(reservation_key)) between 1 and 200
  ),
  constraint quota_reservations_reserved_positive check (reserved_units > 0),
  constraint quota_reservations_actual_non_negative check (
    actual_units is null or actual_units >= 0
  ),
  constraint quota_reservations_status_shape check (
    (status = 'reserved' and actual_units is null)
    or (status = 'consumed' and actual_units is not null)
    or (status = 'released' and actual_units is null)
  )
);

create index quota_reservations_job_id_idx
  on public.quota_reservations (job_id)
  where job_id is not null;

create index quota_reservations_expiry_idx
  on public.quota_reservations (user_id, metric, period_start, expires_at)
  where status = 'reserved';

comment on table public.plans is
  'Operator-managed plan catalogue. Entitlements change without an Edge Function deployment.';
comment on table public.plan_entitlements is
  'Monthly logical-operation limits used before expensive provider calls.';
comment on table public.quota_buckets is
  'Per-user monthly consumed and in-flight quota counters, updated only through quota RPCs.';
comment on table public.quota_reservations is
  'Idempotent short-lived quota reservations. Contains identifiers and counts, never note content.';

insert into public.plans (plan_key, display_name) values
  ('alpha', 'Closed Alpha'),
  ('free', 'Free'),
  ('pro', 'Pro');

alter table public.users
  add constraint users_plan_key_fkey
  foreign key (plan_key) references public.plans (plan_key) on delete restrict;

-- Approved Phase 6A launch allowances. They are deliberately data, not
-- application constants, and may be changed later without redeployment.
insert into public.plan_entitlements (plan_key, metric, monthly_limit) values
  ('alpha', 'note_generation', 500),
  ('alpha', 'regeneration', 200),
  ('alpha', 'semantic_answer', 200),
  ('free', 'note_generation', 50),
  ('free', 'regeneration', 50),
  ('free', 'semantic_answer', 50),
  ('pro', 'note_generation', 1000),
  ('pro', 'regeneration', 300),
  ('pro', 'semantic_answer', 300);

-- One short transaction owns the bucket row, reclaims stale reservations,
-- checks remaining capacity, and creates the reservation. Concurrent requests
-- for the same user/metric/month therefore cannot both spend the last unit.
create or replace function public.reserve_plan_quota(
  p_user_id uuid,
  p_metric public.quota_metric,
  p_reservation_key text,
  p_units bigint default 1,
  p_job_id uuid default null
)
returns table (
  outcome text,
  reservation_id uuid,
  plan_key text,
  metric public.quota_metric,
  monthly_limit bigint,
  used_units bigint,
  reserved_units bigint,
  period_start date,
  period_end date
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plan_key text;
  v_limit bigint;
  v_period_start date := date_trunc('month', timezone('UTC', now()))::date;
  v_period_end date;
  v_used bigint;
  v_reserved bigint;
  v_reclaimed bigint;
  v_existing public.quota_reservations%rowtype;
  v_reservation_id uuid;
begin
  if p_units <= 0 or length(btrim(p_reservation_key)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid quota reservation arguments';
  end if;

  select u.plan_key into v_plan_key
    from public.users as u
   where u.id = p_user_id and u.status = 'active';
  if not found then
    return query select 'user_not_active'::text, null::uuid, null::text, p_metric,
      null::bigint, 0::bigint, 0::bigint, v_period_start,
      (v_period_start + interval '1 month')::date;
    return;
  end if;

  select entitlement.monthly_limit into v_limit
    from public.plan_entitlements as entitlement
    join public.plans as plan on plan.plan_key = entitlement.plan_key
   where entitlement.plan_key = v_plan_key
     and entitlement.metric = p_metric
     and plan.is_active;
  if not found then
    return query select 'plan_not_configured'::text, null::uuid, v_plan_key, p_metric,
      null::bigint, 0::bigint, 0::bigint, v_period_start,
      (v_period_start + interval '1 month')::date;
    return;
  end if;

  v_period_end := (v_period_start + interval '1 month')::date;

  insert into public.quota_buckets (user_id, metric, period_start)
  values (p_user_id, p_metric, v_period_start)
  on conflict do nothing;

  select bucket.used_units, bucket.reserved_units
    into v_used, v_reserved
    from public.quota_buckets as bucket
   where bucket.user_id = p_user_id
     and bucket.metric = p_metric
     and bucket.period_start = v_period_start
   for update;

  with released as (
    update public.quota_reservations as reservation
       set status = 'released', updated_at = now()
     where reservation.user_id = p_user_id
       and reservation.metric = p_metric
       and reservation.period_start = v_period_start
       and reservation.status = 'reserved'
       and reservation.expires_at <= now()
    returning reservation.reserved_units
  )
  select coalesce(sum(released.reserved_units), 0)::bigint into v_reclaimed from released;

  if v_reclaimed > 0 then
    v_reserved := greatest(0, v_reserved - v_reclaimed);
    update public.quota_buckets as bucket
       set reserved_units = v_reserved, updated_at = now()
     where bucket.user_id = p_user_id
       and bucket.metric = p_metric
       and bucket.period_start = v_period_start;
  end if;

  select reservation.* into v_existing
    from public.quota_reservations as reservation
   where reservation.user_id = p_user_id
     and reservation.metric = p_metric
     and reservation.reservation_key = p_reservation_key;
  if found then
    return query select ('existing_' || v_existing.status::text), v_existing.id,
      v_plan_key, p_metric, v_limit, v_used, v_reserved, v_period_start, v_period_end;
    return;
  end if;

  if v_used + v_reserved + p_units > v_limit then
    return query select 'exceeded'::text, null::uuid, v_plan_key, p_metric,
      v_limit, v_used, v_reserved, v_period_start, v_period_end;
    return;
  end if;

  insert into public.quota_reservations (
    user_id, job_id, metric, reservation_key, period_start, reserved_units
  ) values (
    p_user_id, p_job_id, p_metric, p_reservation_key, v_period_start, p_units
  ) returning id into v_reservation_id;

  v_reserved := v_reserved + p_units;
  update public.quota_buckets as bucket
     set reserved_units = v_reserved, updated_at = now()
   where bucket.user_id = p_user_id
     and bucket.metric = p_metric
     and bucket.period_start = v_period_start;

  return query select 'reserved'::text, v_reservation_id, v_plan_key, p_metric,
    v_limit, v_used, v_reserved, v_period_start, v_period_end;
end;
$$;

create or replace function public.consume_plan_quota(
  p_user_id uuid,
  p_reservation_id uuid,
  p_actual_units bigint default 1
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.quota_reservations%rowtype;
begin
  if p_actual_units < 0 then
    raise exception using errcode = '22023', message = 'actual quota units cannot be negative';
  end if;

  select reservation.* into v_reservation
    from public.quota_reservations as reservation
   where reservation.id = p_reservation_id and reservation.user_id = p_user_id;
  if not found then return 'not_found'; end if;

  -- All quota writers lock bucket first and reservation second. Keeping one
  -- lock order prevents finalization racing stale-reservation reclamation into
  -- a deadlock.
  perform 1
    from public.quota_buckets as bucket
   where bucket.user_id = p_user_id
     and bucket.metric = v_reservation.metric
     and bucket.period_start = v_reservation.period_start
   for update;
  if not found then
    raise exception using errcode = '23503', message = 'quota bucket is missing';
  end if;

  select reservation.* into v_reservation
    from public.quota_reservations as reservation
   where reservation.id = p_reservation_id and reservation.user_id = p_user_id
   for update;
  if v_reservation.status <> 'reserved' then return v_reservation.status::text; end if;
  if p_actual_units > v_reservation.reserved_units then
    raise exception using errcode = '22023', message = 'actual quota units exceed reservation';
  end if;

  update public.quota_buckets as bucket
     set reserved_units = greatest(0, bucket.reserved_units - v_reservation.reserved_units),
         used_units = bucket.used_units + p_actual_units,
         updated_at = now()
   where bucket.user_id = p_user_id
     and bucket.metric = v_reservation.metric
     and bucket.period_start = v_reservation.period_start;
  if not found then
    raise exception using errcode = '23503', message = 'quota bucket is missing';
  end if;

  update public.quota_reservations as reservation
     set status = 'consumed', actual_units = p_actual_units, updated_at = now()
   where reservation.id = p_reservation_id;
  return 'consumed';
end;
$$;

create or replace function public.release_plan_quota(
  p_user_id uuid,
  p_reservation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.quota_reservations%rowtype;
begin
  select reservation.* into v_reservation
    from public.quota_reservations as reservation
   where reservation.id = p_reservation_id and reservation.user_id = p_user_id;
  if not found then return 'not_found'; end if;

  perform 1
    from public.quota_buckets as bucket
   where bucket.user_id = p_user_id
     and bucket.metric = v_reservation.metric
     and bucket.period_start = v_reservation.period_start
   for update;
  if not found then
    raise exception using errcode = '23503', message = 'quota bucket is missing';
  end if;

  select reservation.* into v_reservation
    from public.quota_reservations as reservation
   where reservation.id = p_reservation_id and reservation.user_id = p_user_id
   for update;
  if v_reservation.status <> 'reserved' then return v_reservation.status::text; end if;

  update public.quota_buckets as bucket
     set reserved_units = greatest(0, bucket.reserved_units - v_reservation.reserved_units),
         updated_at = now()
   where bucket.user_id = p_user_id
     and bucket.metric = v_reservation.metric
     and bucket.period_start = v_reservation.period_start;
  if not found then
    raise exception using errcode = '23503', message = 'quota bucket is missing';
  end if;

  update public.quota_reservations as reservation
     set status = 'released', updated_at = now()
   where reservation.id = p_reservation_id;
  return 'released';
end;
$$;

create or replace function public.get_user_usage_summary(p_user_id uuid)
returns table (
  plan_key text,
  plan_name text,
  metric public.quota_metric,
  monthly_limit bigint,
  used_units bigint,
  reserved_units bigint,
  remaining_units bigint,
  period_start date,
  period_end date
)
language sql
stable
security definer
set search_path = ''
as $$
  with subject as (
    select u.plan_key
      from public.users as u
     where u.id = p_user_id
  ), period as (
    select date_trunc('month', timezone('UTC', now()))::date as period_start
  )
  select plan.plan_key,
         plan.display_name,
         entitlement.metric,
         entitlement.monthly_limit,
         coalesce(bucket.used_units, 0),
         coalesce(bucket.reserved_units, 0),
         greatest(
           0,
           entitlement.monthly_limit - coalesce(bucket.used_units, 0) -
             coalesce(bucket.reserved_units, 0)
         ),
         period.period_start,
         (period.period_start + interval '1 month')::date
    from subject
    join public.plans as plan on plan.plan_key = subject.plan_key
    join public.plan_entitlements as entitlement on entitlement.plan_key = plan.plan_key
    cross join period
    left join public.quota_buckets as bucket
      on bucket.user_id = p_user_id
     and bucket.metric = entitlement.metric
     and bucket.period_start = period.period_start
   where plan.is_active
   order by entitlement.metric;
$$;

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.quota_buckets enable row level security;
alter table public.quota_reservations enable row level security;

revoke all on table public.plans from anon, authenticated;
revoke all on table public.plan_entitlements from anon, authenticated;
revoke all on table public.quota_buckets from anon, authenticated;
revoke all on table public.quota_reservations from anon, authenticated;
revoke all on table public.plans, public.plan_entitlements, public.quota_buckets,
  public.quota_reservations from public, service_role;

revoke all on function public.reserve_plan_quota(
  uuid, public.quota_metric, text, bigint, uuid
) from public, anon, authenticated;
revoke all on function public.consume_plan_quota(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.release_plan_quota(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_user_usage_summary(uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_plan_quota(
  uuid, public.quota_metric, text, bigint, uuid
) to service_role;
grant execute on function public.consume_plan_quota(uuid, uuid, bigint) to service_role;
grant execute on function public.release_plan_quota(uuid, uuid) to service_role;
grant execute on function public.get_user_usage_summary(uuid) to service_role;
