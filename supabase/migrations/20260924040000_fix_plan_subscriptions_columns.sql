-- Add missing audit columns to plan_subscriptions:
-- process_tiptap_payment records tiptap_payment_id and amount_paid_idr upon subscription creation.

alter table public.plan_subscriptions
  add column if not exists tiptap_payment_id text,
  add column if not exists amount_paid_idr integer;
