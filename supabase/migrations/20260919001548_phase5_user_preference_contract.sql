-- Phase 5 / user preference contract.
--
-- Preferences are resolved and snapshotted when a Telegram update is accepted.
-- A later settings change therefore affects future jobs only. The database also
-- enforces minimal retention when a note is staged, so application code cannot
-- accidentally persist source text for a minimal-mode job.

alter table public.processing_jobs
  add column output_language text not null default 'mirror',
  add column privacy_mode public.privacy_mode not null default 'balanced';

alter table public.processing_jobs
  add constraint processing_jobs_output_language_format check (
    output_language = 'mirror'
    or output_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  );

comment on column public.processing_jobs.output_language is
  'Snapshot of the user output-language preference when the update was accepted.';
comment on column public.processing_jobs.privacy_mode is
  'Snapshot of the user privacy preference when the update was accepted.';

-- Cover preference/template foreign keys so a template update or deletion does
-- not scan the growing user/job tables.
create index user_preferences_default_text_template_idx
  on public.user_preferences (default_text_template)
  where default_text_template is not null;
create index user_preferences_default_voice_template_idx
  on public.user_preferences (default_voice_template)
  where default_voice_template is not null;
create index user_preferences_default_document_template_idx
  on public.user_preferences (default_document_template)
  where default_document_template is not null;
create index processing_jobs_template_key_idx
  on public.processing_jobs (template_key);

insert into public.user_preferences (user_id)
select u.id
  from public.users as u
on conflict (user_id) do nothing;

