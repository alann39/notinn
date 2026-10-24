-- Phase 1 of structured editing: summary overlay.
--
-- Until now note_edits only carried a whole-body markdown override, which meant
-- a manual edit flattened the read view (no summary callout, no structured
-- sections). This adds a partial content overlay so a single field can be
-- corrected while everything else keeps coming from the AI output.

alter table public.note_edits
  add column if not exists content_overlay jsonb;

alter table public.note_edits
  alter column rendered_text drop not null;

alter table public.note_edits
  drop constraint if exists note_edits_rendered_text_not_blank;

alter table public.note_edits
  add constraint note_edits_rendered_text_not_blank
  check (rendered_text is null or length(btrim(rendered_text)) > 0);

alter table public.note_edits
  drop constraint if exists note_edits_overlay_is_object;

alter table public.note_edits
  add constraint note_edits_overlay_is_object
  check (content_overlay is null or jsonb_typeof(content_overlay) = 'object');

alter table public.note_edits
  drop constraint if exists note_edits_content_present;

alter table public.note_edits
  add constraint note_edits_content_present
  check (rendered_text is not null or content_overlay is not null);

comment on column public.note_edits.content_overlay is
  'Partial patch over note_outputs.content_json. Only the keys present here win; every other field still comes from the generated output.';

comment on column public.note_edits.rendered_text is
  'Whole-body markdown override. NULL means the user only corrected individual fields (see content_overlay) and the body still comes from the generated output.';

-- --- public.web_set_note_summary -----------------------------------------------

create or replace function public.web_set_note_summary(
  p_note_id uuid,
  p_summary text
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
  v_summary text;
  v_overlay jsonb;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_summary := nullif(btrim(coalesce(p_summary, '')), '');
  if v_summary is not null and length(v_summary) > 4000 then
    return query select 'summary_too_long'::text, null::uuid, null::timestamptz;
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

  if v_output_id is null then
    return query select 'no_output'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select e.content_overlay into v_overlay
    from public.note_edits as e
   where e.note_id = p_note_id;

  if v_summary is null then
    v_overlay := coalesce(v_overlay, '{}'::jsonb) - 'summary';
  else
    v_overlay := jsonb_set(
      coalesce(v_overlay, '{}'::jsonb),
      '{summary}',
      to_jsonb(v_summary),
      true
    );
  end if;

  if v_overlay = '{}'::jsonb then
    -- Nothing left to override: drop a summary-only row entirely, and clear the
    -- patch on a row that also carries a body edit.
    delete from public.note_edits as e
     where e.note_id = p_note_id
       and e.rendered_text is null;

    update public.note_edits as e
       set content_overlay = null
     where e.note_id = p_note_id;
  else
    insert into public.note_edits as e (note_id, base_output_id, content_overlay)
    values (p_note_id, v_output_id, v_overlay)
    on conflict (note_id) do update
      set base_output_id = excluded.base_output_id,
          content_overlay = excluded.content_overlay;
  end if;

  return query select 'updated'::text, p_note_id, now();
end;
$$;

comment on function public.web_set_note_summary(uuid, text) is
  'Sets or clears the human summary override for an owned note. Empty input removes the override.';

revoke all on function public.web_set_note_summary(uuid, text) from public, anon, authenticated;
grant execute on function public.web_set_note_summary(uuid, text) to service_role, authenticated;

-- --- public.web_get_note (serve the overlay) ------------------------------------

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
  manual_edit_updated_at timestamptz,
  content_overlay jsonb
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
      coalesce(
        case
          when e.base_output_id = n.current_output_id
            then e.content_overlay ->> 'summary'
        end,
        no.content_json ->> 'summary',
        ''
      ) as summary,
      n.normalized_source_text as transcript,
      no.id as output_id,
      no.content_json as output_content_json,
      no.rendered_text as output_rendered_text,
      no.template_key as output_template_key,
      no.provider as output_provider,
      no.model as output_model,
      no.generation_reason::text as output_generation_reason,
      no.created_at as output_created_at,
      case
        when e.base_output_id = n.current_output_id then e.rendered_text
      end as manual_edit_rendered_text,
      case
        when e.base_output_id = n.current_output_id then e.updated_at
      end as manual_edit_updated_at,
      case
        when e.base_output_id = n.current_output_id then e.content_overlay
      end as content_overlay
    from public.notes as n
    left join public.note_outputs as no on no.id = n.current_output_id
    left join public.note_edits as e on e.note_id = n.id
    where n.id = p_note_id
      and n.user_id = v_user_id
      and n.deleted_at is null;
end;
$$;

comment on function public.web_get_note(uuid) is
  'Gets a single note with its current output, the human overlay (body and per-field patch), and the source transcript for the authenticated web user.';

revoke all on function public.web_get_note(uuid) from public, anon, authenticated;
grant execute on function public.web_get_note(uuid) to service_role, authenticated;
