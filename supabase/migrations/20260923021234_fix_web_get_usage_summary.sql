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

  select p.display_name into v_plan_display
    from public.plans as p
   where p.plan_key = v_plan_key;

  v_period_start := date_trunc('month', now() at time zone 'UTC');
  v_period_end := v_period_start + interval '1 month';

  return query
    select
      v_plan_key as plan_key,
      coalesce(v_plan_display, v_plan_key) as plan_display_name,
      v_period_start as period_start,
      v_period_end as period_end,
      pe.metric::text as metric,
      case pe.metric::text
        when 'new_note' then 'New Notes'
        when 'regeneration' then 'Regenerations'
        when 'semantic_answer' then 'Ask Notes'
        else pe.metric::text
      end as display_name,
      coalesce(qb.used_units, 0)::bigint as used,
      pe.monthly_limit::bigint as monthly_limit,
      coalesce(
        (select count(*)
         from public.quota_reservations as qr
         where qr.user_id = v_user_id
           and qr.metric = pe.metric
           and qr.period_start = v_period_start::date
           and qr.consumed_at is null
           and qr.released_at is null
           and qr.created_at > now() - interval '20 minutes'),
        0
      )::bigint as reserved
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

