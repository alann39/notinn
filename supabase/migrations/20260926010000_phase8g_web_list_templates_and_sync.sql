-- Phase 8G: Web template listing RPC and Telegram auto-synchronisation for audio uploads.
-- 1. Exposes public.web_list_templates for web clients to fetch active system and owned custom templates.
-- 2. Updates public.web_submit_audio_job to populate processing_jobs.chat_id from users.telegram_chat_id
--    so completed web audio notes are automatically synchronised to the user's Telegram chat.

-- --- public.web_list_templates ----------------------------------------------

create or replace function public.web_list_templates(
  p_input_type text default 'audio'
)
returns table (
  template_key text,
  template_name text,
  description text,
  is_custom boolean,
  is_default boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_default_template text;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  if p_input_type is not null and p_input_type not in (
    'text', 'voice', 'audio', 'image', 'pdf', 'docx', 'txt', 'md'
  ) then
    raise exception 'invalid input type' using errcode = '22023';
  end if;

  select case
    when p_input_type in ('audio', 'voice') then coalesce(up.default_voice_template, 'clean_note')
    when p_input_type = 'text' then coalesce(up.default_text_template, 'clean_note')
    when p_input_type in ('image', 'pdf', 'docx', 'txt', 'md') then coalesce(up.default_document_template, 'extract_and_summarize')
    else coalesce(up.default_voice_template, 'clean_note')
  end
  into v_default_template
  from public.user_preferences as up
  where up.user_id = v_user_id;

  v_default_template := coalesce(v_default_template, 'clean_note');

  return query
    select
      t.key as template_key,
      t.name as template_name,
      t.description,
      (t.owner_user_id is not null) as is_custom,
      (t.key = v_default_template) as is_default
    from public.templates as t
   where t.status = 'active'
     and (t.owner_user_id is null or t.owner_user_id = v_user_id)
     and (p_input_type is null or p_input_type::public.input_type = any(t.applicable_input_types))
   order by
     (t.key = v_default_template) desc,
     (t.owner_user_id is not null) desc,
     t.created_at asc;
end;
$$;

comment on function public.web_list_templates(text) is
  'Lists active templates available to the authenticated web user, flagging default and custom templates.';

revoke all on function public.web_list_templates(text) from public, anon, authenticated;
grant execute on function public.web_list_templates(text) to service_role, authenticated;

-- --- Update public.web_submit_audio_job --------------------------------------

create or replace function public.web_submit_audio_job(
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds integer default null,
  p_template_key text default 'clean_note'
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
  v_job_id uuid;
  v_queue_message_id bigint;
  v_output_language text;
  v_privacy_mode public.privacy_mode;
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

  -- Ensure storage path belongs to the authenticated user (auth.uid()/filename)
  if (storage.foldername(p_storage_path))[1] is distinct from auth.uid()::text then
    raise exception 'Invalid storage path' using errcode = '42501';
  end if;

  -- 100 MiB hard limit (104,857,600 bytes)
  if p_size_bytes > 104857600 then
    raise exception 'File size exceeds maximum allowed upload size (100MB)' using errcode = '22023';
  end if;

  -- Free plan size limit (14 MiB = 14,680,064 bytes)
  if v_plan_key = 'free' and p_size_bytes > 14680064 then
    raise exception 'Audio files over 14MB require a Pro plan' using errcode = '22023';
  end if;

  -- Duration limit check if duration is provided
  if p_duration_seconds is not null and p_duration_seconds > v_max_duration then
    raise exception 'Audio duration exceeds plan limit' using errcode = '22023';
  end if;

  -- Validate template key against active system or owned templates for audio input
  if not exists (
    select 1
      from public.templates as t
     where t.key = p_template_key
       and t.status = 'active'
       and (t.owner_user_id is null or t.owner_user_id = v_user_id)
       and 'audio'::public.input_type = any(t.applicable_input_types)
  ) then
    raise exception 'Invalid template key' using errcode = '22023';
  end if;

  -- Get user preferences snapshot (output_language and privacy_mode)
  select up.output_language, up.privacy_mode
    into v_output_language, v_privacy_mode
    from public.user_preferences as up
   where up.user_id = v_user_id;

  v_output_language := coalesce(v_output_language, 'mirror');
  v_privacy_mode := coalesce(v_privacy_mode, 'balanced'::public.privacy_mode);

  insert into public.processing_jobs (
    user_id,
    chat_id,
    input_type,
    storage_path,
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
    'audio',
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    p_duration_seconds,
    p_template_key,
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

comment on function public.web_submit_audio_job(text, text, bigint, integer, text) is
  'Web RPC to enqueue an audio upload processing job from Supabase Storage with Telegram chat synchronisation.';

revoke all on function public.web_submit_audio_job(text, text, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.web_submit_audio_job(text, text, bigint, integer, text) to service_role, authenticated;
