-- Migration: Multipart Audio Recording Sessions and Parts
-- Enables multi-part audio capture to bypass the 45MB/50MB single-file upload ceiling.

-- 1. Status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'audio_session_status') then
    create type public.audio_session_status as enum ('recording', 'processing', 'completed', 'failed');
  end if;
end
$$;

-- 2. Audio recording sessions master table
create table if not null public.audio_recording_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  template_key text not null default 'clean_note' references public.templates(key),
  output_language text not null default 'mirror',
  total_parts integer not null default 0,
  total_duration_seconds integer not null default 0,
  total_size_bytes bigint not null default 0,
  status public.audio_session_status not null default 'recording',
  final_note_id uuid references public.notes(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Audio session parts table
create table if not null public.audio_session_parts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.audio_recording_sessions(id) on delete cascade,
  part_number integer not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  duration_seconds integer not null default 0,
  transcript text,
  status text not null default 'pending', -- 'pending' | 'transcribing' | 'completed' | 'failed'
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audio_session_parts_session_part_unique unique (session_id, part_number)
);

-- 4. Indexes
create index if not exists idx_audio_recording_sessions_user_id
  on public.audio_recording_sessions(user_id);

create index if not exists idx_audio_session_parts_session_id
  on public.audio_session_parts(session_id);

-- 5. Row Level Security
alter table public.audio_recording_sessions enable row level security;
alter table public.audio_session_parts enable row level security;

-- Policies for audio_recording_sessions
create policy "Users can select own audio sessions"
  on public.audio_recording_sessions
  for select
  to authenticated
  using (user_id = public.get_linked_user_id());

create policy "Service role has full access to audio sessions"
  on public.audio_recording_sessions
  for all
  to service_role
  using (true)
  with check (true);

-- Policies for audio_session_parts
create policy "Users can select own audio parts"
  on public.audio_session_parts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.audio_recording_sessions s
      where s.id = audio_session_parts.session_id
        and s.user_id = public.get_linked_user_id()
    )
  );

create policy "Service role has full access to audio parts"
  on public.audio_session_parts
  for all
  to service_role
  using (true)
  with check (true);

-- 6. RPC: web_start_audio_session
create or replace function public.web_start_audio_session(
  p_template_key text default 'clean_note'
)
returns table (
  session_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_user_status text;
  v_session_id uuid;
  v_output_language text;
  v_template_key text;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select u.status into v_user_status
    from public.users as u
   where u.id = v_user_id;

  if v_user_status is null or v_user_status in ('deleted', 'blocked') then
    raise exception 'User is not active' using errcode = '42501';
  end if;

  v_template_key := coalesce(p_template_key, 'clean_note');
  if not exists (select 1 from public.templates where key = v_template_key) then
    v_template_key := 'clean_note';
  end if;

  select coalesce(up.output_language, 'mirror')
    into v_output_language
    from public.user_preferences as up
   where up.user_id = v_user_id;

  insert into public.audio_recording_sessions (
    user_id,
    template_key,
    output_language,
    status
  ) values (
    v_user_id,
    v_template_key,
    coalesce(v_output_language, 'mirror'),
    'recording'::public.audio_session_status
  )
  returning id into v_session_id;

  return query select v_session_id, 'recording'::text;
end;
$$;

revoke all on function public.web_start_audio_session(text) from public, anon, authenticated;
grant execute on function public.web_start_audio_session(text) to service_role, authenticated;

-- 7. RPC: web_submit_audio_part
create or replace function public.web_submit_audio_part(
  p_session_id uuid,
  p_part_number integer,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds integer default 0
)
returns table (
  part_id uuid,
  session_id uuid,
  part_number integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_session_owner uuid;
  v_session_status public.audio_session_status;
  v_part_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- Ensure storage path belongs to authenticated user
  if (storage.foldername(p_storage_path))[1] is distinct from auth.uid()::text then
    raise exception 'Invalid storage path' using errcode = '42501';
  end if;

  select s.user_id, s.status
    into v_session_owner, v_session_status
    from public.audio_recording_sessions as s
   where s.id = p_session_id;

  if v_session_owner is null or v_session_owner <> v_user_id then
    raise exception 'Session not found' using errcode = '42501';
  end if;

  if v_session_status in ('completed', 'failed') then
    raise exception 'Session is already finalised' using errcode = '22023';
  end if;

  -- Insert or update part
  insert into public.audio_session_parts (
    session_id,
    part_number,
    storage_path,
    mime_type,
    size_bytes,
    duration_seconds,
    status
  ) values (
    p_session_id,
    p_part_number,
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    greatest(0, coalesce(p_duration_seconds, 0)),
    'pending'
  )
  on conflict (session_id, part_number) do update set
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    duration_seconds = excluded.duration_seconds,
    updated_at = now()
  returning id into v_part_id;

  -- Update session aggregate totals
  update public.audio_recording_sessions as s
     set total_parts = (
           select count(*)::integer
             from public.audio_session_parts
            where session_id = p_session_id
         ),
         total_duration_seconds = (
           select coalesce(sum(duration_seconds), 0)::integer
             from public.audio_session_parts
            where session_id = p_session_id
         ),
         total_size_bytes = (
           select coalesce(sum(size_bytes), 0)::bigint
             from public.audio_session_parts
            where session_id = p_session_id
         ),
         updated_at = now()
   where s.id = p_session_id;

  return query select v_part_id, p_session_id, p_part_number, 'pending'::text;
end;
$$;

revoke all on function public.web_submit_audio_part(uuid, integer, text, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.web_submit_audio_part(uuid, integer, text, text, bigint, integer) to service_role, authenticated;

-- 8. RPC: web_finalize_audio_session
create or replace function public.web_finalize_audio_session(
  p_session_id uuid
)
returns table (
  job_id uuid,
  session_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_session_owner uuid;
  v_session_status public.audio_session_status;
  v_total_duration integer;
  v_total_size bigint;
  v_template_key text;
  v_job_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select s.user_id, s.status, s.total_duration_seconds, s.total_size_bytes, s.template_key
    into v_session_owner, v_session_status, v_total_duration, v_total_size, v_template_key
    from public.audio_recording_sessions as s
   where s.id = p_session_id;

  if v_session_owner is null or v_session_owner <> v_user_id then
    raise exception 'Session not found' using errcode = '42501';
  end if;

  update public.audio_recording_sessions as s
     set status = 'processing'::public.audio_session_status,
         updated_at = now()
   where s.id = p_session_id;

  -- Enqueue processing job for session
  insert into public.processing_jobs (
    user_id,
    input_type,
    storage_path,
    mime_type,
    size_bytes,
    duration_seconds,
    template_key,
    state
  ) values (
    v_user_id,
    'audio',
    'session:' || p_session_id::text,
    'audio/webm',
    coalesce(v_total_size, 0),
    coalesce(v_total_duration, 0),
    v_template_key,
    'QUEUED'
  )
  returning id into v_job_id;

  -- Nudge queue
  perform pgmq.send('notinn_jobs', jsonb_build_object('job_id', v_job_id));

  return query select v_job_id, p_session_id, 'processing'::text;
end;
$$;

revoke all on function public.web_finalize_audio_session(uuid) from public, anon, authenticated;
grant execute on function public.web_finalize_audio_session(uuid) to service_role, authenticated;

