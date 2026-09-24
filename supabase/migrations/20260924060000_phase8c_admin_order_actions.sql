-- Phase 8C: Admin Order Actions (Cancel, Expire) & Mobile Observability
-- Extends payment_orders status check constraint to include 'cancelled'.
-- Provides admin_resolve_payment_order RPC for operator order resolution.

-- --- 1. Update check constraint on payment_orders ---------------------------

alter table public.payment_orders
  drop constraint if exists payment_orders_status_check;

alter table public.payment_orders
  add constraint payment_orders_status_check
  check (status in ('pending', 'completed', 'expired', 'invalid', 'cancelled'));

-- --- 2. Update admin_get_transaction_stats ----------------------------------

create or replace function public.admin_get_transaction_stats()
returns table (
  total_revenue_idr bigint,
  completed_count bigint,
  problem_count bigint,
  active_pro_subscribers bigint
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
      coalesce((select sum(po.amount_idr)::bigint from public.payment_orders as po where po.status = 'completed'), 0::bigint),
      coalesce((select count(*)::bigint from public.payment_orders as po where po.status = 'completed'), 0::bigint),
      coalesce((select count(*)::bigint from public.payment_orders as po where po.status = 'invalid' or (po.status = 'pending' and po.expires_at < now())), 0::bigint),
      coalesce((select count(distinct ps.user_id)::bigint from public.plan_subscriptions as ps where ps.status = 'active' and ps.expires_at > now()), 0::bigint);
end;
$$;

revoke all on function public.admin_get_transaction_stats() from public, anon, authenticated;
grant execute on function public.admin_get_transaction_stats() to service_role, authenticated;

-- --- 3. Update admin_list_payment_orders to support cancelled filter --------

create or replace function public.admin_list_payment_orders(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  telegram_user_id bigint,
  display_name text,
  order_code text,
  target_plan text,
  amount_idr integer,
  is_early_bird boolean,
  status text,
  tiptap_payment_id text,
  tiptap_payload jsonb,
  expires_at timestamptz,
  created_at timestamptz,
  completed_at timestamptz
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
      po.id,
      po.user_id,
      u.telegram_user_id,
      u.display_name,
      po.order_code,
      po.target_plan,
      po.amount_idr,
      po.is_early_bird,
      po.status,
      po.tiptap_payment_id,
      po.tiptap_payload,
      po.expires_at,
      po.created_at,
      po.completed_at
    from public.payment_orders as po
    left join public.users as u on u.id = po.user_id
   where (
     p_status is null
     or p_status = ''
     or p_status = 'all'
     or (p_status = 'completed' and po.status = 'completed')
     or (p_status = 'pending' and po.status = 'pending' and po.expires_at >= now())
     or (p_status = 'invalid' and po.status = 'invalid')
     or (p_status = 'expired' and (po.status = 'expired' or (po.status = 'pending' and po.expires_at < now())))
     or (p_status = 'cancelled' and po.status = 'cancelled')
     or (p_status = 'problematic' and (po.status = 'invalid' or (po.status = 'pending' and po.expires_at < now())))
   )
   and (
     p_search is null
     or p_search = ''
     or po.order_code ilike '%' || p_search || '%'
     or po.tiptap_payment_id ilike '%' || p_search || '%'
     or u.telegram_user_id::text ilike '%' || p_search || '%'
     or po.user_id::text ilike '%' || p_search || '%'
     or coalesce(u.display_name, '') ilike '%' || p_search || '%'
   )
   order by
     case
       when po.status = 'invalid' then 1
       when po.status = 'pending' and po.expires_at < now() then 2
       when po.status = 'pending' then 3
       else 4
     end,
     po.created_at desc
   limit p_limit
   offset p_offset;
end;
$$;

revoke all on function public.admin_list_payment_orders(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_payment_orders(text, text, integer, integer) to service_role, authenticated;

-- --- 4. RPC: resolve payment order (cancel or expire) -----------------------

create or replace function public.admin_resolve_payment_order(
  p_order_id uuid,
  p_action text,
  p_notes text default null
)
returns table (
  order_id uuid,
  telegram_user_id bigint,
  order_code text,
  new_status text,
  notes text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_user record;
  v_new_status text;
  v_notes text;
  v_resolution jsonb;
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  if p_action not in ('cancel', 'expire') then
    raise exception 'Invalid action. Must be cancel or expire' using errcode = '22023';
  end if;

  select * into v_order
    from public.payment_orders as po
   where po.id = p_order_id
     for update;

  if v_order.id is null then
    raise exception 'Payment order not found' using errcode = 'P0002';
  end if;

  if v_order.status = 'completed' then
    raise exception 'Cannot cancel or expire an already completed order' using errcode = '22000';
  end if;

  v_new_status := case when p_action = 'cancel' then 'cancelled' else 'expired' end;
  v_notes := coalesce(p_notes, 'Order resolved by admin operator: ' || v_new_status);

  v_resolution := jsonb_build_object(
    'action', p_action,
    'status', v_new_status,
    'notes', v_notes,
    'resolved_at', now()
  );

  update public.payment_orders as po
     set status = v_new_status,
         tiptap_payload = jsonb_set(
           coalesce(po.tiptap_payload, '{}'::jsonb),
           '{admin_resolution}',
           v_resolution
         )
   where po.id = v_order.id;

  select * into v_user
    from public.users as u
   where u.id = v_order.user_id;

  return query
    select v_order.id, v_user.telegram_user_id, v_order.order_code, v_new_status, v_notes;
end;
$$;

revoke all on function public.admin_resolve_payment_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_payment_order(uuid, text, text) to service_role, authenticated;
