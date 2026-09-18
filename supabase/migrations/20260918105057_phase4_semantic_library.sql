-- Phase 4 / semantic knowledge library
--
-- Embeddings are derived only from explicitly saved notes. The table stores no
-- duplicate note text: evidence is read from the current validated note output
-- after an owner-scoped match. A model or content-hash mismatch makes a note
-- eligible for lazy re-indexing on the next /ask.

create extension if not exists vector with schema extensions;

create table public.note_embeddings (
  note_id uuid primary key references public.notes (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  output_id uuid not null,
  embedding_model text not null,
  content_sha256 text not null,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint note_embeddings_output_belongs_to_note_fkey
    foreign key (output_id, note_id)
    references public.note_outputs (id, note_id)
    on delete cascade,
  constraint note_embeddings_model_not_blank
    check (length(btrim(embedding_model)) > 0),
  constraint note_embeddings_content_sha256_format
    check (content_sha256 ~ '^[0-9a-f]{64}$')
);

comment on table public.note_embeddings is
  'Owner-scoped semantic index for saved current note outputs. Contains vectors and integrity metadata only; note text remains in note_outputs.';

create trigger note_embeddings_set_updated_at
  before update on public.note_embeddings
  for each row execute function public.set_updated_at();

alter table public.note_embeddings enable row level security;
revoke all on table public.note_embeddings from anon, authenticated;

create index note_embeddings_user_model_idx
  on public.note_embeddings (user_id, embedding_model, updated_at desc);

create index note_embeddings_embedding_hnsw_idx
  on public.note_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Remove a vector as soon as a note leaves the library or its current output
-- changes. Re-saving or regeneration is indexed lazily on the next /ask.
create or replace function public.invalidate_note_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_saved or
     new.current_output_id is distinct from old.current_output_id then
    delete from public.note_embeddings where note_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.invalidate_note_embedding()
  from public, anon, authenticated;

create trigger notes_invalidate_embedding
  after update of is_saved, current_output_id on public.notes
  for each row execute function public.invalidate_note_embedding();

-- A bounded batch of saved notes whose current output is not represented by the
-- configured model and exact content hash. The content crosses only the trusted
-- service-role boundary and is not copied into note_embeddings.
create or replace function public.list_saved_notes_for_embedding(
  p_user_id uuid,
  p_embedding_model text,
  p_limit integer
)
returns table (
  note_id uuid,
  output_id uuid,
  title text,
  content_json jsonb,
  content_sha256 text
)
language sql
security definer
set search_path = ''
as $$
  select
    note.id,
    output.id,
    note.title,
    output.content_json,
    encode(
      extensions.digest(
        convert_to(note.title || E'\n' || output.content_json::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  from public.notes as note
  join public.note_outputs as output on output.id = note.current_output_id
  left join public.note_embeddings as indexed on indexed.note_id = note.id
  where note.user_id = p_user_id
    and note.is_saved
    and note.deleted_at is null
    and length(btrim(coalesce(p_embedding_model, ''))) between 1 and 64
    and (
      indexed.note_id is null or
      indexed.output_id <> output.id or
      indexed.embedding_model <> p_embedding_model or
      indexed.content_sha256 <> encode(
        extensions.digest(
          convert_to(note.title || E'\n' || output.content_json::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  order by note.updated_at desc, note.id
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

comment on function public.list_saved_notes_for_embedding(uuid, text, integer) is
  'Returns at most twenty owned saved current outputs that need semantic indexing for one model.';

-- The database rechecks ownership, saved state, current output and content hash
-- in the same statement that writes the vector. A stale provider result therefore
-- cannot attach to a note that was unsaved or regenerated while the call ran.
create or replace function public.upsert_note_embedding(
  p_user_id uuid,
  p_note_id uuid,
  p_output_id uuid,
  p_embedding_model text,
  p_content_sha256 text,
  p_embedding text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_embedding extensions.vector(768);
begin
  begin
    v_embedding := p_embedding::extensions.vector(768);
  exception when others then
    return false;
  end;

  insert into public.note_embeddings (
    note_id,
    user_id,
    output_id,
    embedding_model,
    content_sha256,
    embedding
  )
  select
    note.id,
    note.user_id,
    output.id,
    p_embedding_model,
    p_content_sha256,
    v_embedding
  from public.notes as note
  join public.note_outputs as output on output.id = note.current_output_id
  where note.id = p_note_id
    and note.user_id = p_user_id
    and note.is_saved
    and note.deleted_at is null
    and output.id = p_output_id
    and p_content_sha256 = encode(
      extensions.digest(
        convert_to(note.title || E'\n' || output.content_json::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  on conflict (note_id) do update
    set user_id = excluded.user_id,
        output_id = excluded.output_id,
        embedding_model = excluded.embedding_model,
        content_sha256 = excluded.content_sha256,
        embedding = excluded.embedding;

  return found;
end;
$$;

comment on function public.upsert_note_embedding(uuid, uuid, uuid, text, text, text) is
  'Writes one semantic vector only while its note is owned, saved, current and content-hash consistent.';

create or replace function public.match_saved_note_embeddings(
  p_user_id uuid,
  p_embedding_model text,
  p_query_embedding text,
  p_limit integer,
  p_min_similarity real
)
returns table (
  note_id uuid,
  title text,
  content_json jsonb,
  updated_at timestamptz,
  similarity real
)
language sql
security definer
set search_path = ''
as $$
  select
    note.id,
    note.title,
    output.content_json,
    note.updated_at,
    (1 - (
      indexed.embedding OPERATOR(extensions.<=>)
      p_query_embedding::extensions.vector(768)
    ))::real
  from public.note_embeddings as indexed
  join public.notes as note on note.id = indexed.note_id
  join public.note_outputs as output on output.id = note.current_output_id
  where indexed.user_id = p_user_id
    and note.user_id = p_user_id
    and note.is_saved
    and note.deleted_at is null
    and indexed.output_id = output.id
    and indexed.embedding_model = p_embedding_model
    and 1 - (
      indexed.embedding OPERATOR(extensions.<=>)
      p_query_embedding::extensions.vector(768)
    ) >=
      least(greatest(coalesce(p_min_similarity, 0.35), -1), 1)
  order by
    indexed.embedding OPERATOR(extensions.<=>) p_query_embedding::extensions.vector(768),
    note.updated_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

comment on function public.match_saved_note_embeddings(uuid, text, text, integer, real) is
  'Returns bounded semantic evidence from one user''s explicitly saved current notes.';

revoke all on function public.list_saved_notes_for_embedding(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.upsert_note_embedding(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.match_saved_note_embeddings(uuid, text, text, integer, real)
  from public, anon, authenticated;

grant execute on function public.list_saved_notes_for_embedding(uuid, text, integer)
  to service_role;
grant execute on function public.upsert_note_embedding(uuid, uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.match_saved_note_embeddings(uuid, text, text, integer, real)
  to service_role;
