-- Phase 4 / deterministic knowledge-library search
--
-- Full-text search ships before embeddings so relevance, ownership and the bot
-- interaction can be verified without a paid provider call. Only explicitly
-- saved notes belong to the library. The current output participates in search;
-- older generated variants remain history and must not produce duplicate hits.

alter table public.notes
  add column search_document tsvector
  generated always as (
    setweight(
      to_tsvector('simple'::regconfig, coalesce(title, '')),
      'A'
    ) ||
    setweight(
      to_tsvector('simple'::regconfig, coalesce(normalized_source_text, '')),
      'C'
    )
  ) stored;

alter table public.note_outputs
  add column search_document tsvector
  generated always as (
    setweight(
      to_tsvector(
        'simple'::regconfig,
        coalesce(content_json -> 'tags', '[]'::jsonb)::text
      ),
      'A'
    ) ||
    setweight(
      to_tsvector('simple'::regconfig, rendered_text),
      'B'
    )
  ) stored;

comment on column public.notes.search_document is
  'Stored full-text vector for title and retained normalized source. Queried only through owner-scoped library functions.';

comment on column public.note_outputs.search_document is
  'Stored full-text vector for validated tags and rendered note content. Search joins only the current output.';

create index notes_search_document_idx
  on public.notes using gin (search_document);

create index note_outputs_search_document_idx
  on public.note_outputs using gin (search_document);

-- This matches the library predicate and the deterministic tie-break ordering.
-- It remains useful for /recent even when a full-text query matches many notes.
create index notes_saved_user_updated_idx
  on public.notes (user_id, updated_at desc, id)
  where is_saved and deleted_at is null;

create or replace function public.search_saved_notes(
  p_user_id uuid,
  p_query text,
  p_limit integer
)
returns table (
  note_id uuid,
  title text,
  language text,
  source_type public.input_type,
  template_key text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  rank real
)
language sql
security definer
set search_path = ''
as $$
  with search_query as (
    select websearch_to_tsquery(
      'simple'::regconfig,
      left(btrim(coalesce(p_query, '')), 200)
    ) as value
  )
  select
    note.id,
    note.title,
    note.language,
    note.source_type,
    output.template_key,
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(output.content_json -> 'tags', '[]'::jsonb)
        )
      ),
      array[]::text[]
    ),
    note.created_at,
    note.updated_at,
    (
      ts_rank_cd(note.search_document, search_query.value) +
      ts_rank_cd(output.search_document, search_query.value)
    )::real as rank
  from public.notes as note
  join public.note_outputs as output on output.id = note.current_output_id
  cross join search_query
  where note.user_id = p_user_id
    and note.is_saved
    and note.deleted_at is null
    and length(btrim(coalesce(p_query, ''))) between 2 and 200
    and (
      note.search_document @@ search_query.value or
      output.search_document @@ search_query.value
    )
  order by rank desc, note.updated_at desc, note.id
  limit least(greatest(coalesce(p_limit, 10), 1), 10);
$$;

comment on function public.search_saved_notes(uuid, text, integer) is
  'Searches one user''s saved current notes by title, model-validated tags, retained source and rendered content. Bounded to ten ranked results.';

revoke all on function public.search_saved_notes(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.search_saved_notes(uuid, text, integer)
  to service_role;
