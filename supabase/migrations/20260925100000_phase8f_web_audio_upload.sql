-- Phase 8F: Web audio upload for large notes (>20 MB).
-- Adds private Supabase Storage bucket, relaxes processing_jobs constraints for web jobs,
-- updates claim_processing_job to include storage_path, and creates web_submit_audio_job RPC.

-- Storage bucket for web audio uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio_uploads',
  'audio_uploads',
  false,
  104857600, -- 100 MiB
  array[
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
    'audio/flac'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = array[
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
    'audio/flac'
  ];

-- Storage RLS policies for audio_uploads
create policy "Authenticated users can insert own audio objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'audio_uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Authenticated users can select own audio objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'audio_uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Service role has full access to audio uploads"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'audio_uploads')
  with check (bucket_id = 'audio_uploads');

-- Relax public.processing_jobs constraints for web-originated jobs
alter table public.processing_jobs alter column update_id drop not null;
alter table public.processing_jobs alter column chat_id drop not null;
alter table public.processing_jobs alter column message_id drop not null;
alter table public.processing_jobs add column storage_path text;

alter table public.processing_jobs
  add constraint processing_jobs_source_required
  check (update_id is not null or storage_path is not null);

-- Update claim_processing_job to include storage_path
drop function public.claim_processing_job(uuid, integer);

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
  storage_path text,
  source_text text,
  mime_type text,
  size_bytes bigint,
  duration_seconds integer,
  template_key text,
  output_language text,
  privacy_mode public.privacy_mode,
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
      null::bigint, null::public.input_type, null::text, null::text, null::text, null::text,
      null::bigint, null::integer, null::text, null::text, null::public.privacy_mode,
      null::public.job_state, null::integer, null::uuid, null::bigint;
    return;
  end if;

  if v_state in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED') then
    return query
    select 'terminal'::text, job.id, job.user_id, job.chat_id, job.status_message_id,
           job.input_type, null::text, null::text, null::text, job.mime_type, job.size_bytes,
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
             job.input_type, null::text, null::text, null::text, job.mime_type, job.size_bytes,
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
             job.input_type, null::text, null::text, null::text, job.mime_type, job.size_bytes,
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
           job.input_type, null::text, null::text, null::text, job.mime_type, job.size_bytes,
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
         job.input_type, job.telegram_file_id, job.storage_path, job.source_text, job.mime_type,
         job.size_bytes, job.duration_seconds, job.template_key, job.output_language,
         job.privacy_mode, job.state, job.attempt_count, job.note_id, job.queue_message_id
    from public.processing_jobs as job where job.id = p_job_id;
end;
$$;

comment on function public.claim_processing_job(uuid, integer) is
  'Locks and claims one due queued job, including optional storage_path.';

revoke all on function public.claim_processing_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_processing_job(uuid, integer) to service_role;

-- Web RPC: public.web_submit_audio_job
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

  select u.plan_key, u.status, p.max_audio_duration_seconds
    into v_plan_key, v_status, v_max_duration
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

  -- Validate template key
  if not exists (select 1 from public.templates where key = p_template_key) then
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
  'Web RPC to enqueue an audio upload processing job from Supabase Storage.';

revoke all on function public.web_submit_audio_job(text, text, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.web_submit_audio_job(text, text, bigint, integer, text) to service_role, authenticated;
