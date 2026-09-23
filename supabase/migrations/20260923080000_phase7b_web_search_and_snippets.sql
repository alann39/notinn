-- Phase 7B: Web dashboard search fix and note summary snippets.
-- 1. Updates web_list_notes to return note summary snippet.
-- 2. Updates web_search_notes to use search_document (fixing search_vector bug),
--    support unsaved notes via p_saved_only, add title ilike matching,
--    and return summary snippet and rank.
-- 3. Updates web_get_note to return summary snippet.

-- --- Update web_list_notes ---------------------------------------------------

drop function if exists public.web_list_notes(integer, integer, boolean);

create or replace function public.web_list_notes(
  p_offset integer default 0,
  p_limit integer default 20,
  p_saved_only boolean default false
)
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
  summary text
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
         from jsonb_array_elements_text(
           (select no.content_json -> 'tags'
              from public.note_outputs as no
             where no.id = n.current_output_id)
         ) as t(value)),
        '{}'::text[]
      ) as tags,
      coalesce(
        (select no.template_key
           from public.note_outputs as no
          where no.id = n.current_output_id),
        'summary'
      ) as template_key,
      coalesce(
        (select no.content_json ->> 'summary'
           from public.note_outputs as no
          where no.id = n.current_output_id),
        ''
      ) as summary
    from public.notes as n
    where n.user_id = v_user_id
      and n.deleted_at is null
      and (not p_saved_only or n.is_saved = true)
    order by n.updated_at desc
    offset p_offset
    limit p_limit;
end;
$$;

revoke all on function public.web_list_notes(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.web_list_notes(integer, integer, boolean) to service_role, authenticated;

-- --- Update web_search_notes -------------------------------------------------

drop function if exists public.web_search_notes(text, integer);
drop function if exists public.web_search_notes(text, integer, boolean);

create or replace function public.web_search_notes(
  p_query text,
  p_limit integer default 20,
  p_saved_only boolean default false
)
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
  rank real
)
language sql
stable
security definer
set search_path = ''
as $$
  with search_query as (
    select websearch_to_tsquery(
      'simple'::regconfig,
      left(btrim(coalesce(p_query, '')), 200)
    ) as value
  ),
  linked_user as (
    select public.get_linked_user_id() as id
  )
  select
    n.id,
    n.title,
    n.source_type::text,
    n.language,
    n.is_saved,
    n.created_at,
    n.updated_at,
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(no.content_json -> 'tags', '[]'::jsonb)
        )
      ),
      array[]::text[]
    ) as tags,
    coalesce(no.template_key, 'summary') as template_key,
    coalesce(no.content_json ->> 'summary', '') as summary,
    (
      coalesce(ts_rank_cd(n.search_document, sq.value), 0) +
      coalesce(ts_rank_cd(no.search_document, sq.value), 0) +
      case when n.title ilike '%' || btrim(p_query) || '%' then 1.0 else 0.0 end
    )::real as rank
  from public.notes as n
  join linked_user as lu on lu.id = n.user_id
  left join public.note_outputs as no on no.id = n.current_output_id
  cross join search_query as sq
  where n.deleted_at is null
    and (not p_saved_only or n.is_saved = true)
    and length(btrim(coalesce(p_query, ''))) between 1 and 200
    and (
      n.search_document @@ sq.value or
      (no.search_document is not null and no.search_document @@ sq.value) or
      n.title ilike '%' || btrim(p_query) || '%' or
      (no.content_json ->> 'summary') ilike '%' || btrim(p_query) || '%'
    )
  order by rank desc, n.updated_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.web_search_notes(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.web_search_notes(text, integer, boolean) to service_role, authenticated;

-- --- Update web_get_note -----------------------------------------------------

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

revoke all on function public.web_get_note(uuid) from public, anon, authenticated;
grant execute on function public.web_get_note(uuid) to service_role, authenticated;