-- New Telegram users always receive their one-to-one preference row.
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
    telegram_user_id, telegram_chat_id, telegram_username, display_name
  ) values (
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
    where u.telegram_chat_id is distinct from excluded.telegram_chat_id
       or u.telegram_username is distinct from excluded.telegram_username
       or u.display_name is distinct from excluded.display_name
  returning u.id into v_user_id;

  if v_user_id is null then
    select u.id into v_user_id
      from public.users as u
     where u.telegram_user_id = p_telegram_user_id;
  end if;

  insert into public.user_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return v_user_id;
end;
$$;

-- The Telegram command layer reads and updates preferences only through these
-- owner-scoped RPCs. They remain inaccessible to browser roles.
create or replace function public.get_user_preferences(p_user_id uuid)
returns table (
  output_language text,
  default_text_template text,
  default_voice_template text,
  default_document_template text,
  privacy_mode public.privacy_mode
)
language sql
security definer
set search_path = ''
as $$
  select p.output_language,
         p.default_text_template,
         p.default_voice_template,
         p.default_document_template,
         p.privacy_mode
    from public.user_preferences as p
    join public.users as u on u.id = p.user_id
   where p.user_id = p_user_id
     and u.status = 'active';
$$;

create or replace function public.update_user_preference(
  p_user_id uuid,
  p_setting text,
  p_value text
)
returns table (
  output_language text,
  default_text_template text,
  default_voice_template text,
  default_document_template text,
  privacy_mode public.privacy_mode
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_key text;
begin
  if not exists (
    select 1 from public.users as u
     where u.id = p_user_id and u.status = 'active'
  ) then
    return;
  end if;

  if p_setting = 'language' then
    if p_value not in ('mirror', 'id', 'en') then
      raise exception using errcode = '22023', message = 'unsupported output language';
    end if;
    update public.user_preferences as p
       set output_language = p_value
     where p.user_id = p_user_id;
  elsif p_setting = 'privacy' then
    if p_value not in ('balanced', 'minimal') then
      raise exception using errcode = '22023', message = 'unsupported privacy mode';
    end if;
    update public.user_preferences as p
       set privacy_mode = p_value::public.privacy_mode
     where p.user_id = p_user_id;
  elsif p_setting in ('text_template', 'voice_template', 'document_template') then
    v_template_key := nullif(p_value, 'default');
    if v_template_key is not null and not exists (
      select 1
        from public.templates as t
       where t.key = v_template_key
         and t.status = 'active'
         and (t.owner_user_id is null or t.owner_user_id = p_user_id)
    ) then
      raise exception using errcode = '22023', message = 'template is not available';
    end if;

    update public.user_preferences as p
       set default_text_template = case
             when p_setting = 'text_template' then v_template_key
             else p.default_text_template
           end,
           default_voice_template = case
             when p_setting = 'voice_template' then v_template_key
             else p.default_voice_template
           end,
           default_document_template = case
             when p_setting = 'document_template' then v_template_key
             else p.default_document_template
           end
     where p.user_id = p_user_id;
  else
    raise exception using errcode = '22023', message = 'unsupported preference setting';
  end if;

  return query
  select p.output_language,
         p.default_text_template,
         p.default_voice_template,
         p.default_document_template,
         p.privacy_mode
    from public.user_preferences as p
   where p.user_id = p_user_id;
end;
$$;

-- V2 resolves all preferences in the same transaction that claims the update
-- and publishes its opaque job id. p_template_key remains the deterministic
-- routing fallback for users who have not selected an override.
create or replace function public.accept_and_enqueue_telegram_update_v2(
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
  queue_message_id bigint,
  template_key text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status public.user_status;
  v_inserted boolean;
  v_job_id uuid;
  v_job_state public.job_state;
  v_queue_message_id bigint;
  v_template_key text;
  v_output_language text;
  v_privacy_mode public.privacy_mode;
begin
  select u.status into v_status
    from public.users as u
   where u.id = p_user_id;

  if v_status is null or v_status <> 'active' then
    return query select p_update_id, p_user_id, null::uuid, 'user_not_active'::text,
      null::public.job_state, p_chat_id, p_message_id, null::bigint, null::text;
    return;
  end if;

  insert into public.telegram_updates (update_id, user_id, update_type, payload_digest)
  values (p_update_id, p_user_id, p_update_type, p_payload_digest)
  on conflict (update_id) do nothing;
  v_inserted := found;

  if not v_inserted then
    return query
    select p_update_id,
           coalesce(tu.user_id, p_user_id),
           tu.processing_job_id,
           'duplicate'::text,
           job.state,
           coalesce(job.chat_id, p_chat_id),
           coalesce(job.message_id, p_message_id),
           job.queue_message_id,
           job.template_key
      from (select 1) as singleton
      left join public.telegram_updates as tu on tu.update_id = p_update_id
      left join public.processing_jobs as job on job.id = tu.processing_job_id;
    return;
  end if;

  select coalesce(
           case
             when p_input_type = 'text' then prefs.default_text_template
             when p_input_type in ('voice', 'audio') then prefs.default_voice_template
             else prefs.default_document_template
           end,
           p_template_key
         ),
         prefs.output_language,
         prefs.privacy_mode
    into v_template_key, v_output_language, v_privacy_mode
    from public.user_preferences as prefs
   where prefs.user_id = p_user_id;

  v_template_key := coalesce(v_template_key, p_template_key);
  v_output_language := coalesce(v_output_language, 'mirror');
  v_privacy_mode := coalesce(v_privacy_mode, 'balanced'::public.privacy_mode);

  insert into public.processing_jobs (
    user_id, update_id, chat_id, message_id, input_type, template_key,
    output_language, privacy_mode, source_text, telegram_file_id,
    telegram_file_unique_id, original_filename, mime_type, size_bytes,
    duration_seconds, state
  ) values (
    p_user_id, p_update_id, p_chat_id, p_message_id, p_input_type, v_template_key,
    v_output_language, v_privacy_mode, p_source_text, p_telegram_file_id,
    p_telegram_file_unique_id, p_original_filename, p_mime_type, p_size_bytes,
    p_duration_seconds, 'QUEUED'::public.job_state
  ) returning id, state into v_job_id, v_job_state;

  update public.telegram_updates as tu
     set processing_job_id = v_job_id
   where tu.update_id = p_update_id;

  select pgmq.send('notinn_jobs', jsonb_build_object('job_id', v_job_id))
    into v_queue_message_id;

  update public.processing_jobs as job
     set queue_message_id = v_queue_message_id
   where job.id = v_job_id;

  return query select p_update_id, p_user_id, v_job_id, 'accepted'::text,
    v_job_state, p_chat_id, p_message_id, v_queue_message_id, v_template_key;
end;
$$;

-- Include immutable preference snapshots in every claim result.
drop function public.claim_processing_job(uuid, integer);

create or replace function public.claim_processing_job(
  p_job_id uuid,
  p_max_attempts integer default 3
)
returns table (
  outcome text, job_id uuid, user_id uuid, chat_id bigint, status_message_id bigint,
  input_type public.input_type, telegram_file_id text, source_text text, mime_type text,
  size_bytes bigint, duration_seconds integer, template_key text, output_language text,
  privacy_mode public.privacy_mode, job_state public.job_state, attempt_count integer,
  note_id uuid, queue_message_id bigint
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
  v_queue_message_id bigint;
  v_retry_delay_seconds integer;
begin
  select job.state, job.attempt_count, job.next_attempt_at, job.queue_message_id
    into v_state, v_attempt_count, v_next_attempt_at, v_queue_message_id
    from public.processing_jobs as job
   where job.id = p_job_id
   for update;

  if not found then
    return query select 'not_found'::text, p_job_id, null::uuid, null::bigint,
      null::bigint, null::public.input_type, null::text, null::text, null::text,
      null::bigint, null::integer, null::text, null::text, null::public.privacy_mode,
      null::public.job_state, null::integer, null::uuid, null::bigint;
    return;
  end if;

  if v_state in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED') then
    return query
    select 'terminal'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
           job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
           job.duration_seconds, job.template_key, job.output_language, job.privacy_mode,
           job.state, job.attempt_count, job.note_id, job.queue_message_id
      from public.processing_jobs as job where job.id = p_job_id;
    return;
  end if;

  if v_state = 'RETRYABLE_FAILED' then
    if v_attempt_count >= greatest(1, p_max_attempts) then
      update public.processing_jobs as job
         set state = 'FAILED', completed_at = now(), next_attempt_at = null,
             telegram_file_id = null, telegram_file_unique_id = null,
             source_text = null, original_filename = null
       where job.id = p_job_id;
      return query
      select 'exhausted'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
             job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
             job.duration_seconds, job.template_key, job.output_language, job.privacy_mode,
             job.state, job.attempt_count, job.note_id, job.queue_message_id
        from public.processing_jobs as job where job.id = p_job_id;
      return;
    end if;

    if v_next_attempt_at is not null and v_next_attempt_at > now() then
      v_retry_delay_seconds := greatest(
        1, ceil(extract(epoch from (v_next_attempt_at - now())))::integer
      );
      if v_queue_message_id is not null then
        perform pgmq.set_vt('notinn_jobs', v_queue_message_id, v_retry_delay_seconds);
      end if;
      return query
      select 'retry_wait'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
             job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
             job.duration_seconds, job.template_key, job.output_language, job.privacy_mode,
             job.state, job.attempt_count, job.note_id, job.queue_message_id
        from public.processing_jobs as job where job.id = p_job_id;
      return;
    end if;

    update public.processing_jobs as job
       set state = 'QUEUED', next_attempt_at = null
     where job.id = p_job_id;
    v_state := 'QUEUED';
  end if;

  if v_state <> 'QUEUED' then
    return query
    select 'busy'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
           job.input_type, null::text, null::text, job.mime_type, job.size_bytes,
           job.duration_seconds, job.template_key, job.output_language, job.privacy_mode,
           job.state, job.attempt_count, job.note_id, job.queue_message_id
      from public.processing_jobs as job where job.id = p_job_id;
    return;
  end if;

  update public.processing_jobs as job
     set state = 'ACQUIRING', started_at = coalesce(job.started_at, now()),
         last_error_code = null, last_error_detail = null
   where job.id = p_job_id;

  return query
  select 'claimed'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
         job.input_type, job.telegram_file_id, job.source_text, job.mime_type,
         job.size_bytes, job.duration_seconds, job.template_key, job.output_language,
         job.privacy_mode, job.state, job.attempt_count, job.note_id, job.queue_message_id
    from public.processing_jobs as job where job.id = p_job_id;
end;
$$;

-- Retention is enforced from the immutable job snapshot, not from a mutable
-- current preference and not from an application-supplied privacy flag.
create or replace function public.stage_note_for_delivery(
  p_user_id uuid, p_job_id uuid, p_title text, p_language text,
  p_source_type public.input_type, p_normalized_source_text text,
  p_source_text_sha256 text, p_template_key text, p_schema_version integer,
  p_content_json jsonb, p_rendered_text text, p_provider text, p_model text,
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
  v_privacy_mode public.privacy_mode;
  v_note_id uuid;
  v_output_id uuid;
begin
  select job.note_id, job.state, job.privacy_mode
    into v_job_note_id, v_job_state, v_privacy_mode
    from public.processing_jobs as job
   where job.id = p_job_id and job.user_id = p_user_id
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_job_note_id is not null then
    select note.current_output_id into v_output_id
      from public.notes as note where note.id = v_job_note_id;
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
    case when v_privacy_mode = 'minimal' then null else p_normalized_source_text end,
    case when v_privacy_mode = 'minimal' then null else p_source_text_sha256 end
  ) returning id into v_note_id;

  insert into public.note_outputs (
    note_id, template_key, schema_version, content_json, rendered_text,
    provider, model, generation_reason
  ) values (
    v_note_id, p_template_key, p_schema_version, p_content_json, p_rendered_text,
    p_provider, p_model, p_generation_reason
  ) returning id into v_output_id;

  update public.notes as note set current_output_id = v_output_id where note.id = v_note_id;
  update public.processing_jobs as job set note_id = v_note_id where job.id = p_job_id;
  return query select 'created'::text, v_note_id, v_output_id;
end;
$$;

create or replace function public.complete_processing_job(p_user_id uuid, p_job_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.processing_jobs as job
     set state = 'COMPLETED', completed_at = now(), next_attempt_at = null,
         last_error_code = null, last_error_detail = null,
         telegram_file_id = null, telegram_file_unique_id = null,
         source_text = null, original_filename = null
   where job.id = p_job_id and job.user_id = p_user_id and job.state = 'DELIVERING'
  returning true;
$$;

create or replace function public.fail_processing_job(
  p_user_id uuid, p_job_id uuid, p_expected_state public.job_state,
  p_error_code text, p_error_detail text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_expected_state <> 'RETRYABLE_FAILED' then
    update public.processing_jobs as job
       set state = 'RETRYABLE_FAILED', attempt_count = job.attempt_count + 1,
           last_error_code = p_error_code, last_error_detail = p_error_detail
     where job.id = p_job_id and job.user_id = p_user_id and job.state = p_expected_state;
    if not found then return false; end if;
  end if;

  update public.processing_jobs as job
     set state = 'FAILED', completed_at = now(), next_attempt_at = null,
         telegram_file_id = null, telegram_file_unique_id = null,
         source_text = null, original_filename = null,
         last_error_code = p_error_code, last_error_detail = p_error_detail
   where job.id = p_job_id and job.user_id = p_user_id and job.state = 'RETRYABLE_FAILED';
  return found;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless explicitly
-- revoked. Only the server-side service role may access these RPCs.
revoke all on function public.ensure_telegram_user(bigint, bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.get_user_preferences(uuid)
  from public, anon, authenticated;
revoke all on function public.update_user_preference(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.accept_and_enqueue_telegram_update_v2(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text,
  text, text, text, bigint, integer
) from public, anon, authenticated;
revoke all on function public.claim_processing_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.stage_note_for_delivery(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb,
  text, text, text, public.generation_reason
) from public, anon, authenticated;
revoke all on function public.complete_processing_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_processing_job(uuid, uuid, public.job_state, text, text)
  from public, anon, authenticated;

grant execute on function public.ensure_telegram_user(bigint, bigint, text, text)
  to service_role;
grant execute on function public.get_user_preferences(uuid) to service_role;
grant execute on function public.update_user_preference(uuid, text, text) to service_role;
grant execute on function public.accept_and_enqueue_telegram_update_v2(
  bigint, text, uuid, bigint, bigint, public.input_type, text, text, text, text,
  text, text, text, bigint, integer
) to service_role;
grant execute on function public.claim_processing_job(uuid, integer) to service_role;
grant execute on function public.stage_note_for_delivery(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb,
  text, text, text, public.generation_reason
) to service_role;
grant execute on function public.complete_processing_job(uuid, uuid) to service_role;
grant execute on function public.fail_processing_job(uuid, uuid, public.job_state, text, text)
  to service_role;
