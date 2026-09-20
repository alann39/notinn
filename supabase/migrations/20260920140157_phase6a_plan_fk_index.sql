-- Phase 6A follow-up: cover the users.plan_key foreign key used by plan
-- assignment checks and parent-key updates/deletes.

create index users_plan_key_idx on public.users (plan_key);
