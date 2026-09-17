-- Phase 0 / migration 8 of 9
-- public.usage_events
--
-- One immutable row per metered provider operation (blueprint 8.6, 13.9). Usage
-- is metered in the database rather than read back from a provider dashboard,
-- because provider dashboards cannot answer "how much has *this user* used".
--
-- Immutability is enforced by trigger, not convention. The single permitted
-- mutation is PostgreSQL clearing job_id when the originating job row is removed;
-- every other update and every delete is rejected.

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),

  -- RESTRICT, not CASCADE: usage history is retained for billing and operations
  -- after a user is deleted (blueprint 11.3), so a user with usage history cannot
  -- be hard-deleted. Account deletion is a status change, not a row removal.
  user_id uuid not null references public.users (id) on delete restrict,

  -- Optional de-reference so that job cleanup never has to delete usage history.
  job_id uuid references public.processing_jobs (id) on delete set null,

  provider text not null,
  model text not null,
  operation public.usage_operation not null,

  input_tokens bigint,
  output_tokens bigint,
  audio_seconds integer,
  document_pages integer,
  storage_bytes bigint,

  -- Internal estimate only; never presented to users as a bill (blueprint 13.9).
  estimated_cost_usd numeric(12, 6),

  provider_request_id text,
  created_at timestamptz not null default now(),

  constraint usage_events_provider_not_blank check (length(btrim(provider)) > 0),
  constraint usage_events_model_not_blank check (length(btrim(model)) > 0),
  constraint usage_events_input_tokens_non_negative check (input_tokens is null or input_tokens >= 0),
  constraint usage_events_output_tokens_non_negative check (output_tokens is null or output_tokens >= 0),
  constraint usage_events_audio_seconds_non_negative check (
    audio_seconds is null or audio_seconds >= 0
  ),
  constraint usage_events_document_pages_non_negative check (
    document_pages is null or document_pages >= 0
  ),
  constraint usage_events_storage_bytes_non_negative check (
    storage_bytes is null or storage_bytes >= 0
  ),
  constraint usage_events_estimated_cost_non_negative check (
    estimated_cost_usd is null or estimated_cost_usd >= 0
  )
);

comment on table public.usage_events is
  'Immutable metered usage (blueprint 13.9). Contains no user content: counts, provider identifiers and an internal cost estimate only.';

comment on column public.usage_events.provider_request_id is
  'Provider-side request identifier used for troubleshooting. Never a credential.';

create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);
create index usage_events_job_id_idx on public.usage_events (job_id) where job_id is not null;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------

create or replace function public.protect_usage_event_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'check_violation',
      message = 'usage_events rows are immutable and cannot be deleted';
  end if;

  -- The only mutation PostgreSQL itself is permitted to make: clearing job_id
  -- when the originating job is removed. A re-pointed job_id is rejected, so a
  -- usage event can never be moved to a different job.
  if new.job_id is not null or new.job_id is distinct from old.job_id then
    raise exception using
      errcode = 'check_violation',
      message = format('usage_events row %s is immutable', old.id);
  end if;

  if (to_jsonb(new) - 'job_id') is distinct from (to_jsonb(old) - 'job_id') then
    raise exception using
      errcode = 'check_violation',
      message = format('usage_events row %s is immutable', old.id);
  end if;

  return new;
end;
$$;

comment on function public.protect_usage_event_immutability() is
  'Rejects every DELETE and every UPDATE of usage_events except PostgreSQL clearing job_id via the ON DELETE SET NULL foreign key.';

-- Revoked for the same reason as the other two trigger functions: it keeps the
-- grant to PUBLIC that PostgreSQL gives every new function, and this migration
-- set holds the deny-by-default posture uniformly rather than per function.
-- Firing the trigger does not check EXECUTE on the function.
revoke all on function public.protect_usage_event_immutability()
  from public, anon, authenticated;

create trigger usage_events_immutable
  before update or delete on public.usage_events
  for each row
  execute function public.protect_usage_event_immutability();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.usage_events enable row level security;

revoke all on table public.usage_events from anon, authenticated;
