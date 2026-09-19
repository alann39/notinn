-- Once a generated note is staged, delivery retries reuse that persisted note.
-- The original text/file capability is no longer needed and can be scrubbed
-- before Telegram delivery succeeds rather than waiting for a terminal state.

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

  update public.notes as note
     set current_output_id = v_output_id
   where note.id = v_note_id;

  update public.processing_jobs as job
     set note_id = v_note_id,
         source_text = null,
         telegram_file_id = null,
         telegram_file_unique_id = null,
         original_filename = null
   where job.id = p_job_id;

  return query select 'created'::text, v_note_id, v_output_id;
end;
$$;

revoke all on function public.stage_note_for_delivery(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb,
  text, text, text, public.generation_reason
) from public, anon, authenticated;

grant execute on function public.stage_note_for_delivery(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb,
  text, text, text, public.generation_reason
) to service_role;
