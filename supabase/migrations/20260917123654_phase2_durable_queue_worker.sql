-- Phase 2 / durable queue and worker primitives (deployed migration version).
--
-- The queue message contains one opaque internal UUID and nothing else. In
-- particular it never contains Telegram's file_id, a filename, user content or
-- a token-bearing file URL. `accept_and_enqueue_telegram_update` calls the Phase
-- 0 ingestion function and publishes the message in the same database
-- transaction, so a committed job can never be lost between "accepted" and
-- "queued".

create extension if not exists pgmq cascade;

select pgmq.create('notinn_jobs');

alter table public.processing_jobs
  add column queue_message_id bigint;

comment on column public.processing_jobs.queue_message_id is
  'Internal pgmq message id. The queue payload itself contains only this job''s UUID.';

create unique index processing_jobs_queue_message_id_key
  on public.processing_jobs (queue_message_id)
  where queue_message_id is not null;

-- ---------------------------------------------------------------------------
-- Atomic ingestion and queue publication
-- ---------------------------------------------------------------------------

create or replace function public.accept_and_enqueue_telegram_update(
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
  message_id bigint,
  queue_message_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_result record;
  v_queue_message_id bigint;
begin
  select * into v_result
    from public.accept_telegram_update(
      p_update_id,
      p_update_type,
      p_user_id,
      p_chat_id,
      p_message_id,
      p_input_type,
      p_template_key,
      p_payload_digest,
      p_source_text,
      p_telegram_file_id,
      p_telegram_file_unique_id,
      p_original_filename,
      p_mime_type,
      p_size_bytes,
      p_duration_seconds
    );

  if v_result.outcome = 'accepted' then
    select pgmq.send(
      'notinn_jobs',
      jsonb_build_object('job_id', v_result.job_id)
    ) into v_queue_message_id;

    update public.processing_jobs as job
       set queue_message_id = v_queue_message_id
     where job.id = v_result.job_id;
  elsif v_result.job_id is not null then
    select job.queue_message_id into v_queue_message_id
      from public.processing_jobs as job
     where job.id = v_result.job_id;
  end if;

  return query select
    v_result.update_id,
    v_result.user_id,
    v_result.job_id,
    v_result.outcome,
    v_result.job_state,
    v_result.chat_id,
    v_result.message_id,
    v_queue_message_id;
end;
$$;

comment on function public.accept_and_enqueue_telegram_update(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text, text, text, text,
  bigint, integer
) is
  'Atomically ingests one Telegram update and publishes its opaque job id to the durable pgmq queue.';

-- ---------------------------------------------------------------------------
-- Queue access. pgmq is never exposed through the Data API directly.
-- ---------------------------------------------------------------------------

create or replace function public.read_processing_queue(
  p_visibility_seconds integer default 300,
  p_batch_size integer default 5
)
returns table (
  queue_message_id bigint,
  read_count integer,
  job_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select message.msg_id,
         message.read_ct,
         (message.message ->> 'job_id')::uuid
    from pgmq.read(
      'notinn_jobs',
      greatest(30, least(p_visibility_seconds, 900)),
      greatest(1, least(p_batch_size, 10))
    ) as message;
$$;

comment on function public.read_processing_queue(integer, integer) is
  'Reads a bounded batch with a visibility timeout. Returns only queue metadata and an internal job UUID.';

create or replace function public.delete_processing_queue_message(
  p_queue_message_id bigint
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete('notinn_jobs', p_queue_message_id);
$$;

comment on function public.delete_processing_queue_message(bigint) is
  'Acknowledges one completed, permanently failed or stale processing message.';

create or replace function public.find_processing_queue_message_id(
  p_job_id uuid
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select job.queue_message_id
    from public.processing_jobs as job
   where job.id = p_job_id;
$$;

comment on function public.find_processing_queue_message_id(uuid) is
  'Resolves the queue message for a direct internal worker invocation without exposing job content.';

-- ---------------------------------------------------------------------------
-- Worker claim and terminal updates
-- ---------------------------------------------------------------------------

create or replace function public.claim_processing_job(
  p_job_id uuid,
  p_max_attempts integer default 3
)
returns table (
  outcome text,
  job_id uuid,
  user_id uuid,
  chat_id bigint,
  status_message_id bigint,
  input_type public.input_type,
  telegram_file_id text,
  source_text text,
  mime_type text,
  size_bytes bigint,
  duration_seconds integer,
  template_key text,
  job_state public.job_state,
  attempt_count integer,
  note_id uuid,
  queue_message_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_state public.job_state;
  v_attempt_count integer;
  v_next_attempt_at timestamptz;
begin
  select job.state, job.attempt_count, job.next_attempt_at
    into v_state, v_attempt_count, v_next_attempt_at
    from public.processing_jobs as job
   where job.id = p_job_id
   for update;

  if not found then
    return query select
      'not_found'::text, p_job_id, null::uuid, null::bigint, null::bigint,
      null::public.input_type, null::text, null::text, null::text, null::bigint,
      null::integer, null::text, null::public.job_state, null::integer, null::uuid,
      null::bigint;
    return;
  end if;

  if v_state in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED') then
    return query
    select 'terminal'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
           job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
           job.duration_seconds, job.template_key, job.state, job.attempt_count,
           job.note_id, job.queue_message_id
      from public.processing_jobs as job
     where job.id = p_job_id;
    return;
  end if;

  if v_state = 'RETRYABLE_FAILED' then
    if v_attempt_count >= greatest(1, p_max_attempts) then
      update public.processing_jobs as job
         set state = 'FAILED',
             completed_at = now(),
             next_attempt_at = null,
             telegram_file_id = null
       where job.id = p_job_id;

      return query
      select 'exhausted'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
             job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
             job.duration_seconds, job.template_key, job.state, job.attempt_count,
             job.note_id, job.queue_message_id
        from public.processing_jobs as job
       where job.id = p_job_id;
      return;
    end if;

    if v_next_attempt_at is not null and v_next_attempt_at > now() then
      return query
      select 'retry_wait'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
             job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
             job.duration_seconds, job.template_key, job.state, job.attempt_count,
             job.note_id, job.queue_message_id
        from public.processing_jobs as job
       where job.id = p_job_id;
      return;
    end if;

    update public.processing_jobs as job
       set state = 'QUEUED',
           next_attempt_at = null
     where job.id = p_job_id;
    v_state := 'QUEUED';
  end if;

  if v_state <> 'QUEUED' then
    return query
    select 'busy'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
           job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
           job.duration_seconds, job.template_key, job.state, job.attempt_count,
           job.note_id, job.queue_message_id
      from public.processing_jobs as job
     where job.id = p_job_id;
    return;
  end if;

  update public.processing_jobs as job
     set state = 'ACQUIRING',
         started_at = coalesce(job.started_at, now()),
         last_error_code = null,
         last_error_detail = null
   where job.id = p_job_id;

  return query
  select 'claimed'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
         job.input_type, job.telegram_file_id, job.source_text, job.mime_type,
         job.size_bytes, job.duration_seconds, job.template_key, job.state,
         job.attempt_count, job.note_id, job.queue_message_id
    from public.processing_jobs as job
   where job.id = p_job_id;
end;
$$;

comment on function public.claim_processing_job(uuid, integer) is
  'Locks and claims one due queued job. Retryable jobs are re-queued atomically; exhausted jobs fail without exposing content.';

create or replace function public.set_processing_job_status_message(
  p_user_id uuid,
  p_job_id uuid,
  p_status_message_id bigint
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.processing_jobs as job
     set status_message_id = p_status_message_id
   where job.id = p_job_id
     and job.user_id = p_user_id
     and job.state not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED')
  returning true;
$$;

comment on function public.set_processing_job_status_message(uuid, uuid, bigint) is
  'Attaches the bot-owned status message used for worker progress edits to one owned active job.';

create or replace function public.complete_processing_job(
  p_user_id uuid,
  p_job_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.processing_jobs as job
     set state = 'COMPLETED',
         completed_at = now(),
         next_attempt_at = null,
         last_error_code = null,
         last_error_detail = null,
         telegram_file_id = null
   where job.id = p_job_id
     and job.user_id = p_user_id
     and job.state = 'DELIVERING'
  returning true;
$$;

comment on function public.complete_processing_job(uuid, uuid) is
  'Completes one owned DELIVERING job only after its persisted note has been delivered.';

create or replace function public.fail_processing_job(
  p_user_id uuid,
  p_job_id uuid,
  p_expected_state public.job_state,
  p_error_code text,
  p_error_detail text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_expected_state <> 'RETRYABLE_FAILED' then
    update public.processing_jobs as job
       set state = 'RETRYABLE_FAILED',
           attempt_count = job.attempt_count + 1,
           last_error_code = p_error_code,
           last_error_detail = p_error_detail
     where job.id = p_job_id
       and job.user_id = p_user_id
       and job.state = p_expected_state;

    if not found then
      return false;
    end if;
  end if;

  update public.processing_jobs as job
     set state = 'FAILED',
         completed_at = now(),
         next_attempt_at = null,
         telegram_file_id = null,
         last_error_code = p_error_code,
         last_error_detail = p_error_detail
   where job.id = p_job_id
     and job.user_id = p_user_id
     and job.state = 'RETRYABLE_FAILED';

  return found;
end;
$$;

comment on function public.fail_processing_job(uuid, uuid, public.job_state, text, text) is
  'Moves a permanently failed active job through RETRYABLE_FAILED to FAILED so every transition remains legal.';

-- ---------------------------------------------------------------------------
-- Delivery-safe persistence
-- ---------------------------------------------------------------------------

create or replace function public.stage_note_for_delivery(
  p_user_id uuid,
  p_job_id uuid,
  p_title text,
  p_language text,
  p_source_type public.input_type,
  p_normalized_source_text text,
  p_source_text_sha256 text,
  p_template_key text,
  p_schema_version integer,
  p_content_json jsonb,
  p_rendered_text text,
  p_provider text,
  p_model text,
  p_generation_reason public.generation_reason
)
returns table (outcome text, note_id uuid, output_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_job_note_id uuid;
  v_job_state public.job_state;
  v_note_id uuid;
  v_output_id uuid;
begin
  select job.note_id, job.state
    into v_job_note_id, v_job_state
    from public.processing_jobs as job
   where job.id = p_job_id
     and job.user_id = p_user_id
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_job_note_id is not null then
    select note.current_output_id into v_output_id
      from public.notes as note
     where note.id = v_job_note_id;
    return query select 'existing'::text, v_job_note_id, v_output_id;
    return;
  end if;

  if v_job_state <> 'DELIVERING' then
    return query select 'wrong_state'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.notes (
    user_id, source_job_id, title, source_type, language,
    normalized_source_text, source_text_sha256
  ) values (
    p_user_id, p_job_id, p_title, p_source_type, p_language,
    p_normalized_source_text, p_source_text_sha256
  ) returning id into v_note_id;

  insert into public.note_outputs (
    note_id, template_key, schema_version, content_json, rendered_text,
    provider, model, generation_reason
  ) values (
    v_note_id, p_template_key, p_schema_version, p_content_json, p_rendered_text,
    p_provider, p_model, p_generation_reason
  ) returning id into v_output_id;

  update public.notes as note
     set current_output_id = v_output_id
   where note.id = v_note_id;

  update public.processing_jobs as job
     set note_id = v_note_id
   where job.id = p_job_id;

  return query select 'created'::text, v_note_id, v_output_id;
end;
$$;

comment on function public.stage_note_for_delivery(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb, text, text, text,
  public.generation_reason
) is
  'Idempotently persists a note while leaving its job DELIVERING. Completion happens only after Telegram delivery succeeds.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.accept_and_enqueue_telegram_update(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text, text, text, text,
  bigint, integer
) from public, anon, authenticated;
revoke all on function public.read_processing_queue(integer, integer)
  from public, anon, authenticated;
revoke all on function public.delete_processing_queue_message(bigint)
  from public, anon, authenticated;
revoke all on function public.find_processing_queue_message_id(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_processing_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.set_processing_job_status_message(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.complete_processing_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_processing_job(uuid, uuid, public.job_state, text, text)
  from public, anon, authenticated;
revoke all on function public.stage_note_for_delivery(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb, text, text, text,
  public.generation_reason
) from public, anon, authenticated;

grant execute on function public.accept_and_enqueue_telegram_update(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text, text, text, text,
  bigint, integer
) to service_role;
grant execute on function public.read_processing_queue(integer, integer)
  to service_role;
grant execute on function public.delete_processing_queue_message(bigint)
  to service_role;
grant execute on function public.find_processing_queue_message_id(uuid)
  to service_role;
grant execute on function public.claim_processing_job(uuid, integer)
  to service_role;
grant execute on function public.set_processing_job_status_message(uuid, uuid, bigint)
  to service_role;
grant execute on function public.complete_processing_job(uuid, uuid)
  to service_role;
grant execute on function public.fail_processing_job(uuid, uuid, public.job_state, text, text)
  to service_role;
grant execute on function public.stage_note_for_delivery(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb, text, text, text,
  public.generation_reason
) to service_role;
