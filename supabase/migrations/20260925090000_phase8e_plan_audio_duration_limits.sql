-- Phase 8E: Plan audio duration limits.
-- Adds max_audio_duration_seconds to public.plans and RPC for user audio limit queries.

alter table public.plans
  add column max_audio_duration_seconds integer not null default 1800
  check (max_audio_duration_seconds > 0);

comment on column public.plans.max_audio_duration_seconds is
  'Maximum audio duration in seconds accepted for notes on this plan.';

update public.plans
   set max_audio_duration_seconds = 7200
 where plan_key in ('pro', 'alpha');

update public.plans
   set max_audio_duration_seconds = 1800
 where plan_key = 'free';

-- Service-role RPC to read user audio limit with plan resolution.
create or replace function public.get_user_audio_limit(p_user_id uuid)
returns table (
  plan_key text,
  max_audio_duration_seconds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.plan_key, p.max_audio_duration_seconds
    from public.users as u
    join public.plans as p on p.plan_key = u.plan_key
   where u.id = p_user_id;
$$;

revoke all on function public.get_user_audio_limit(uuid) from public, anon, authenticated;
grant execute on function public.get_user_audio_limit(uuid) to service_role;
