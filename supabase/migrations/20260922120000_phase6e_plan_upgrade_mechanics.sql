-- Phase 6E: freemium upgrade mechanics.
-- Adds plan metadata for display, a plan-change audit log, and RPC
-- functions for operator plan management and plan catalogue queries.

-- --- Plan metadata columns --------------------------------------------------

alter table public.plans
  add column price_monthly_usd numeric(8,2),
  add column features jsonb not null default '[]'::jsonb,
  add column display_order integer not null default 0;

comment on column public.plans.price_monthly_usd is
  'Monthly price in USD. Null for free/internal plans.';
comment on column public.plans.features is
  'JSON array of feature strings shown to users during upgrade flow.';
comment on column public.plans.display_order is
  'Sort order for plan display (lower = shown first).';

-- Update existing plans with display metadata.
update public.plans set
  price_monthly_usd = null,
  features = '["50 new notes/month", "50 regenerations/month", "50 Ask Notes/month", "Full template library"]'::jsonb,
  display_order = 0
where plan_key = 'free';

update public.plans set
  price_monthly_usd = null,
  features = '[]'::jsonb,
  display_order = -1
where plan_key = 'alpha';

update public.plans set
  price_monthly_usd = 9.99,
  features = '["1,000 new notes/month", "300 regenerations/month", "300 Ask Notes/month", "Priority processing", "Extended file size limits"]'::jsonb,
  display_order = 1
where plan_key = 'pro';

-- --- Plan change audit log --------------------------------------------------

create table public.plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  from_plan text not null,
  to_plan text not null,
  changed_by text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint plan_changes_changed_by check (
    changed_by in ('operator', 'user_request', 'system')
  )
);

comment on table public.plan_changes is
  'Content-free audit log of plan transitions. Stores internal UUIDs and plan keys only — no note content.';

create index plan_changes_user_created_idx
  on public.plan_changes (user_id, created_at desc);

alter table public.plan_changes enable row level security;
revoke all on table public.plan_changes from anon, authenticated;
revoke all on table public.plan_changes from public, service_role;

-- --- RPC functions ----------------------------------------------------------

-- Change a user's plan with audit logging.
create or replace function public.change_user_plan(
  p_user_id uuid,
  p_new_plan text,
  p_changed_by text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_plan public.plans%rowtype;
  v_old_plan text;
begin
  select u.* into v_user
    from public.users as u
   where u.id = p_user_id
   for update;

  if not found then return 'not_found'; end if;

  if v_user.status in ('deleted') then return 'user_deleted'; end if;

  v_old_plan := v_user.plan_key;

  if v_old_plan = p_new_plan then return 'already_on_plan'; end if;

  select p.* into v_plan
    from public.plans as p
   where p.plan_key = p_new_plan;

  if not found then return 'plan_not_found'; end if;
  if not v_plan.is_active then return 'plan_inactive'; end if;

  update public.users
     set plan_key = p_new_plan,
         updated_at = now()
   where id = p_user_id;

  insert into public.plan_changes (user_id, from_plan, to_plan, changed_by, reason)
  values (p_user_id, v_old_plan, p_new_plan, p_changed_by, p_reason);

  return 'changed';
end;
$$;

revoke all on function public.change_user_plan(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.change_user_plan(uuid, text, text, text) to service_role;

-- Plan catalogue: active plans with features for display.
create or replace function public.get_plan_catalogue()
returns table (
  plan_key text,
  display_name text,
  price_monthly_usd numeric(8,2),
  features jsonb,
  display_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.plan_key, p.display_name, p.price_monthly_usd, p.features, p.display_order
    from public.plans as p
   where p.is_active = true
   order by p.display_order asc, p.plan_key asc;
$$;

revoke all on function public.get_plan_catalogue() from public, anon, authenticated;
grant execute on function public.get_plan_catalogue() to service_role;
