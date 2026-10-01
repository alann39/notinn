-- Phase 8I: Multimodal ingestion (audio, image, pdf, direct text) for web clients.
-- 1. Updates storage.buckets 'audio_uploads' to allow images and documents.
-- 2. Relaxes public.processing_jobs_source_required to permit direct text submissions (source_text is not null).
-- 3. Exposes public.web_submit_job RPC supporting multimodal input.
-- 4. Updates public.web_submit_audio_job to delegate to public.web_submit_job.

-- Update audio_uploads bucket allowed MIME types to include images and documents
update storage.buckets
   set allowed_mime_types = array[
     'audio/ogg',
     'audio/opus',
     'audio/mpeg',
     'audio/mp3',
     'audio/m4a',
     'audio/x-m4a',
     'audio/wav',
     'audio/x-wav',
     'audio/aac',
     'audio/webm',
     'audio/flac',
     'image/jpeg',
     'image/png',
     'image/webp',
     'image/heic',
     'application/pdf',
     'text/plain',
     'text/markdown',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   ]
 where id = 'audio_uploads';

-- Relax processing_jobs source constraint to permit direct text web jobs
alter table public.processing_jobs drop constraint if exists processing_jobs_source_required;

alter table public.processing_jobs
  add constraint processing_jobs_source_required
  check (update_id is not null or storage_path is not null or source_text is not null);

