-- Phase 8J: Web manual note editing.
--
-- 1. Adds public.note_edits — a human correction overlay for the note body.
--    note_outputs stays immutable (blueprint 3, principle 4): an edit never
--    rewrites model output, it is layered on top of the output it was based on.
-- 2. Adds public.web_update_note(p_note_id, p_title, p_rendered_text).
-- 3. Extends public.web_get_note with the active manual edit overlay.

-- --- public.note_edits ---------------------------------------------------------

create table public.note_edits (
  note_id uuid primary key references public.notes (id) on delete cascade,
  base_output_id uuid not null,
  rendered_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_edits_rendered_text_not_blank
    check (length(btrim(rendered_text)) > 0),
  constraint note_edits_rendered_text_length
    check (length(rendered_text) <= 100000),
  constraint note_edits_base_output_fkey
    foreign key (base_output_id, note_id)
    references public.note_outputs (id, note_id) on delete cascade
);

comment on table public.note_edits is
  'Human correction overlay for a note body. Never mutates note_outputs; the overlay is only honored while base_output_id still matches notes.current_output_id.';

create trigger note_edits_set_updated_at
  before update on public.note_edits
  for each row execute function public.set_updated_at();

alter table public.note_edits enable row level security;
revoke all on table public.note_edits from anon, authenticated;
revoke all on table public.note_edits from public, service_role;

-- --- public.web_update_note -----------------------------------------------------

create or replace function public.web_update_note(
  p_note_id uuid,
  p_title text,
  p_rendered_text text
)
returns table (outcome text, note_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_output_id uuid;
  v_title text;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null or length(v_title) > 300 then
    return query select 'invalid_title'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if p_rendered_text is null or length(btrim(p_rendered_text)) = 0 then
    return query select 'invalid_content'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if length(p_rendered_text) > 100000 then
    return query select 'content_too_long'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select n.current_output_id into v_output_id
    from public.notes as n
   where n.id = p_note_id
     and n.user_id = v_user_id
     and n.deleted_at is null
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- Title is mutable note metadata; updated_at is maintained by
  -- notes_set_updated_at, so it is never written here.
  update public.notes as n
     set title = v_title
   where n.id = p_note_id;

  if v_output_id is not null then
    insert into public.note_edits (note_id, base_output_id, rendered_text)
    values (p_note_id, v_output_id, p_rendered_text)
    on conflict (note_id) do update
      set base_output_id = excluded.base_output_id,
          rendered_text = excluded.rendered_text;
  end if;

  return query
    select 'updated'::text, p_note_id, now();
end;
$$;

comment on function public.web_update_note(uuid, text, text) is
  'Web RPC to update an owned note title and body. The body is stored as an overlay in note_edits; note_outputs is never modified.';

revoke all on function public.web_update_note(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.web_update_note(uuid, text, text)
  to service_role, authenticated;

-- --- public.web_get_note (add manual edit overlay) ------------------------------

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
  output_created_at timestamptz,
  manual_edit_rendered_text text,
  manual_edit_updated_at timestamptz
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
      no.created_at as output_created_at,
      case when e.base_output_id = n.current_output_id then e.rendered_text end
        as manual_edit_rendered_text,
      case when e.base_output_id = n.current_output_id then e.updated_at end
        as manual_edit_updated_at
    from public.notes as n
    left join public.note_outputs as no on no.id = n.current_output_id
    left join public.note_edits as e on e.note_id = n.id
    where n.id = p_note_id
      and n.user_id = v_user_id
      and n.deleted_at is null;
end;
$$;

comment on function public.web_get_note(uuid) is
  'Gets a single note with its current output, source transcript, and active manual edit overlay for the authenticated web user.';

revoke all on function public.web_get_note(uuid) from public, anon, authenticated;
grant execute on function public.web_get_note(uuid) to service_role, authenticated;
