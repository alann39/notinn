-- Phase 8H: Web Draft Actions & Job Status RPC
-- 1. Adds public.web_set_note_saved to save/unsave draft notes.
-- 2. Adds public.web_delete_note to permanently delete notes and associated outputs.
-- 3. Updates public.web_get_note to return transcript (normalized_source_text) for preview drawer.
-- 4. Adds public.web_get_job_status to allow web clients to poll status of submitted audio processing jobs.

-- --- public.web_set_note_saved ------------------------------------------------

create or replace function public.web_set_note_saved(
  p_note_id uuid,
  p_is_saved boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  update public.notes as n
     set is_saved = p_is_saved,
         updated_at = now()
   where n.id = p_note_id
     and n.user_id = v_user_id
     and n.deleted_at is null;

  return found;
end;
$$;

comment on function public.web_set_note_saved(uuid, boolean) is
  'Web RPC to toggle or update the is_saved status of an owned note.';

revoke all on function public.web_set_note_saved(uuid, boolean) from public, anon, authenticated;
grant execute on function public.web_set_note_saved(uuid, boolean) to service_role, authenticated;

-- --- public.web_delete_note ---------------------------------------------------

create or replace function public.web_delete_note(
  p_note_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_outcome text;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select d.outcome into v_outcome
    from public.delete_note(v_user_id, p_note_id) as d;

  return (v_outcome = 'deleted');
end;
$$;

comment on function public.web_delete_note(uuid) is
  'Web RPC to permanently delete an owned note and its outputs.';

revoke all on function public.web_delete_note(uuid) from public, anon, authenticated;
grant execute on function public.web_delete_note(uuid) to service_role, authenticated;

-- --- Update public.web_get_note -----------------------------------------------

drop function if exists public.web_get_note(uuid);

create or replace function public.web_get_note(p_note_id uuid)
returns table (
  id uuid,
  title text,
  source_type text,
  language text,
  is_saved boolean,
  created_at timestamptz,
  updated_at timestamptz,
  tags text[],
  template_key text,
  summary text,
  transcript text,
  output_id uuid,
  output_content_json jsonb,
  output_rendered_text text,
  output_template_key text,
  output_provider text,
  output_model text,
  output_generation_reason text,
  output_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  return query
    select
      n.id,
      n.title,
      n.source_type::text,
      n.language,
      n.is_saved,
      n.created_at,
      n.updated_at,
      coalesce(
        (select array_agg(t.value::text)
         from jsonb_array_elements_text(no.content_json -> 'tags') as t(value)),
        '{}'::text[]
      ) as tags,
      coalesce(no.template_key, 'summary') as template_key,
      coalesce(no.content_json ->> 'summary', '') as summary,
      n.normalized_source_text as transcript,
      no.id as output_id,
      no.content_json as output_content_json,
      no.rendered_text as output_rendered_text,
      no.template_key as output_template_key,
      no.provider as output_provider,
      no.model as output_model,
      no.generation_reason::text as output_generation_reason,
      no.created_at as output_created_at
    from public.notes as n
    left join public.note_outputs as no on no.id = n.current_output_id
    where n.id = p_note_id
      and n.user_id = v_user_id
      and n.deleted_at is null;
end;
$$;

comment on function public.web_get_note(uuid) is
  'Gets a single note with its current output and source transcript for the authenticated web user.';

revoke all on function public.web_get_note(uuid) from public, anon, authenticated;
grant execute on function public.web_get_note(uuid) to service_role, authenticated;

-- --- public.web_get_job_status ------------------------------------------------

create or replace function public.web_get_job_status(p_job_id uuid)
returns table (
  job_id uuid,
  state text,
  note_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
    select
      pj.id as job_id,
      pj.state::text as state,
      pj.note_id
    from public.processing_jobs as pj
   where pj.id = p_job_id
     and pj.user_id = v_user_id;
end;
$$;

comment on function public.web_get_job_status(uuid) is
  'Web RPC to query the processing state and resulting note ID of a submitted job for the authenticated user.';

revoke all on function public.web_get_job_status(uuid) from public, anon, authenticated;
grant execute on function public.web_get_job_status(uuid) to service_role, authenticated;
