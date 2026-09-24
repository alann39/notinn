-- Phase 8: TipTap Payment Integration & Pro Plan Subscriptions
-- Supports automated plan upgrades via TipTap webhooks with 30-day subscriptions and stacking.

-- --- 1. Payment Orders Table --------------------------------------------------

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  order_code text unique not null,
  target_plan text not null default 'pro' check (target_plan in ('pro')),
  amount_idr integer not null check (amount_idr > 0),
  is_early_bird boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'invalid')),
  tiptap_payment_id text,
  tiptap_payload jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.payment_orders is
  'Tracks payment orders for plan upgrades initiated via Telegram/Web, matched against TipTap webhooks.';

create index if not exists payment_orders_user_status_idx
  on public.payment_orders (user_id, status);

create index if not exists payment_orders_order_code_idx
  on public.payment_orders (order_code);

alter table public.payment_orders enable row level security;
revoke all on table public.payment_orders from public, anon, authenticated;
grant select, insert, update on table public.payment_orders to service_role;

-- --- 2. Plan Subscriptions Table ----------------------------------------------

create table if not exists public.plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  plan_key text not null default 'pro',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plan_subscriptions is
  'Time-bounded plan subscriptions (e.g. 30-day Pro plan access), supporting extension and expiry.';

create index if not exists plan_subscriptions_user_status_idx
  on public.plan_subscriptions (user_id, status);

create index if not exists plan_subscriptions_active_expires_idx
  on public.plan_subscriptions (expires_at)
  where status = 'active';

alter table public.plan_subscriptions enable row level security;
revoke all on table public.plan_subscriptions from public, anon, authenticated;
grant select, insert, update on table public.plan_subscriptions to service_role;

-- --- 3. RPC: Create Upgrade Order --------------------------------------------

