-- A recovery batch can read a queue message a few seconds before the job's
-- next_attempt_at timestamp. PGMQ has already applied the normal five-minute
-- processing visibility timeout by then. Without correcting that timeout, a
-- job that is only seconds early disappears for another five minutes.
--
-- Keep the long visibility timeout for jobs that are actually processing, but
-- move an early retry's queue message back to its precise due time.

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
  v_queue_message_id bigint;
  v_retry_delay_seconds integer;
begin
  select job.state, job.attempt_count, job.next_attempt_at, job.queue_message_id
    into v_state, v_attempt_count, v_next_attempt_at, v_queue_message_id
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
      v_retry_delay_seconds := greatest(
        1,
        ceil(extract(epoch from (v_next_attempt_at - now())))::integer
      );

      if v_queue_message_id is not null then
        perform pgmq.set_vt('notinn_jobs', v_queue_message_id, v_retry_delay_seconds);
      end if;

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
  'Claims one due job and resets an early retry read to its exact due-time visibility.';

-- CREATE OR REPLACE preserves existing privileges in PostgreSQL. Repeat the
-- deny-by-default contract here anyway so this migration is independently
-- auditable and remains safe if it is ever applied to a reconstructed schema.
revoke all on function public.claim_processing_job(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_processing_job(uuid, integer)
  to service_role;
