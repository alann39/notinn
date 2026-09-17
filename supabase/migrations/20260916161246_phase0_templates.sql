-- Phase 0 / migration 3 of 9
-- public.templates and the system template catalogue.
--
-- System templates are inserted here rather than in seed.sql because they are
-- versioned product configuration that must exist in every environment,
-- including production. seed.sql is for local-only developer data and nothing
-- else. See docs/ADR/0002-phase-0-scope.md.

create table public.templates (
  id uuid primary key default gen_random_uuid(),

  -- NULL means a system template owned by Notinn itself.
  owner_user_id uuid references public.users (id) on delete cascade,

  -- Stable key used by processing_jobs.template_key, note_outputs.template_key
  -- and opaque Telegram callback payloads. Never shown to users.
  key text not null,
  name text not null,
  description text not null default '',

  -- Output contract this template targets. Phase 0 records which contract and
  -- version applies; Phase 1 replaces this with the concrete JSON Schema used
  -- for structured-output validation. See docs/ADR/0002-phase-0-scope.md.
  schema_json jsonb not null default '{}'::jsonb,

  -- Sanitised template instructions. Treated as configuration data and may never
  -- override security, privacy or platform rules (blueprint 6.2).
  instruction_text text not null default '',

  status public.template_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint templates_key_key unique (key),
  constraint templates_key_format check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint templates_name_not_blank check (length(btrim(name)) > 0),
  constraint templates_name_length check (length(name) <= 80),
  constraint templates_description_length check (length(description) <= 500)
);

comment on table public.templates is
  'Note output templates (blueprint 13.8). System templates have owner_user_id IS NULL. Custom templates are a post-MVP feature.';

comment on column public.templates.key is
  'Globally unique and immutable. The UNIQUE constraint is what allows processing_jobs and note_outputs to hold a real foreign key instead of an unvalidated string.';

comment on column public.templates.schema_json is
  'Phase 0 stores the target output contract, for example {"contract":"structured_note","version":1}. Phase 1 replaces this with the concrete JSON Schema.';

comment on column public.templates.instruction_text is
  'Template configuration, not instructions to the application. Prompt-injection defence (blueprint 12.5) treats all of this as untrusted input to the model, never as policy.';

create index templates_owner_user_id_idx on public.templates (owner_user_id)
  where owner_user_id is not null;

create trigger templates_set_updated_at
  before update on public.templates
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- System template catalogue
-- ---------------------------------------------------------------------------
--
-- Keys 1-10 are blueprint 6.1 verbatim; instruction_text is that table's
-- "Intended result" column, transcribed rather than invented.
--
-- extract_and_summarize is blueprint 6.3's default for screenshots and photos.
-- Section 6.3 names it as a first-class routing default but section 6.1's
-- catalogue omits it, so the catalogue is treated as non-exhaustive and the
-- template is added explicitly. Recorded in docs/ADR/0001-blueprint-deviations.md.

insert into public.templates (key, name, description, instruction_text) values
  (
    'clean_note',
    'Clean Note',
    'Corrected, structured version without unnecessary compression.',
    'Corrected, structured version without unnecessary compression.'
  ),
  (
    'short_summary',
    'Short Summary',
    'A concise TL;DR and a few key points.',
    'A concise TL;DR and a few key points.'
  ),
  (
    'detailed_summary',
    'Detailed Summary',
    'Sectioned summary preserving major context.',
    'Sectioned summary preserving major context.'
  ),
  (
    'key_points',
    'Key Points',
    'Bulleted facts and ideas only.',
    'Bulleted facts and ideas only.'
  ),
  (
    'action_items',
    'Action Items',
    'Tasks, owners, and deadlines when present.',
    'Tasks, owners, and deadlines when present.'
  ),
  (
    'meeting_notes',
    'Meeting Notes',
    'Agenda/context, discussion, decisions, and action items.',
    'Agenda/context, discussion, decisions, and action items.'
  ),
  (
    'study_notes',
    'Study Notes',
    'Concepts, explanations, examples, and review questions.',
    'Concepts, explanations, examples, and review questions.'
  ),
  (
    'decision_log',
    'Decision Log',
    'Decision, rationale, alternatives, owner, and date.',
    'Decision, rationale, alternatives, owner, and date.'
  ),
  (
    'sop_procedure',
    'SOP / Procedure',
    'Objective, prerequisites, ordered steps, and warnings.',
    'Objective, prerequisites, ordered steps, and warnings.'
  ),
  (
    'research_note',
    'Research Note',
    'Research question, findings, evidence, limitations, and follow-up.',
    'Research question, findings, evidence, limitations, and follow-up.'
  ),
  (
    'extract_and_summarize',
    'Extract & Summarize',
    'Text extracted from an image or screenshot, then summarised.',
    'Extract the text present in the image, then summarise it. Disclose unreadable or ambiguous regions as uncertainties rather than guessing.'
  );

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.templates enable row level security;

revoke all on table public.templates from anon, authenticated;