create or replace function public.create_upgrade_order(
  p_user_id uuid
)
returns table (
  order_code text,
  amount_idr integer,
  is_early_bird boolean,
  early_bird_remaining integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_code text;
  v_existing_amount integer;
  v_existing_early_bird boolean;
  v_existing_expires timestamptz;
  v_completed_early_bird integer;
  v_is_early_bird boolean;
  v_amount integer;
  v_code text;
  v_attempts integer := 0;
begin
  -- Check for existing active pending order for this user (within 24h)
  select o.order_code, o.amount_idr, o.is_early_bird, o.expires_at
    into v_existing_code, v_existing_amount, v_existing_early_bird, v_existing_expires
    from public.payment_orders as o
   where o.user_id = p_user_id
     and o.status = 'pending'
     and o.expires_at > now()
   order by o.created_at desc
   limit 1;

  -- Count total completed early bird orders
  select count(*)::integer
    into v_completed_early_bird
    from public.payment_orders
   where is_early_bird = true
     and status = 'completed';

  if v_existing_code is not null then
    return query
      select
        v_existing_code,
        v_existing_amount,
        v_existing_early_bird,
        greatest(0, 100 - v_completed_early_bird),
        v_existing_expires;
    return;
  end if;

  -- Determine pricing tier based on early bird quota (100 users)
  if v_completed_early_bird < 100 then
    v_is_early_bird := true;
    v_amount := 10000;
  else
    v_is_early_bird := false;
    v_amount := 20000;
  end if;

  -- Generate unique short alphanumeric reference code (NOTINN-XXXX)
  loop
    v_attempts := v_attempts + 1;
    v_code := 'NOTINN-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

    exit when not exists (
      select 1 from public.payment_orders where order_code = v_code
    ) or v_attempts > 10;
  end loop;

  insert into public.payment_orders (
    user_id,
    order_code,
    target_plan,
    amount_idr,
    is_early_bird,
    status,
    expires_at
  )
  values (
    p_user_id,
    v_code,
    'pro',
    v_amount,
    v_is_early_bird,
    'pending',
    now() + interval '24 hours'
  )
  returning payment_orders.expires_at into v_existing_expires;

  return query
    select
      v_code,
      v_amount,
      v_is_early_bird,
      greatest(0, 100 - v_completed_early_bird),
      v_existing_expires;
end;
$$;

revoke all on function public.create_upgrade_order(uuid) from public, anon, authenticated;
grant execute on function public.create_upgrade_order(uuid) to service_role;

-- --- 4. RPC: Process TipTap Payment ------------------------------------------

create or replace function public.process_tiptap_payment(
  p_order_code text,
  p_amount integer,
  p_tiptap_id text default null,
  p_payload jsonb default null
)
returns table (
  outcome text,
  user_id uuid,
  telegram_user_id bigint,
  new_plan text,
  subscription_expires_at timestamptz,
  amount_paid integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.payment_orders%rowtype;
  v_user public.users%rowtype;
  v_sub public.plan_subscriptions%rowtype;
  v_new_expires timestamptz;
  v_plan_result text;
begin
  -- Find pending order matching the reference code (case-insensitive)
  select * into v_order
    from public.payment_orders
   where upper(order_code) = upper(trim(p_order_code))
     and status = 'pending'
   for update;

  if not found then
    return query
      select 'order_not_found'::text, null::uuid, null::bigint, null::text, null::timestamptz, p_amount;
    return;
  end if;

  -- Validate payment amount meets order requirement
  if p_amount < v_order.amount_idr then
    update public.payment_orders
       set status = 'invalid',
           tiptap_payment_id = p_tiptap_id,
           tiptap_payload = p_payload
     where id = v_order.id;

    return query
      select 'amount_insufficient'::text, v_order.user_id, null::bigint, null::text, null::timestamptz, p_amount;
    return;
  end if;

  -- Fetch user to get telegram_user_id
  select * into v_user
    from public.users
   where id = v_order.user_id;

  -- Mark order as completed
  update public.payment_orders
     set status = 'completed',
         completed_at = now(),
         tiptap_payment_id = p_tiptap_id,
         tiptap_payload = p_payload
   where id = v_order.id;

  -- Upgrade user plan to 'pro' using standard change_user_plan function
  v_plan_result := public.change_user_plan(
    v_order.user_id,
    'pro',
    'system',
    'TipTap payment confirmed: ' || v_order.order_code
  );

  -- Subscription calculation with stacking:
  -- If active subscription exists and not expired, add 30 days to existing expires_at.
  -- Otherwise, set starts_at = now() and expires_at = now() + 30 days.
  select * into v_sub
    from public.plan_subscriptions
   where user_id = v_order.user_id
     and status = 'active'
     and expires_at > now()
   order by expires_at desc
   limit 1;

  if found then
    v_new_expires := v_sub.expires_at + interval '30 days';
    update public.plan_subscriptions
       set expires_at = v_new_expires,
           updated_at = now()
     where id = v_sub.id;
  else
    v_new_expires := now() + interval '30 days';
    insert into public.plan_subscriptions (
      user_id,
      plan_key,
      starts_at,
      expires_at,
      status
    )
    values (
      v_order.user_id,
      'pro',
      now(),
      v_new_expires,
      'active'
    );
  end if;

  return query
    select
      'success'::text,
      v_order.user_id,
      v_user.telegram_user_id,
      'pro'::text,
      v_new_expires,
      p_amount;
end;
$$;

revoke all on function public.process_tiptap_payment(text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.process_tiptap_payment(text, integer, text, jsonb) to service_role;

-- --- 5. RPC: Get User Subscription Status -------------------------------------

create or replace function public.get_user_subscription(
  p_user_id uuid
)
returns table (
  plan_key text,
  starts_at timestamptz,
  expires_at timestamptz,
  status text,
  days_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select
      s.plan_key,
      s.starts_at,
      s.expires_at,
      s.status,
      greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400)::integer) as days_remaining
    from public.plan_subscriptions as s
   where s.user_id = p_user_id
     and s.status = 'active'
     and s.expires_at > now()
   order by s.expires_at desc
   limit 1;
end;
$$;

revoke all on function public.get_user_subscription(uuid) from public, anon, authenticated;
grant execute on function public.get_user_subscription(uuid) to service_role;

-- --- 6. Function: Process Expired Subscriptions (Downgrade to Free) -----------

create or replace function public.process_expired_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
  v_count integer := 0;
begin
  for v_record in
    select s.id, s.user_id
      from public.plan_subscriptions as s
     where s.status = 'active'
       and s.expires_at <= now()
  loop
    update public.plan_subscriptions
       set status = 'expired',
           updated_at = now()
     where id = v_record.id;

    perform public.change_user_plan(
      v_record.user_id,
      'free',
      'system',
      'Pro plan subscription period expired'
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.process_expired_subscriptions() from public, anon, authenticated;
grant execute on function public.process_expired_subscriptions() to service_role;
