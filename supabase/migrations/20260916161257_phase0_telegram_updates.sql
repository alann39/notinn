-- Phase 0 / migration 5 of 9
-- public.telegram_updates
--
-- The idempotency ledger for Telegram deliveries. `update_id` is Telegram's own
-- monotonically increasing identifier and is the primary key: this table, not an
-- application-level "have I seen this?" check, is what makes duplicate delivery
-- impossible (blueprint 15.3).
--
-- Only the minimum metadata required for identity, deduplication, routing, retry
-- and operations is stored. The full webhook payload is never persisted
-- (blueprint 18.4); payload_digest holds a SHA-256 of the raw request body so a
-- delivery can be correlated without retaining its contents.

create table public.telegram_updates (
  update_id bigint primary key,

  -- Resolved internal user. NULL if a user is ever hard-deleted; the dedup
  -- record itself must survive so a replay cannot reprocess the update.
  user_id uuid references public.users (id) on delete set null,

  update_type text not null,
  received_at timestamptz not null default now(),

  -- Foreign key is added in migration 6, once processing_jobs exists.
  processing_job_id uuid,

  payload_digest text,

  constraint telegram_updates_update_id_positive check (update_id > 0),
  constraint telegram_updates_update_type_format check (update_type ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint telegram_updates_payload_digest_format check (
    payload_digest is null or payload_digest ~ '^[0-9a-f]{64}$'
  )
);

comment on table public.telegram_updates is
  'One row per accepted Telegram update. Primary key on update_id is the deduplication guarantee required by blueprint 15.3.';

comment on column public.telegram_updates.payload_digest is
  'Lowercase SHA-256 hex of the raw webhook body. A one-way digest used to correlate deliveries; it is not a secret and not content.';

comment on column public.telegram_updates.processing_job_id is
  'The single job created for this update. NULL only for updates that were recorded but produced no job.';

create index telegram_updates_user_id_idx on public.telegram_updates (user_id)
  where user_id is not null;

create index telegram_updates_processing_job_id_idx on public.telegram_updates (processing_job_id)
  where processing_job_id is not null;

create index telegram_updates_received_at_idx on public.telegram_updates (received_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.telegram_updates enable row level security;

revoke all on table public.telegram_updates from anon, authenticated;
