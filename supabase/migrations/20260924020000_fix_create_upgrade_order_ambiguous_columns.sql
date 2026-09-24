-- Fix ambiguous column reference in create_upgrade_order:
-- Table columns is_early_bird and order_code conflicted with return table parameters.

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

  -- Count total completed early bird orders (using explicit alias po to prevent ambiguity with return column)
  select count(*)::integer
    into v_completed_early_bird
    from public.payment_orders as po
   where po.is_early_bird = true
     and po.status = 'completed';

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
      select 1 from public.payment_orders as po where po.order_code = v_code
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
