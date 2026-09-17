-- Phase 0 / migration 7 of 9
-- public.notes and public.note_outputs
--
-- Two rules from the blueprint shape this schema:
--
--   11.5  deleting a note must remove its metadata, derived text and generated
--         outputs together.
--   3.4   an earlier generated output is never silently overwritten.
--
-- The second is why outputs live in their own append-only-by-convention table
-- with a generation_reason, and why notes.current_output_id is a pointer that is
-- moved rather than a column that is rewritten.

create table public.notes (
  id uuid primary key default gen_random_uuid(),

  -- Immutable owner (blueprint 3.8). Every read is scoped by this column.
  user_id uuid not null references public.users (id) on delete cascade,

  -- The job that produced this note. UNIQUE makes the origin relationship
  -- one-to-one, so multiple notes can never claim the same job.
  source_job_id uuid not null references public.processing_jobs (id) on delete cascade,

  title text not null,
  source_type public.input_type not null,
  language text not null,

  -- Transcript or extracted document text. Retention is governed by
  -- user_preferences.privacy_mode at write time.
  normalized_source_text text,

  -- Integrity and duplicate-detection aid. Digest only, never content.
  source_text_sha256 text,

  -- Preferred generated output. A composite foreign key (added below) pins this
  -- to an output belonging to *this* note, so a pointer can never cross notes.
  current_output_id uuid,

  is_saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Soft-delete window. Account and note deletion in a later phase decide whether
  -- rows are purged or retained as non-content tombstones.
  deleted_at timestamptz,

  constraint notes_source_job_id_key unique (source_job_id),
  constraint notes_id_current_output_id_key unique (id, current_output_id),
  constraint notes_title_not_blank check (length(btrim(title)) > 0),
  constraint notes_title_length check (length(title) <= 300),
  constraint notes_language_format check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint notes_source_text_sha256_format check (
    source_text_sha256 is null or source_text_sha256 ~ '^[0-9a-f]{64}$'
  )
);

comment on table public.notes is
  'A saved or previewed note owned by exactly one internal user (blueprint 13.6). Ownership is never expressed through a Telegram identifier.';

comment on column public.notes.current_output_id is
  'Preferred output. Moving this pointer is how a regeneration becomes current; the superseded note_outputs row is left untouched.';

comment on column public.notes.source_type is
  'Input modality. Shares the input_type enum with processing_jobs.input_type so the two can never drift.';

create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table public.note_outputs (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,

  template_key text not null references public.templates (key),
  schema_version integer not null default 1,

  -- Validated structured output. Never raw model text, and never a value that is
  -- fed back into SQL, access control or Telegram markup (blueprint 12.1).
  content_json jsonb not null,

  -- Deterministic Telegram-safe rendering produced from content_json, not by the
  -- model.
  rendered_text text not null,

  provider text not null,
  model text not null,
  generation_reason public.generation_reason not null default 'initial',

  created_at timestamptz not null default now(),

  constraint note_outputs_schema_version_positive check (schema_version >= 1),
  constraint note_outputs_rendered_text_not_blank check (length(btrim(rendered_text)) > 0),
  constraint note_outputs_content_json_is_object check (jsonb_typeof(content_json) = 'object'),

  -- Referenced by the composite foreign key on notes.current_output_id, which is
  -- what keeps a current-output pointer inside its own note.
  constraint note_outputs_id_note_id_key unique (id, note_id)
);

comment on table public.note_outputs is
  'Append-only generated outputs (blueprint 13.7). Regeneration inserts a new row; it never updates an existing one.';

comment on column public.note_outputs.rendered_text is
  'Deterministic rendering of content_json. Telegram escape and message-splitting are applied when rendering, never to model output directly.';

create index note_outputs_note_id_created_idx on public.note_outputs (note_id, created_at desc);
create index note_outputs_template_key_idx on public.note_outputs (template_key);

-- ---------------------------------------------------------------------------
-- Circular references, closed now that both tables exist
-- ---------------------------------------------------------------------------

-- The note that a job produced. SET NULL rather than CASCADE because a job is an
-- operational record of work performed and must survive note deletion.
alter table public.processing_jobs
  add constraint processing_jobs_note_id_fkey
  foreign key (note_id) references public.notes (id) on delete set null;

-- The preferred output of a note, constrained to an output of the same note.
-- Deleting the referenced output clears the pointer.
alter table public.notes
  add constraint notes_current_output_id_fkey
  foreign key (current_output_id, id) references public.note_outputs (id, note_id)
  on delete set null (current_output_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.notes enable row level security;
alter table public.note_outputs enable row level security;

revoke all on table public.notes from anon, authenticated;
revoke all on table public.note_outputs from anon, authenticated;
