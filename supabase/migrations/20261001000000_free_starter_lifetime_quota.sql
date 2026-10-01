-- Free Starter lifetime quota and failure refunds.
--
-- Free Starter plan has a lifetime quota of 30 operations (with 5/day for note generation),
-- while Pro and Alpha retain monthly quotas.

alter table public.plans
  add column quota_cycle text not null default 'monthly'
  check (quota_cycle in ('monthly', 'lifetime'));

update public.plans
   set quota_cycle = 'lifetime',
       updated_at = now()
 where plan_key = 'free';

update public.plan_entitlements
   set monthly_limit = 30,
       daily_limit = 5,
       updated_at = now()
 where plan_key = 'free' and metric = 'note_generation';

update public.plan_entitlements
   set monthly_limit = 30,
       daily_limit = 30,
       updated_at = now()
 where plan_key = 'free' and metric = 'regeneration';

update public.plan_entitlements
   set monthly_limit = 30,
       daily_limit = 30,
       updated_at = now()
 where plan_key = 'free' and metric = 'semantic_answer';

-- Consolidate and migrate any existing quota buckets for free plan users to lifetime epoch
insert into public.quota_buckets (user_id, metric, period_start, used_units, reserved_units, updated_at)
select
  qb.user_id,
  qb.metric,
  '1970-01-01'::date as period_start,
  coalesce(sum(qb.used_units), 0)::bigint as used_units,
  coalesce(sum(qb.reserved_units), 0)::bigint as reserved_units,
  now() as updated_at
from public.quota_buckets qb
join public.users u on u.id = qb.user_id
where u.plan_key = 'free'
  and qb.period_start <> '1970-01-01'::date
group by qb.user_id, qb.metric
on conflict (user_id, metric, period_start) do update set
  used_units = public.quota_buckets.used_units + excluded.used_units,
  reserved_units = public.quota_buckets.reserved_units + excluded.reserved_units,
  updated_at = now();

delete from public.quota_buckets
 where period_start <> '1970-01-01'::date
   and user_id in (select id from public.users where plan_key = 'free');

update public.quota_reservations
   set period_start = '1970-01-01'::date,
       updated_at = now()
 where period_start <> '1970-01-01'::date
   and user_id in (select id from public.users where plan_key = 'free');

-- Replace reserve_plan_quota to branch on quota_cycle:
-- When lifetime, period_start = '1970-01-01' and period_end = '2099-12-31'.
drop function if exists public.reserve_plan_quota(uuid, public.quota_metric, text, bigint, uuid);
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
  period_end date,
  daily_limit bigint,
  daily_used_units bigint,
  daily_reserved_units bigint,
  usage_date date
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plan_key text;
  v_monthly_limit bigint;
  v_daily_limit bigint;
  v_quota_cycle text;
  v_period_start date;
  v_period_end date;
  v_usage_date date := timezone('UTC', now())::date;
  v_used bigint;
  v_reserved bigint;
  v_daily_used bigint;
  v_daily_reserved bigint;
  v_reclaimed bigint;
  v_existing public.quota_reservations%rowtype;
  v_reservation_id uuid;
