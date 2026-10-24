-- Phase 3 of structured editing: action items overlay.
--
-- Action items carry more than a line of text (owner, due date, priority), so
-- the overlay stores a normalised array of objects. An empty array removes the
-- override and the generated list applies again.

create or replace function public.web_set_note_action_items(
  p_note_id uuid,
  p_action_items jsonb
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
  v_items jsonb;
  v_item jsonb;
  v_text text;
  v_owner text;
  v_due text;
  v_priority text;
  v_normalised jsonb := '[]'::jsonb;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_items := coalesce(p_action_items, '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    return query select 'invalid_payload'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if jsonb_array_length(v_items) > 50 then
    return query select 'too_many_items'::text, null::uuid, null::timestamptz;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      return query select 'invalid_item'::text, null::uuid, null::timestamptz;
      return;
    end if;

    v_text := btrim(coalesce(v_item ->> 'text', v_item ->> 'task', ''));
    v_owner := nullif(btrim(coalesce(v_item ->> 'owner', v_item ->> 'assignee', '')), '');
    v_due := nullif(
      btrim(coalesce(v_item ->> 'due_date', v_item ->> 'due_date_text', '')),
      ''
    );
    v_priority := nullif(lower(btrim(coalesce(v_item ->> 'priority', ''))), '');

    -- A row with no text is a row the user emptied on purpose: drop it.
    if v_text = '' then
      continue;
    end if;

    if length(v_text) > 500 then
      return query select 'invalid_item'::text, null::uuid, null::timestamptz;
      return;
    end if;
    if v_owner is not null and length(v_owner) > 120 then
      return query select 'invalid_item'::text, null::uuid, null::timestamptz;
      return;
    end if;
    if v_due is not null and length(v_due) > 40 then
      return query select 'invalid_item'::text, null::uuid, null::timestamptz;
      return;
    end if;
    if v_priority is not null and v_priority not in ('high', 'medium', 'low') then
      return query select 'invalid_item'::text, null::uuid, null::timestamptz;
      return;
    end if;

    v_normalised := v_normalised || jsonb_build_object(
      'text', v_text,
      'owner', v_owner,
      'due_date', v_due,
      'priority', v_priority
    );
  end loop;

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

  if jsonb_array_length(v_normalised) = 0 then
    update public.note_edits as e
       set content_overlay = e.content_overlay - 'action_items'
     where e.note_id = p_note_id
       and e.base_output_id = v_output_id;

    delete from public.note_edits as e
     where e.note_id = p_note_id
       and e.rendered_text is null
       and (e.content_overlay is null or e.content_overlay = '{}'::jsonb);
  else
    insert into public.note_edits as e (note_id, base_output_id, content_overlay)
    values (
      p_note_id,
      v_output_id,
      jsonb_build_object('action_items', v_normalised)
    )
    on conflict (note_id) do update
      set base_output_id = excluded.base_output_id,
          content_overlay = coalesce(e.content_overlay, '{}'::jsonb) || excluded.content_overlay;
  end if;

  return query select 'updated'::text, p_note_id, now();
end;
$$;

comment on function public.web_set_note_action_items(uuid, jsonb) is
  'Replaces the human action-item list for an owned note. Items with empty text are dropped; an empty list removes the override.';

revoke all on function public.web_set_note_action_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.web_set_note_action_items(uuid, jsonb) to service_role, authenticated;

-- --- public.web_get_note (merged action items) ----------------------------------

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
  key_points text[],
  action_items jsonb,
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
      coalesce(
        case
          when e.base_output_id = n.current_output_id
            and jsonb_typeof(e.content_overlay -> 'key_points') = 'array'
            then (
              select array_agg(p.value::text order by p.ordinality)
              from jsonb_array_elements_text(e.content_overlay -> 'key_points')
                with ordinality as p(value, ordinality)
            )
        end,
        (
          select array_agg(p.value::text order by p.ordinality)
          from jsonb_array_elements_text(
            coalesce(no.content_json -> 'key_points', '[]'::jsonb)
          ) with ordinality as p(value, ordinality)
        ),
        '{}'::text[]
      ) as key_points,
      coalesce(
        case
          when e.base_output_id = n.current_output_id
            and jsonb_typeof(e.content_overlay -> 'action_items') = 'array'
            then e.content_overlay -> 'action_items'
        end,
        no.content_json -> 'action_items',
        '[]'::jsonb
      ) as action_items,
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
  'Gets a single note with its current output, merged human overlay (summary, key points, action items, body) and source transcript.';

revoke all on function public.web_get_note(uuid) from public, anon, authenticated;
grant execute on function public.web_get_note(uuid) to service_role, authenticated;
