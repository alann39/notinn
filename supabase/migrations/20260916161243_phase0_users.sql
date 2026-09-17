-- Phase 0 / migration 2 of 9
-- public.users
--
-- One row per Telegram user. `id` is the immutable internal identity that every
-- piece of user-owned data is scoped by; `telegram_user_id` is only an external
-- identity mapping and may be re-pointed without rewriting a single ownership
-- column (blueprint 27, "Identity").

create table public.users (
  id uuid primary key default gen_random_uuid(),

  -- External identity mapping. Unique so that concurrent first messages from the
  -- same Telegram account cannot create two internal users.
  telegram_user_id bigint not null,
  telegram_chat_id bigint not null,

  -- Changeable metadata, never used as identity evidence (blueprint 8.1).
  telegram_username text,
  display_name text,

  status public.user_status not null default 'active',
  plan_key text not null default 'alpha',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint users_telegram_user_id_key unique (telegram_user_id),
  constraint users_telegram_user_id_positive check (telegram_user_id > 0),
  constraint users_telegram_chat_id_positive check (telegram_chat_id > 0),
  constraint users_plan_key_not_blank check (length(btrim(plan_key)) > 0),
  constraint users_telegram_username_length check (
    telegram_username is null or length(telegram_username) <= 64
  ),
  constraint users_display_name_length check (
    display_name is null or length(display_name) <= 128
  )
);

comment on table public.users is
  'Notinn user accounts (blueprint 13.2). Soft-deleted via status, never hard-deleted while usage history exists.';

comment on column public.users.telegram_user_id is
  'External Telegram mapping. Not an ownership key: all user-owned rows reference users.id instead.';

comment on column public.users.plan_key is
  'Plan entitlement key (alpha, free, pro). Defaults to alpha for the pre-launch validation stage (blueprint 20.3). Quota values live in configuration tables, not here.';

comment on column public.users.status is
  'blocked, deletion_pending and deleted users must not be given new processing jobs; enforced in public.accept_telegram_update().';

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Phase 0 has no authenticated client: Telegram traffic reaches the database only
-- through the service role from an Edge Function. RLS is therefore enabled with
-- no policies, and the default Supabase grants to anon/authenticated are revoked
-- explicitly, so the session is deny-by-default rather than deny-by-accident.
--
-- Phase 7 adds a users.auth_user_id mapping and real per-user policies. Until
-- then, no policy is safer than a policy that cannot yet be written correctly.
-- See docs/ADR/0005-access-model.md.

alter table public.users enable row level security;

revoke all on table public.users from anon, authenticated;