begin
  if p_units <= 0 or length(btrim(p_reservation_key)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid quota reservation arguments';
  end if;

  select u.plan_key into v_plan_key from public.users u
   where u.id = p_user_id and u.status = 'active' and u.alpha_access_status = 'active';
  if not found then
    return query select
      'user_not_active'::text,
      null::uuid,
      null::text,
      p_metric,
      null::bigint,
      0::bigint,
      0::bigint,
      date_trunc('month', timezone('UTC', now()))::date,
      (date_trunc('month', timezone('UTC', now()))::date + interval '1 month')::date,
      null::bigint,
      0::bigint,
      0::bigint,
      v_usage_date;
    return;
  end if;

  select e.monthly_limit, e.daily_limit, p.quota_cycle
    into v_monthly_limit, v_daily_limit, v_quota_cycle
    from public.plan_entitlements e
    join public.plans p on p.plan_key = e.plan_key
   where e.plan_key = v_plan_key and e.metric = p_metric and p.is_active;
  if not found then
    return query select
      'plan_not_configured'::text,
      null::uuid,
      v_plan_key,
      p_metric,
      null::bigint,
      0::bigint,
      0::bigint,
      date_trunc('month', timezone('UTC', now()))::date,
      (date_trunc('month', timezone('UTC', now()))::date + interval '1 month')::date,
      null::bigint,
      0::bigint,
      0::bigint,
      v_usage_date;
    return;
  end if;

  if v_quota_cycle = 'lifetime' then
    v_period_start := '1970-01-01'::date;
    v_period_end := '2099-12-31'::date;
  else
    v_period_start := date_trunc('month', timezone('UTC', now()))::date;
    v_period_end := (v_period_start + interval '1 month')::date;
  end if;

  insert into public.quota_buckets (user_id, metric, period_start)
  values (p_user_id, p_metric, v_period_start)
  on conflict do nothing;

  select b.used_units, b.reserved_units
    into v_used, v_reserved
    from public.quota_buckets b
   where b.user_id = p_user_id
     and b.metric = p_metric
     and b.period_start = v_period_start
   for update;

  with released as (
    update public.quota_reservations r
       set status = 'released', updated_at = now()
     where r.user_id = p_user_id
       and r.metric = p_metric
       and r.period_start = v_period_start
       and r.status = 'reserved'
       and r.expires_at <= now()
     returning r.reserved_units
  )
  select coalesce(sum(released.reserved_units), 0)::bigint
    into v_reclaimed
    from released;

  if v_reclaimed > 0 then
    v_reserved := greatest(0, v_reserved - v_reclaimed);
    update public.quota_buckets b
       set reserved_units = v_reserved, updated_at = now()
     where b.user_id = p_user_id
       and b.metric = p_metric
       and b.period_start = v_period_start;
  end if;

  insert into public.quota_daily_buckets (user_id, metric, usage_date)
  values (p_user_id, p_metric, v_usage_date)
  on conflict do nothing;

  select b.used_units
    into v_daily_used
    from public.quota_daily_buckets b
   where b.user_id = p_user_id
     and b.metric = p_metric
     and b.usage_date = v_usage_date
   for update;

  select coalesce(sum(r.reserved_units), 0)::bigint
    into v_daily_reserved
    from public.quota_reservations r
   where r.user_id = p_user_id
     and r.metric = p_metric
     and r.status = 'reserved'
     and timezone('UTC', r.created_at)::date = v_usage_date;

  select r.* into v_existing
    from public.quota_reservations r
   where r.user_id = p_user_id
     and r.metric = p_metric
     and r.reservation_key = p_reservation_key;

  if found then
    return query select
      ('existing_' || v_existing.status::text),
      v_existing.id,
      v_plan_key,
      p_metric,
      v_monthly_limit,
      v_used,
      v_reserved,
      v_period_start,
      v_period_end,
      v_daily_limit,
      v_daily_used,
      v_daily_reserved,
      v_usage_date;
    return;
  end if;

  if v_daily_used + v_daily_reserved + p_units > v_daily_limit then
    return query select
      'daily_exceeded'::text,
      null::uuid,
      v_plan_key,
      p_metric,
      v_monthly_limit,
      v_used,
      v_reserved,
      v_period_start,
      v_period_end,
      v_daily_limit,
      v_daily_used,
      v_daily_reserved,
      v_usage_date;
    return;
  end if;

  if v_used + v_reserved + p_units > v_monthly_limit then
    return query select
      'exceeded'::text,
      null::uuid,
      v_plan_key,
      p_metric,
      v_monthly_limit,
      v_used,
      v_reserved,
      v_period_start,
      v_period_end,
      v_daily_limit,
      v_daily_used,
      v_daily_reserved,
      v_usage_date;
    return;
  end if;

  insert into public.quota_reservations
    (user_id, job_id, metric, reservation_key, period_start, reserved_units)
  values
    (p_user_id, p_job_id, p_metric, p_reservation_key, v_period_start, p_units)
  returning id into v_reservation_id;

  v_reserved := v_reserved + p_units;
  update public.quota_buckets b
     set reserved_units = v_reserved, updated_at = now()
   where b.user_id = p_user_id
     and b.metric = p_metric
     and b.period_start = v_period_start;

  return query select
    'reserved'::text,
    v_reservation_id,
    v_plan_key,
    p_metric,
    v_monthly_limit,
    v_used,
    v_reserved,
    v_period_start,
    v_period_end,
    v_daily_limit,
    v_daily_used,
    v_daily_reserved + p_units,
    v_usage_date;
end;
$$;

revoke all on function public.reserve_plan_quota(
  uuid, public.quota_metric, text, bigint, uuid
) from public, anon, authenticated;

grant execute on function public.reserve_plan_quota(
  uuid, public.quota_metric, text, bigint, uuid
) to service_role;

-- Replace get_user_usage_summary to branch on quota_cycle:
drop function if exists public.get_user_usage_summary(uuid);
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
  period_end date,
  daily_limit bigint,
  daily_used_units bigint,
  daily_reserved_units bigint,
  daily_remaining_units bigint,
  usage_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  with subject as (
    select u.plan_key from public.users u
     where u.id = p_user_id and u.status = 'active' and u.alpha_access_status = 'active'
  ), periods as (
    select
      timezone('UTC', now())::date as usage_date,
      date_trunc('month', timezone('UTC', now()))::date as month_start
  )
  select
    p.plan_key,
    p.display_name,
    e.metric,
    e.monthly_limit,
    coalesce(m.used_units, 0),
    coalesce(m.reserved_units, 0),
    greatest(0, e.monthly_limit - coalesce(m.used_units, 0) - coalesce(m.reserved_units, 0)),
    case when p.quota_cycle = 'lifetime' then '1970-01-01'::date else periods.month_start end as period_start,
    case when p.quota_cycle = 'lifetime' then '2099-12-31'::date else (periods.month_start + interval '1 month')::date end as period_end,
    e.daily_limit,
    coalesce(d.used_units, 0),
    coalesce((
      select sum(r.reserved_units) from public.quota_reservations r
       where r.user_id = p_user_id and r.metric = e.metric and r.status = 'reserved'
         and timezone('UTC', r.created_at)::date = periods.usage_date
    ), 0)::bigint as daily_reserved_units,
    greatest(0, e.daily_limit - coalesce(d.used_units, 0) - coalesce((
      select sum(r.reserved_units) from public.quota_reservations r
       where r.user_id = p_user_id and r.metric = e.metric and r.status = 'reserved'
         and timezone('UTC', r.created_at)::date = periods.usage_date
    ), 0)) as daily_remaining_units,
    periods.usage_date
   from subject
   join public.plans p on p.plan_key = subject.plan_key
   join public.plan_entitlements e on e.plan_key = p.plan_key
   cross join periods
   left join public.quota_buckets m on m.user_id = p_user_id and m.metric = e.metric
    and m.period_start = (case when p.quota_cycle = 'lifetime' then '1970-01-01'::date else periods.month_start end)
   left join public.quota_daily_buckets d on d.user_id = p_user_id and d.metric = e.metric
    and d.usage_date = periods.usage_date
   where p.is_active
   order by e.metric;
$$;

revoke all on function public.get_user_usage_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_user_usage_summary(uuid) to service_role;

-- Replace web_get_usage_summary to branch on quota_cycle:
drop function if exists public.web_get_usage_summary();
create or replace function public.web_get_usage_summary()
returns table (
  plan_key text,
  plan_display_name text,
  period_start timestamptz,
  period_end timestamptz,
  metric text,
  display_name text,
  used bigint,
  monthly_limit bigint,
  reserved bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_plan_key text;
  v_plan_display text;
  v_quota_cycle text;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  select u.plan_key into v_plan_key
    from public.users as u
   where u.id = v_user_id;

  select p.display_name, p.quota_cycle
    into v_plan_display, v_quota_cycle
    from public.plans as p
   where p.plan_key = v_plan_key;

  if v_quota_cycle = 'lifetime' then
    v_period_start := '1970-01-01'::date;
    v_period_end := '2099-12-31'::date;
  else
    v_period_start := date_trunc('month', now() at time zone 'UTC');
    v_period_end := v_period_start + interval '1 month';
  end if;

  return query
    select
      v_plan_key as plan_key,
      coalesce(v_plan_display, v_plan_key) as plan_display_name,
      v_period_start as period_start,
      v_period_end as period_end,
      pe.metric::text as metric,
      case pe.metric::text
        when 'note_generation' then 'Note Generation'
        when 'new_note' then 'Note Generation'
        when 'regeneration' then 'Regenerations'
        when 'semantic_answer' then 'Ask Notes'
        else pe.metric::text
      end as display_name,
      coalesce(qb.used_units, 0)::bigint as used,
      pe.monthly_limit::bigint as monthly_limit,
      coalesce(qb.reserved_units, 0)::bigint as reserved
    from public.plan_entitlements as pe
    left join public.quota_buckets as qb
      on qb.user_id = v_user_id
     and qb.metric = pe.metric
     and qb.period_start = v_period_start::date
    where pe.plan_key = v_plan_key;
end;
$$;

revoke all on function public.web_get_usage_summary() from public, anon, authenticated;
grant execute on function public.web_get_usage_summary() to service_role, authenticated;
