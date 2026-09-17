-- Phase 0 / migration 9 of 9
-- Ingestion functions.
--
-- These two functions are the entire database surface the Telegram webhook is
-- allowed to touch. Putting them in the database rather than in the Edge Function
-- is deliberate:
--
--   * Duplicate suppression must be atomic. Checking "have I seen this update?"
--     in TypeScript and then inserting is two round trips with a race between
--     them. Here the check and the insert are one transaction, and the primary
--     key on telegram_updates.update_id is the actual guarantee.
--
--   * accept_telegram_update() creates the update ledger row and the processing
--     job together or not at all, which is what makes blueprint 10.1's
--     "insert update and job atomically" literally true.
--
-- Both are SECURITY DEFINER with an empty search_path, and EXECUTE is revoked
-- from PUBLIC, anon and authenticated. Only the server-side service role may call
-- them. See docs/ADR/0005-access-model.md.

-- ---------------------------------------------------------------------------
-- ensure_telegram_user
-- ---------------------------------------------------------------------------
--
-- Resolves a Telegram account to an internal user id, creating the user on first
-- contact (blueprint 8.1). Idempotent: concurrent first messages from the same
-- account converge on one row because telegram_user_id is UNIQUE.

create or replace function public.ensure_telegram_user(
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint,
  p_telegram_username text default null,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  insert into public.users as u (
    telegram_user_id,
    telegram_chat_id,
    telegram_username,
    display_name
  )
  values (
    p_telegram_user_id,
    p_telegram_chat_id,
    nullif(btrim(p_telegram_username), ''),
    nullif(btrim(p_display_name), '')
  )
  on conflict (telegram_user_id) do update
    set telegram_chat_id = excluded.telegram_chat_id,
        telegram_username = excluded.telegram_username,
        display_name = excluded.display_name,
        updated_at = now()
    -- Only touch the row when something actually changed, so that a chatty user
    -- does not generate one write per message.
    where u.telegram_chat_id is distinct from excluded.telegram_chat_id
       or u.telegram_username is distinct from excluded.telegram_username
       or u.display_name is distinct from excluded.display_name
  returning u.id into v_user_id;

  -- The WHERE clause above suppresses the update when nothing changed, and a
  -- suppressed ON CONFLICT UPDATE returns no row. Fall back to reading it.
  if v_user_id is null then
    select u.id into v_user_id
      from public.users u
     where u.telegram_user_id = p_telegram_user_id;
  end if;

  return v_user_id;
end;
$$;

comment on function public.ensure_telegram_user(bigint, bigint, text, text) is
  'Resolves a Telegram account to an internal user id, creating the user on first contact. Idempotent and safe under concurrent first messages.';

-- ---------------------------------------------------------------------------
-- accept_telegram_update
-- ---------------------------------------------------------------------------
--
-- Records an accepted private-chat update and, unless it is a replay, creates
-- exactly one processing job for it.
--
-- Returns outcome:
--   'accepted'        a new job was created
--   'duplicate'       this update_id was already recorded; nothing was created
--   'user_not_active' the user is blocked, deletion-pending or deleted

create or replace function public.accept_telegram_update(
  p_update_id bigint,
  p_update_type text,
  p_user_id uuid,
  p_chat_id bigint,
  p_message_id bigint,
  p_input_type public.input_type,
  p_template_key text,
  p_payload_digest text default null,
  p_source_text text default null,
  p_telegram_file_id text default null,
  p_telegram_file_unique_id text default null,
  p_original_filename text default null,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_duration_seconds integer default null
)
returns table (
  update_id bigint,
  user_id uuid,
  job_id uuid,
  outcome text,
  job_state public.job_state,
  chat_id bigint,
  message_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
-- The RETURNS TABLE column names (update_id, user_id, job_id, chat_id,
-- message_id) collide with columns of the same name in telegram_updates and
-- processing_jobs. Without this directive, `on conflict (update_id)` is rejected
-- as ambiguous. All local variables are v_-prefixed and all parameters are
-- p_-prefixed, so resolving ambiguity in favour of the column is always correct
-- here.
#variable_conflict use_column
declare
  v_status public.user_status;
  v_inserted boolean;
  v_user_id uuid;
  v_job_id uuid;
  v_job_state public.job_state;
  v_chat_id bigint;
  v_message_id bigint;
begin
  -- 1. The user must exist and be active. Blocked, deletion-pending and deleted
  --    accounts are refused before anything at all is written.
  select u.status into v_status
    from public.users u
   where u.id = p_user_id;

  if v_status is null or v_status <> 'active' then
    return query select
      p_update_id,
      p_user_id,
      null::uuid,
      'user_not_active'::text,
      null::public.job_state,
      p_chat_id,
      p_message_id;
    return;
  end if;

  -- 2. Claim the update. DO NOTHING does not wait on a concurrent transaction
  --    that has inserted the same update_id, which is why step 3 tolerates a
  --    mapping that is not yet visible.
  insert into public.telegram_updates (update_id, user_id, update_type, payload_digest)
  values (p_update_id, p_user_id, p_update_type, p_payload_digest)
  on conflict (update_id) do nothing;

  v_inserted := found;

  if not v_inserted then
    select tu.user_id, tu.processing_job_id, j.state, j.chat_id, j.message_id
      into v_user_id, v_job_id, v_job_state, v_chat_id, v_message_id
      from public.telegram_updates tu
      left join public.processing_jobs j on j.id = tu.processing_job_id
     where tu.update_id = p_update_id;

    if not found then
      -- A concurrent delivery of the same update_id owns the row and has not
      -- committed yet. The uniqueness constraints still guarantee that exactly
      -- one job is created; this caller simply reports that it created none.
      v_user_id := p_user_id;
      v_job_id := null;
      v_job_state := null;
      v_chat_id := p_chat_id;
      v_message_id := p_message_id;
    end if;

    return query select
      p_update_id, v_user_id, v_job_id, 'duplicate'::text, v_job_state, v_chat_id, v_message_id;
    return;
  end if;

  -- 3. Create the single job for this update. QUEUED is the durable-acceptance
  --    state: the job table is the queue in Phase 0.
  insert into public.processing_jobs (
    user_id,
    update_id,
    chat_id,
    message_id,
    input_type,
    template_key,
    source_text,
    telegram_file_id,
    telegram_file_unique_id,
    original_filename,
    mime_type,
    size_bytes,
    duration_seconds,
    state
  )
  values (
    p_user_id,
    p_update_id,
    p_chat_id,
    p_message_id,
    p_input_type,
    p_template_key,
    p_source_text,
    p_telegram_file_id,
    p_telegram_file_unique_id,
    p_original_filename,
    p_mime_type,
    p_size_bytes,
    p_duration_seconds,
    'QUEUED'::public.job_state
  )
  returning id, state into v_job_id, v_job_state;

  update public.telegram_updates tu
     set processing_job_id = v_job_id
   where tu.update_id = p_update_id;

  return query select
    p_update_id, p_user_id, v_job_id, 'accepted'::text, v_job_state, p_chat_id, p_message_id;
end;
$$;

comment on function public.accept_telegram_update(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text, text, text, text, bigint, integer
) is
  'Atomically records an accepted Telegram update and creates exactly one processing job for it. A replayed update_id returns outcome=duplicate and creates nothing.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and Supabase
-- additionally grants it to anon and authenticated. A SECURITY DEFINER function
-- that creates users and jobs must not be reachable by an unauthenticated caller,
-- so EXECUTE is revoked from all three and granted only to the server-side roles.

revoke all on function public.ensure_telegram_user(bigint, bigint, text, text)
  from public, anon, authenticated;

revoke all on function public.accept_telegram_update(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text, text, text, text, bigint, integer
) from public, anon, authenticated;

grant execute on function public.ensure_telegram_user(bigint, bigint, text, text)
  to service_role;

grant execute on function public.accept_telegram_update(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text, text, text, text, bigint, integer
) to service_role;
