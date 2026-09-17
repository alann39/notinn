-- Phase 0 / migration 1 of 9
-- Enumeration types and shared trigger helpers.
--
-- The entire vocabulary of the Phase 0 schema lives here so it can be reviewed in
-- one place. Later migrations may only reference types that already exist.
--
-- Note on enum evolution: PostgreSQL can ADD a value to an enum but cannot remove
-- one. Every value below maps 1:1 to the blueprint and nothing speculative is
-- included, so that a mistake here is a migration the team chose to make rather
-- than one it inherited.

create type public.user_status as enum (
  'active',
  'blocked',
  'deletion_pending',
  'deleted'
);

comment on type public.user_status is
  'User lifecycle (blueprint 13.2). Users are soft-deleted: "deleted" is a terminal status, not the absence of a row, because usage events are retained for billing and operations after account deletion.';

create type public.privacy_mode as enum (
  'balanced',
  'minimal'
);

comment on type public.privacy_mode is
  'Blueprint 11.4. balanced retains normalized source plus transcript/extracted text; minimal retains only the generated note.';

create type public.input_type as enum (
  'text',
  'voice',
  'audio',
  'image',
  'pdf',
  'docx',
  'txt',
  'md'
);

comment on type public.input_type is
  'Deterministic input classification for an accepted update. Deliberately shared by processing_jobs.input_type and notes.source_type so the two can never drift apart.';

create type public.job_state as enum (
  'RECEIVED',
  'QUEUED',
  'ACQUIRING',
  'EXTRACTING',
  'GENERATING',
  'DELIVERING',
  'RETRYABLE_FAILED',
  'COMPLETED',
  'FAILED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
);

comment on type public.job_state is
  'Processing job state machine (blueprint 14). Legal transitions are enforced by the processing_jobs trigger, not by application code alone.';

create type public.generation_reason as enum (
  'initial',
  'regenerate',
  'shorter',
  'detailed',
  'custom'
);

comment on type public.generation_reason is
  'Why a note_output row exists. Regeneration always appends a new row; an existing output is never overwritten (blueprint 3, principle 4).';

create type public.template_status as enum (
  'active',
  'archived'
);

comment on type public.template_status is
  'Archived templates remain valid foreign-key targets for historical note_outputs but are not offered for new generations.';

create type public.usage_operation as enum (
  'transcription',
  'generation',
  'vision',
  'embedding',
  'storage'
);

comment on type public.usage_operation is
  'Metered operation classes (blueprint 13.9). Rows in usage_events are immutable.';

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger that stamps updated_at. Attached to every Phase 0 table that carries an updated_at column. now() is transaction time in UTC, so ordering within a transaction is stable.';

-- A trigger function is invoked by the trigger machinery, never by a caller, so
-- it needs no execute grant. Left alone it keeps the grant to PUBLIC that
-- PostgreSQL gives every new function, which is inconsistent with the
-- deny-by-default posture the rest of this migration set follows: this function
-- is not reachable today only because it returns `trigger`, and a client-facing
-- surface that exists by accident of a return type is not a control.
--
-- Revoking costs nothing. Firing a trigger does not check the invoking role's
-- EXECUTE privilege on the function, so the BEFORE UPDATE triggers that use this
-- are unaffected.
revoke all on function public.set_updated_at() from public, anon, authenticated;
