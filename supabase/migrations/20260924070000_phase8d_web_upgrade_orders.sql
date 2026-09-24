-- Phase 8d: Web Upgrade Orders
-- Exposes secure RPCs for authenticated web dashboard users to initiate and check upgrade orders.

-- --- 1. web_create_upgrade_order ----------------------------------------------
create or replace function public.web_create_upgrade_order()
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
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
    select * from public.create_upgrade_order(v_user_id);
end;
$$;

revoke all on function public.web_create_upgrade_order() from public, anon, authenticated;
grant execute on function public.web_create_upgrade_order() to service_role, authenticated;

-- --- 2. web_get_upgrade_order_status -----------------------------------------
create or replace function public.web_get_upgrade_order_status(
  p_order_code text
)
returns table (
  order_code text,
  status text,
  target_plan text,
  amount_idr integer,
  is_early_bird boolean,
  expires_at timestamptz,
  is_past_expiry boolean,
  user_current_plan text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_plan text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- Get current user plan
  select u.plan_key
    into v_user_plan
    from public.users as u
   where u.id = v_user_id;

  return query
    select
      po.order_code,
      po.status,
      po.target_plan,
      po.amount_idr,
      po.is_early_bird,
      po.expires_at,
      (po.status = 'expired' or (po.status = 'pending' and po.expires_at < now())),
      coalesce(v_user_plan, 'free')
    from public.payment_orders as po
   where po.user_id = v_user_id
     and po.order_code = p_order_code
   limit 1;
end;
$$;

revoke all on function public.web_get_upgrade_order_status(text) from public, anon, authenticated;
grant execute on function public.web_get_upgrade_order_status(text) to service_role, authenticated;