-- Web RPC: public.web_submit_job
create or replace function public.web_submit_job(
  p_input_type text default 'audio',
  p_storage_path text default null,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_duration_seconds integer default null,
  p_source_text text default null,
  p_template_key text default null
)
returns table (
  job_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_status text;
  v_plan_key text;
  v_chat_id bigint;
  v_max_duration integer;
  v_default_voice_template text;
  v_default_text_template text;
  v_default_doc_template text;
  v_output_language text;
  v_privacy_mode public.privacy_mode;
  v_template_key text;
  v_job_id uuid;
  v_queue_message_id bigint;
  v_input_type public.input_type;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select u.plan_key, u.status, u.telegram_chat_id, p.max_audio_duration_seconds
    into v_plan_key, v_status, v_chat_id, v_max_duration
    from public.users as u
    join public.plans as p on p.plan_key = u.plan_key
   where u.id = v_user_id;

  if v_status is null or v_status in ('deleted', 'blocked') then
    raise exception 'User is not active' using errcode = '42501';
  end if;

  -- Validate and cast input type
  if p_input_type is null or p_input_type not in ('audio', 'voice', 'pdf', 'image', 'text') then
    raise exception 'Invalid input type' using errcode = '22023';
  end if;

  v_input_type := p_input_type::public.input_type;

  -- Get user preferences snapshot
  select up.output_language,
         up.privacy_mode,
         up.default_voice_template,
         up.default_text_template,
         up.default_document_template
    into v_output_language,
         v_privacy_mode,
         v_default_voice_template,
         v_default_text_template,
         v_default_doc_template
    from public.user_preferences as up
   where up.user_id = v_user_id;

  v_output_language := coalesce(v_output_language, 'mirror');
  v_privacy_mode := coalesce(v_privacy_mode, 'balanced'::public.privacy_mode);

  -- Modality specific validations
  if v_input_type = 'text'::public.input_type then
    if p_source_text is null or length(btrim(p_source_text)) = 0 then
      raise exception 'Text content cannot be empty' using errcode = '22023';
    end if;

    if length(p_source_text) > 50000 then
      raise exception 'Text exceeds maximum length of 50,000 characters' using errcode = '22023';
    end if;

    v_template_key := coalesce(p_template_key, v_default_text_template, 'clean_note');
  elsif v_input_type in ('audio'::public.input_type, 'voice'::public.input_type) then
    if p_storage_path is null then
      raise exception 'Missing storage path' using errcode = '22023';
    end if;

    if (storage.foldername(p_storage_path))[1] is distinct from auth.uid()::text then
      raise exception 'Invalid storage path' using errcode = '42501';
    end if;

    -- 100 MiB hard limit (104,857,600 bytes)
    if p_size_bytes is not null and p_size_bytes > 104857600 then
      raise exception 'File size exceeds maximum allowed upload size (100MB)' using errcode = '22023';
    end if;

    -- Free plan size limit (14 MiB = 14,680,064 bytes)
    if v_plan_key = 'free' and p_size_bytes is not null and p_size_bytes > 14680064 then
      raise exception 'Audio files over 14MB require a Pro plan' using errcode = '22023';
    end if;

    -- Duration limit check if duration is provided
    if p_duration_seconds is not null and p_duration_seconds > v_max_duration then
      raise exception 'Audio duration exceeds plan limit' using errcode = '22023';
    end if;

    v_template_key := coalesce(p_template_key, v_default_voice_template, 'clean_note');
  elsif v_input_type in ('pdf'::public.input_type, 'image'::public.input_type) then
    if p_storage_path is null then
      raise exception 'Missing storage path' using errcode = '22023';
    end if;

    if (storage.foldername(p_storage_path))[1] is distinct from auth.uid()::text then
      raise exception 'Invalid storage path' using errcode = '42501';
    end if;

    -- 14 MiB limit (14,680,064 bytes) for document and image uploads
    if p_size_bytes is not null and p_size_bytes > 14680064 then
      raise exception 'File size exceeds maximum allowed upload size (14MB)' using errcode = '22023';
    end if;

    v_template_key := coalesce(p_template_key, v_default_doc_template, 'extract_and_summarize');
  end if;

  -- Validate template key against active system or owned templates applicable for this input type
  if not exists (
    select 1
      from public.templates as t
     where t.key = v_template_key
       and t.status = 'active'
       and (t.owner_user_id is null or t.owner_user_id = v_user_id)
       and v_input_type = any(t.applicable_input_types)
  ) then
    raise exception 'Invalid template key' using errcode = '22023';
  end if;

  insert into public.processing_jobs (
    user_id,
    chat_id,
    input_type,
    storage_path,
    source_text,
    mime_type,
    size_bytes,
    duration_seconds,
    template_key,
    output_language,
    privacy_mode,
    state
  ) values (
    v_user_id,
    v_chat_id,
    v_input_type,
    p_storage_path,
    p_source_text,
    p_mime_type,
    p_size_bytes,
    p_duration_seconds,
    v_template_key,
    v_output_language,
    v_privacy_mode,
    'QUEUED'::public.job_state
  )
  returning id into v_job_id;

  select pgmq.send('notinn_jobs', jsonb_build_object('job_id', v_job_id))
    into v_queue_message_id;

  update public.processing_jobs as job
     set queue_message_id = v_queue_message_id
   where job.id = v_job_id;

  return query select v_job_id, 'QUEUED'::text;
end;
$$;

comment on function public.web_submit_job(text, text, text, bigint, integer, text, text) is
  'Web RPC to enqueue a multimodal processing job (audio, image, pdf, or direct text) with Telegram chat synchronisation.';

revoke all on function public.web_submit_job(text, text, text, bigint, integer, text, text) from public, anon, authenticated;
grant execute on function public.web_submit_job(text, text, text, bigint, integer, text, text) to service_role, authenticated;

-- Delegate public.web_submit_audio_job to public.web_submit_job
create or replace function public.web_submit_audio_job(
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds integer default null,
  p_template_key text default null
)
returns table (
  job_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.web_submit_job(
    'audio',
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    p_duration_seconds,
    null,
    p_template_key
  );
end;
$$;

comment on function public.web_submit_audio_job(text, text, bigint, integer, text) is
  'Web RPC delegator to enqueue an audio upload processing job via web_submit_job.';

revoke all on function public.web_submit_audio_job(text, text, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.web_submit_audio_job(text, text, bigint, integer, text) to service_role, authenticated;
