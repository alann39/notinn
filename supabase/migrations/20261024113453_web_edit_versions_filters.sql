-- Web editing, version history, and note sorting.
--
-- 1. public.note_edits — human correction overlay for a note body. note_outputs
--    stays immutable (blueprint 3, principle 4): an edit never rewrites model
--    output, it is layered on top of the output it was based on.
-- 2. public.web_update_note — title + body edit, owner scoped.
-- 3. public.web_get_note — now returns the active manual edit overlay.
-- 4. public.web_list_note_outputs + public.web_restore_note_output — version
--    history and "go back to this version" (a pointer move, no AI call).
-- 5. public.web_list_notes / public.web_search_notes — p_sort for the library.

-- --- public.note_edits ---------------------------------------------------------

create table if not exists public.note_edits (
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

drop trigger if exists note_edits_set_updated_at on public.note_edits;
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

  return query select 'updated'::text, p_note_id, now();
end;
$$;

comment on function public.web_update_note(uuid, text, text) is
  'Web RPC to update an owned note title and body. The body is stored as an overlay in note_edits; note_outputs is never modified.';

revoke all on function public.web_update_note(uuid, text, text) from public, anon, authenticated;
grant execute on function public.web_update_note(uuid, text, text) to service_role, authenticated;

-- --- public.web_get_note (manual edit overlay) ----------------------------------

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

-- --- public.web_list_note_outputs -----------------------------------------------

create or replace function public.web_list_note_outputs(p_note_id uuid)
returns table (
  output_id uuid,
  template_key text,
  generation_reason text,
  created_at timestamptz,
  is_current boolean,
  rendered_text text
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
      no.id,
      no.template_key,
      no.generation_reason::text,
      no.created_at,
      (no.id = n.current_output_id) as is_current,
      no.rendered_text
    from public.note_outputs as no
    join public.notes as n on n.id = no.note_id
   where n.id = p_note_id
     and n.user_id = v_user_id
     and n.deleted_at is null
   order by no.created_at desc;
end;
$$;

comment on function public.web_list_note_outputs(uuid) is
  'Lists every generated version of an owned note, newest first, marking the one currently shown.';

revoke all on function public.web_list_note_outputs(uuid) from public, anon, authenticated;
grant execute on function public.web_list_note_outputs(uuid) to service_role, authenticated;

-- --- public.web_restore_note_output ---------------------------------------------

create or replace function public.web_restore_note_output(
  p_note_id uuid,
  p_output_id uuid
)
returns table (outcome text, note_id uuid, output_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_note_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select n.id into v_note_id
    from public.notes as n
   where n.id = p_note_id
     and n.user_id = v_user_id
     and n.deleted_at is null
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.note_outputs as no
     where no.id = p_output_id
       and no.note_id = p_note_id
  ) then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  update public.notes as n
     set current_output_id = p_output_id
   where n.id = p_note_id;

  -- The overlay was written against the previous output; leaving it in place
  -- keeps history but web_get_note will stop serving it (base mismatch).
  return query select 'restored'::text, p_note_id, p_output_id;
end;
$$;

comment on function public.web_restore_note_output(uuid, uuid) is
  'Repoints an owned note at one of its previous outputs. No AI call, no new output row.';

revoke all on function public.web_restore_note_output(uuid, uuid) from public, anon, authenticated;
grant execute on function public.web_restore_note_output(uuid, uuid) to service_role, authenticated;

-- --- public.web_list_notes (p_sort) ---------------------------------------------

drop function if exists public.web_list_notes(integer, integer, boolean);

create or replace function public.web_list_notes(
  p_offset integer default 0,
  p_limit integer default 20,
  p_saved_only boolean default false,
  p_sort text default 'updated_desc'
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
#variable_conflict use_column
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
    order by
      case when p_sort = 'created_desc' then n.created_at end desc nulls last,
      case when p_sort = 'created_asc' then n.created_at end asc nulls last,
      case when p_sort = 'title_asc' then lower(n.title) end asc nulls last,
      n.updated_at desc
    offset p_offset
    limit p_limit;
end;
$$;

comment on function public.web_list_notes(integer, integer, boolean, text) is
  'Paginated note library for the web dashboard. p_sort: updated_desc (default), created_desc, created_asc, title_asc.';

revoke all on function public.web_list_notes(integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.web_list_notes(integer, integer, boolean, text) to service_role, authenticated;

-- --- public.web_search_notes (p_sort) -------------------------------------------

drop function if exists public.web_search_notes(text, integer, boolean);

create or replace function public.web_search_notes(
  p_query text,
  p_limit integer default 20,
  p_saved_only boolean default false,
  p_sort text default 'updated_desc'
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
  order by
    rank desc,
    case when p_sort = 'created_desc' then n.created_at end desc nulls last,
    case when p_sort = 'created_asc' then n.created_at end asc nulls last,
    case when p_sort = 'title_asc' then lower(n.title) end asc nulls last,
    n.updated_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

comment on function public.web_search_notes(text, integer, boolean, text) is
  'Ranked note search for the web dashboard, with the same sort options as web_list_notes.';

revoke all on function public.web_search_notes(text, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.web_search_notes(text, integer, boolean, text) to service_role, authenticated;
