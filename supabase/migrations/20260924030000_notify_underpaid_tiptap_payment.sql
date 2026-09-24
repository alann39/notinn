-- Notify underpaid TipTap payment:
-- Ensure process_tiptap_payment returns v_user.telegram_user_id on amount_insufficient
-- so the webhook can send an explanatory notification to the user in Telegram.
-- Fully qualifies all column references with aliases to prevent ambiguity with return table columns.

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
    from public.payment_orders as po
   where upper(po.order_code) = upper(trim(p_order_code))
     and po.status = 'pending'
   for update;

  if not found then
    return query
      select 'order_not_found'::text, null::uuid, null::bigint, null::text, null::timestamptz, p_amount;
    return;
  end if;

  -- Fetch user early so telegram_user_id is available for all branches
  select * into v_user
    from public.users as u
   where u.id = v_order.user_id;

  -- Validate payment amount meets order requirement
  if p_amount < v_order.amount_idr then
    update public.payment_orders as po
       set status = 'invalid',
           tiptap_payment_id = p_tiptap_id,
           tiptap_payload = p_payload
     where po.id = v_order.id;

    return query
      select 'amount_insufficient'::text, v_order.user_id, v_user.telegram_user_id, null::text, null::timestamptz, p_amount;
    return;
  end if;

  -- Mark order as completed
  update public.payment_orders as po
     set status = 'completed',
         completed_at = now(),
         tiptap_payment_id = p_tiptap_id,
         tiptap_payload = p_payload
   where po.id = v_order.id;

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
    )
    values (
      v_order.user_id,
      'pro',
      now(),
      v_new_expires,
      'active',
      p_tiptap_id,
      p_amount
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
