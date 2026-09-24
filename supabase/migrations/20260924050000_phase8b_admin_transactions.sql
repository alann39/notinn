-- Phase 8B: Admin Transactions & Operator Payment Management
-- Provides RPCs for admin transaction observability, problem alerting, and manual reconciliation.

-- --- 1. RPC: get transaction stats ------------------------------------------

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

-- --- 2. RPC: list payment orders with user details & filters -----------------

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

-- --- 3. RPC: manually reconcile payment order --------------------------------

create or replace function public.admin_reconcile_payment_order(
  p_order_id uuid,
  p_notes text default null
)
returns table (
  order_id uuid,
  user_id uuid,
  new_status text,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_sub record;
  v_new_expires timestamptz;
  v_notes text;
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  select * into v_order
    from public.payment_orders as po
   where po.id = p_order_id
     for update;

  if v_order.id is null then
    raise exception 'Payment order not found' using errcode = 'P0002';
  end if;

  v_notes := coalesce(p_notes, 'Manual reconciliation by admin operator');

  -- Update order status to completed
  update public.payment_orders as po
     set status = 'completed',
         completed_at = coalesce(po.completed_at, now())
   where po.id = v_order.id;

  -- Upgrade user plan to pro
  perform public.change_user_plan(
    v_order.user_id,
    'pro',
    'operator',
    'Reconciled via Admin Console: ' || v_order.order_code || ' - ' || v_notes
  );

  -- Create or stack 30-day subscription
  select * into v_sub
    from public.plan_subscriptions as ps
   where ps.user_id = v_order.user_id
     and ps.status = 'active'
     and ps.expires_at > now()
   order by ps.expires_at desc
   limit 1;

  if v_sub.id is not null then
    v_new_expires := v_sub.expires_at + interval '30 days';
    update public.plan_subscriptions as ps
       set expires_at = v_new_expires,
           updated_at = now()
     where ps.id = v_sub.id;
  else
    v_new_expires := now() + interval '30 days';
    insert into public.plan_subscriptions (
      user_id,
      plan_key,
      starts_at,
      expires_at,
      status,
      tiptap_payment_id,
      amount_paid_idr
    ) values (
      v_order.user_id,
      'pro',
      now(),
      v_new_expires,
      'active',
      coalesce(v_order.tiptap_payment_id, 'manual_reconcile'),
      v_order.amount_idr
    );
  end if;

  return query
    select v_order.id, v_order.user_id, 'completed'::text, v_new_expires;
end;
$$;

revoke all on function public.admin_reconcile_payment_order(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_reconcile_payment_order(uuid, text) to service_role, authenticated;
