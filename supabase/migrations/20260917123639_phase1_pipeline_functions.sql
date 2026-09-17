-- Phase 1 / pipeline functions
-- Owner-scoped pipeline helpers used by inline text generation.

-- Move one owned job through one expected state transition. The transition
-- trigger remains the authority on which edges are legal; this function adds the
-- owner and compare-and-set predicates that keep two webhook deliveries from
-- advancing the same job independently.
create or replace function public.advance_processing_job(
  p_user_id uuid,
  p_job_id uuid,
  p_expected_state public.job_state,
  p_next_state public.job_state
)
returns table (outcome text, job_state public.job_state)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.processing_jobs as job
     set state = p_next_state,
         started_at = case
           when p_next_state = 'ACQUIRING' and job.started_at is null then now()
           else job.started_at
         end
   where job.id = p_job_id
     and job.user_id = p_user_id
     and job.state = p_expected_state
  returning 'advanced'::text, job.state;

  if not found then
    return query select 'not_found'::text, null::public.job_state;
  end if;
end;
$$;

comment on function public.advance_processing_job(uuid, uuid, public.job_state, public.job_state) is
  'Compare-and-set transition for one owned processing job. Legal edges are still enforced by enforce_processing_job_transition().';

-- Record a retryable processing failure without storing provider or user
-- content. `p_error_detail` is a fixed application-owned description.
create or replace function public.mark_processing_job_retryable(
  p_user_id uuid,
  p_job_id uuid,
  p_expected_state public.job_state,
  p_error_code text,
  p_error_detail text
)
returns table (outcome text, job_state public.job_state)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.processing_jobs as job
     set state = 'RETRYABLE_FAILED',
         attempt_count = job.attempt_count + 1,
         next_attempt_at = now() + interval '5 minutes',
         last_error_code = p_error_code,
         last_error_detail = p_error_detail
   where job.id = p_job_id
     and job.user_id = p_user_id
     and job.state = p_expected_state
  returning 'updated'::text, job.state;

  if not found then
    return query select 'not_found'::text, null::public.job_state;
  end if;
end;
$$;

comment on function public.mark_processing_job_retryable(uuid, uuid, public.job_state, text, text) is
  'Moves one owned job from its expected active state to RETRYABLE_FAILED and stores only a fixed error code and sanitised detail.';

-- Read the instruction and provider schema for one active template. Phase 1
-- uses system templates only; the owner branch makes the boundary ready for the
-- custom-template phase without exposing another user''s row.
create or replace function public.find_template_for_generation(
  p_user_id uuid,
  p_template_key text
)
returns table (
  template_key text,
  template_name text,
  instruction_text text,
  schema_json jsonb
)
language sql
security definer
set search_path = ''
as $$
  select template.key, template.name, template.instruction_text, template.schema_json
    from public.templates as template
   where template.key = p_template_key
     and template.status = 'active'
     and (template.owner_user_id is null or template.owner_user_id = p_user_id);
$$;

comment on function public.find_template_for_generation(uuid, text) is
  'Returns one active system or owned template for generation. Never returns another user''s custom template.';

-- Read one current output for display and keyboard rendering. The owner
-- predicate is in the same statement as the note id predicate.
create or replace function public.find_note_for_display(
  p_user_id uuid,
  p_note_id uuid
)
returns table (
  note_id uuid,
  rendered_text text,
  content_json jsonb,
  template_key text,
  is_saved boolean
)
language sql
security definer
set search_path = ''
as $$
  select note.id, output.rendered_text, output.content_json, output.template_key, note.is_saved
    from public.notes as note
    join public.note_outputs as output on output.id = note.current_output_id
   where note.id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null;
$$;

comment on function public.find_note_for_display(uuid, uuid) is
  'Returns an owned note''s current rendered output and display state, or no rows.';

-- Compare a redelivery's raw-body digest with the ledger entry. Telegram promises
-- an update id identifies one immutable update; false therefore means corrupted
-- or forged redelivery and is an operational signal, never a second job.
create or replace function public.telegram_update_digest_matches(
  p_update_id bigint,
  p_payload_digest text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select case
    when telegram_update.payload_digest is null or p_payload_digest is null then null
    else telegram_update.payload_digest = p_payload_digest
  end
  from public.telegram_updates as telegram_update
  where telegram_update.update_id = p_update_id;
$$;

comment on function public.telegram_update_digest_matches(bigint, text) is
  'Compares a duplicate delivery digest with the original ledger entry. Returns null when either digest or the update is absent.';

revoke all on function public.advance_processing_job(
  uuid, uuid, public.job_state, public.job_state
) from public, anon, authenticated;
revoke all on function public.mark_processing_job_retryable(
  uuid, uuid, public.job_state, text, text
) from public, anon, authenticated;
revoke all on function public.find_template_for_generation(uuid, text)
  from public, anon, authenticated;
revoke all on function public.find_note_for_display(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.telegram_update_digest_matches(bigint, text)
  from public, anon, authenticated;

grant execute on function public.advance_processing_job(
  uuid, uuid, public.job_state, public.job_state
) to service_role;
grant execute on function public.mark_processing_job_retryable(
  uuid, uuid, public.job_state, text, text
) to service_role;
grant execute on function public.find_template_for_generation(uuid, text)
  to service_role;
grant execute on function public.find_note_for_display(uuid, uuid)
  to service_role;
grant execute on function public.telegram_update_digest_matches(bigint, text)
  to service_role;
