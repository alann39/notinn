-- Phase 2 of structured editing: key points overlay.
--
-- Key points are an array, so the editor replaces the whole list per save
-- rather than patching one string. The overlay only stores the list when the
-- user actually edited it; otherwise the generated list still applies.

create or replace function public.web_set_note_key_points(
  p_note_id uuid,
  p_key_points jsonb
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
  v_points jsonb;
  v_point text;
  v_count integer;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_points := coalesce(p_key_points, '[]'::jsonb);
  if jsonb_typeof(v_points) <> 'array' then
    return query select 'invalid_payload'::text, null::uuid, null::timestamptz;
    return;
  end if;

  v_count := jsonb_array_length(v_points);
  if v_count > 50 then
    return query select 'too_many_points'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- Blank entries are dropped rather than rejected: the editor lets a user
  -- clear a row, and an empty row should never block the save.
  for v_point in select value from jsonb_array_elements_text(v_points) loop
    if length(v_point) > 1000 then
      return query select 'invalid_point'::text, null::uuid, null::timestamptz;
      return;
    end if;
  end loop;

  -- Normalise: trim, drop empties, keep the author's order.
  select coalesce(jsonb_agg(btrim(value) order by ordinality), '[]'::jsonb)
    into v_points
    from jsonb_array_elements_text(v_points) with ordinality as t(value, ordinality)
   where btrim(value) <> '';

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

  if jsonb_array_length(v_points) = 0 then
    update public.note_edits as e
       set content_overlay = e.content_overlay - 'key_points'
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
      jsonb_build_object('key_points', v_points)
    )
    on conflict (note_id) do update
      set base_output_id = excluded.base_output_id,
          content_overlay = coalesce(e.content_overlay, '{}'::jsonb) || excluded.content_overlay;
  end if;

  return query select 'updated'::text, p_note_id, now();
end;
$$;

comment on function public.web_set_note_key_points(uuid, jsonb) is
  'Replaces the human key-point list for an owned note. An empty array removes the override.';

revoke all on function public.web_set_note_key_points(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.web_set_note_key_points(uuid, jsonb) to service_role, authenticated;

-- --- public.web_get_note (merged key points) ------------------------------------

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
  'Gets a single note with its current output, merged human overlay (summary, key points, body) and source transcript for the authenticated web user.';

revoke all on function public.web_get_note(uuid) from public, anon, authenticated;
grant execute on function public.web_get_note(uuid) to service_role, authenticated;
