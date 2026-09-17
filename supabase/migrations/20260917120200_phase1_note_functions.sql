-- Phase 1 / migration 3 of 3
-- Note persistence and the owner-scoped note lifecycle.
--
-- Phase 0 created the note tables and the job state machine but no function that
-- writes them, because nothing generated a note. These functions are that path,
-- and they exist as functions rather than as statements issued from
-- the Edge Function for the same reason `accept_telegram_update` does: the
-- operations are multi-statement, and splitting them across round trips would
-- leave observable intermediate states.
--
-- WHAT A FUNCTION BUYS HERE, PRECISELY.
--
--   * Atomicity. Persisting a note is a note row, an output row, a pointer and
--     the job's completion. Four statements. Issued separately, a failure between
--     any two of them leaves a note whose owner never received it — which is the
--     state blueprint 19.1 names DELIVERY_FAILED and which an operator has to
--     reconcile by hand. Here it is one transaction or none of it.
--
--   * An ordering the database can state. `processing_jobs.note_id` may be set
--     only while the job is still DELIVERING; the transition trigger permits
--     clearing it afterwards but refuses to re-point it. Together with
--     `processing_jobs_terminal_state_has_completed_at`, that means a job becomes
--     COMPLETED and acquires its note in the same statement or not at all. The
--     application does not have to remember the order, because there is no order
--     it can express.
--
--   * An authorisation predicate that cannot be separated from the effect. The
--     service role bypasses row level security — that is what ADR 0005 records —
--     so ownership of a note cannot be a policy. Every function here takes
--     `p_user_id` and puts it in the `where` clause of the statement it performs,
--     rather than checking ownership in TypeScript and then issuing a second call.
--     Blueprint 18.2 requires owner verification on every callback, and a callback
--     payload is attacker-chosen by construction: it arrives from the client and
--     names a resource. A note id belonging to somebody else must find nothing.
--
--   * Idempotence against Telegram's at-least-once delivery. `persist_note` locks
--     the job row, so two concurrent attempts to persist the same job serialise
--     behind each other and the second returns the first one's note.
--
-- Reads are functions too, and the rule is the same one that governs the writes
-- here: a read belongs on the server when its owner predicate would otherwise sit
-- somewhere it can be forgotten.
--
-- The line to a plain table accessor is a join. Both reads below join `notes` to
-- `note_outputs` to report the note's current format, and both ways of doing that
-- outside a function are worse than the function:
--
--   * Two PostgREST requests mean two statements whose owner predicates are
--     separately forgettable, whose results are assembled in TypeScript, and which
--     between them have a window where the second can fail after the first
--     succeeded. For find_note_for_regeneration that window is the one between
--     "this note is yours" and "here is its text".
--
--   * One request with an embedded resource would be a single statement, but it
--     names the foreign key it traverses — `notes!notes_current_output_id_fkey` —
--     so the expression of the read is a PostgREST string that no test in this
--     repository can parse and whose failure mode is a 400 at runtime. Here the
--     join and the predicate are SQL, reviewable in the file, and checkable by the
--     contract suite.
--
-- A read of one table filtered by its owner is the case an accessor is for, and
-- Phase 1 has none: both of its reads join. If one arrives — a lookup by id for a
-- note's title, say — it belongs in the repository against `notes` directly, with
-- the owner predicate adjacent to the id predicate, and this paragraph is the
-- argument for why that is allowed and the two below are not.
--
-- Writes get functions regardless, because a lost predicate there destroys or
-- exposes data in a way a rolled-back transaction cannot undo.
--
-- Usage events get no function. One immutable row per provider operation, written
-- by the server about its own work, with no cross-statement invariant and no owner
-- to verify — the immutability trigger already enforces everything there is to
-- enforce.

-- ---------------------------------------------------------------------------
-- persist_note
-- ---------------------------------------------------------------------------
--
-- Turns a DELIVERING job into a completed one with a note attached.

create or replace function public.persist_note(
  p_user_id uuid,
  p_job_id uuid,
  p_title text,
  p_language text,
  p_source_type public.input_type,
  p_normalized_source_text text,
  p_source_text_sha256 text,
  p_template_key text,
  p_schema_version integer,
  p_content_json jsonb,
  p_rendered_text text,
  p_provider text,
  p_model text,
  p_generation_reason public.generation_reason
)
returns table (outcome text, note_id uuid, output_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
-- `note_id` is both a RETURNS TABLE column and a column of processing_jobs, so a
-- bare reference to it could mean either. The same directive is used by
-- accept_telegram_update in Phase 0 for the same reason. It is applied to every
-- PL/pgSQL function in this file rather than case by case, because the correct
-- reading is never in doubt: every parameter is p_-prefixed and every local is
-- v_-prefixed, so no reference in these bodies ever intends the variable.
--
-- `list_recent_saved_notes` does not carry it, because it cannot: the directive
-- is PL/pgSQL's, and that function is `language sql`. The ambiguity it resolves is
-- avoided there instead by qualifying every column with its table alias, which is
-- worth doing in a SQL body regardless — there is no directive to fall back on.
#variable_conflict use_column
declare
  v_job_note_id uuid;
  v_job_state public.job_state;
  v_note_id uuid;
  v_output_id uuid;
begin
  -- Lock the job row. Two things depend on this: the ownership check and the
  -- lock are the same statement, and a concurrent second call blocks here rather
  -- than racing to insert a second note for the same job.
  select job.note_id, job.state
    into v_job_note_id, v_job_state
    from public.processing_jobs as job
   where job.id = p_job_id
     and job.user_id = p_user_id
     for update;

  if not found then
    -- Either no such job or somebody else's. The two are one outcome on purpose:
    -- telling a caller which would let it probe for the existence of other
    -- users' jobs.
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Already persisted. Returned rather than refused, so a redelivered update or a
  -- retried delivery step converges on the note that exists instead of failing a
  -- unique constraint — which `classifyPostgresError` would report as an internal
  -- error, since class 23 means "a bug".
  if v_job_note_id is not null then
    select note.current_output_id into v_output_id
      from public.notes as note
     where note.id = v_job_note_id;

    return query select 'existing'::text, v_job_note_id, v_output_id;
    return;
  end if;

  -- The state the pipeline must have reached before a note can exist. Checked
  -- rather than assumed because the alternative is an exception from the
  -- transition trigger, and "the job was in QUEUED" is a far more useful thing to
  -- read in a log than a constraint violation.
  if v_job_state <> 'DELIVERING' then
    return query select 'wrong_state'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.notes (
    user_id,
    source_job_id,
    title,
    source_type,
    language,
    normalized_source_text,
    source_text_sha256
  )
  values (
    p_user_id,
    p_job_id,
    p_title,
    p_source_type,
    p_language,
    p_normalized_source_text,
    p_source_text_sha256
  )
  returning id into v_note_id;

  insert into public.note_outputs (
    note_id,
    template_key,
    schema_version,
    content_json,
    rendered_text,
    provider,
    model,
    generation_reason
  )
  values (
    v_note_id,
    p_template_key,
    p_schema_version,
    p_content_json,
    p_rendered_text,
    p_provider,
    p_model,
    p_generation_reason
  )
  returning id into v_output_id;

  -- Moving the pointer is how an output becomes current. Done here rather than
  -- left to the caller so that a note cannot exist without one.
  update public.notes
     set current_output_id = v_output_id
   where id = v_note_id;

  -- One statement, and it is the only one that can satisfy both rules at once.
  -- The trigger sees old.state = DELIVERING, so the terminal-immutability branch
  -- does not apply and note_id may be assigned; and because the same statement
  -- sets state and completed_at together, the
  -- processing_jobs_terminal_state_has_completed_at check is satisfied.
  --
  -- telegram_file_id is cleared here because this is where the job ends. For a
  -- text job it is already null; it is cleared anyway so that Phase 2's voice and
  -- document jobs cannot complete through this function and leave a
  -- secret-adjacent file handle on a finished row (blueprint 14.1).
  update public.processing_jobs
     set note_id = v_note_id,
         state = 'COMPLETED',
         completed_at = now(),
         telegram_file_id = null
   where id = p_job_id;

  return query select 'created'::text, v_note_id, v_output_id;
end;
$$;

comment on function public.persist_note(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb, text, text, text,
  public.generation_reason
) is
  'Persists a note and its first output for a DELIVERING job, moves the current-output pointer and completes the job, in one transaction. Owner-checked and idempotent: a second call for the same job returns the note that exists.';

-- ---------------------------------------------------------------------------
-- regenerate_note_output
-- ---------------------------------------------------------------------------
--
-- Appends an output. Blueprint 3.4 — "original content is never silently
-- overwritten; generated variants are versions or outputs, not destructive edits"
-- — and Phase 1's exit criterion that regeneration does not mutate the prior
-- output. So this inserts and nothing else: it does not touch
-- `notes.current_output_id` and it never updates or deletes an existing output.
--
-- WHY THE POINTER IS NOT MOVED HERE. Blueprint 10.7 step 5 requires the new
-- output to be marked current only after successful validation *and delivery*.
-- The reason is visible in the order of that sentence: until the message
-- carrying the new variant has actually reached the user, the output they have
-- seen is still the old one, and it should stay the one the note reports.
-- Marking current is therefore a separate, later call to set_current_output,
-- made once the send has succeeded. The cost is a window in which a delivered
-- output is not yet current if that second call fails; the alternative — a
-- current output the user has never seen — is the state the blueprint forbids,
-- and the window is repaired by tapping the format button again.
--
-- This is specific to regeneration because regeneration replaces something the
-- user has already seen. persist_note has no prior output to protect and follows
-- blueprint 10.2, which persists at step 7 and sends at step 8.

create or replace function public.regenerate_note_output(
  p_user_id uuid,
  p_note_id uuid,
  p_template_key text,
  p_schema_version integer,
  p_content_json jsonb,
  p_rendered_text text,
  p_provider text,
  p_model text,
  p_generation_reason public.generation_reason
)
returns table (outcome text, note_id uuid, output_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
-- `note_id` (an OUT column here) is also a column of note_outputs, which is
-- inserted into below. See the note on the same directive in persist_note.
#variable_conflict use_column
declare
  v_locked_note_id uuid;
  v_output_id uuid;
begin
  -- Ownership, liveness and the lock in one statement. A callback naming another
  -- user's note finds nothing here, which is blueprint 18.2's owner verification
  -- expressed where it cannot be forgotten.
  select note.id
    into v_locked_note_id
    from public.notes as note
   where note.id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
     for update;

  if v_locked_note_id is null then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.note_outputs (
    note_id,
    template_key,
    schema_version,
    content_json,
    rendered_text,
    provider,
    model,
    generation_reason
  )
  values (
    p_note_id,
    p_template_key,
    p_schema_version,
    p_content_json,
    p_rendered_text,
    p_provider,
    p_model,
    p_generation_reason
  )
  returning id into v_output_id;

  return query select 'created'::text, p_note_id, v_output_id;
end;
$$;

comment on function public.regenerate_note_output(
  uuid, uuid, text, integer, jsonb, text, text, text, public.generation_reason
) is
  'Appends a generated output to an owned, undeleted note. The superseded output and the current-output pointer are both left untouched: blueprint 10.7 requires the new output to be marked current only after it has been delivered, which is set_current_output''s job.';

-- ---------------------------------------------------------------------------
-- set_current_output
-- ---------------------------------------------------------------------------
--
-- Marks one of a note's outputs as the current one. The second half of blueprint
-- 10.7 step 5, called after the regenerated note has been sent.

create or replace function public.set_current_output(
  p_user_id uuid,
  p_note_id uuid,
  p_output_id uuid
)
returns table (outcome text, note_id uuid, output_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
-- `note_id` and `output_id` are OUT columns and also columns of the two tables
-- named below. See the note on the same directive in persist_note.
#variable_conflict use_column
declare
  v_current uuid;
begin
  -- The `exists` clause is what makes an unknown or foreign output id an ordinary
  -- not_found rather than a foreign-key violation. Without it, a hand-built
  -- callback payload carrying somebody else's output id would raise a class 23
  -- error, which classifyPostgresError reports as an internal bug — turning an
  -- attacker's probe into a false alarm in the error log, and an error response
  -- rather than a plain refusal.
  --
  -- It also makes the composite foreign key unfalsifiable: the row being pointed
  -- at is verified to belong to this note in the same statement that points at
  -- it, so notes_current_output_id_fkey can never fire.
  update public.notes as note
     set current_output_id = p_output_id
   where note.id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
     and exists (
       select 1
         from public.note_outputs as output
        where output.id = p_output_id
          and output.note_id = note.id
     )
  returning note.current_output_id into v_current;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  return query select 'updated'::text, p_note_id, v_current;
end;
$$;

comment on function public.set_current_output(uuid, uuid, uuid) is
  'Marks an owned note''s output as current, provided the output belongs to that note. Called after the regenerated note has been delivered, per blueprint 10.7 step 5.';

-- ---------------------------------------------------------------------------
-- set_note_saved
-- ---------------------------------------------------------------------------
--
-- The Save and Unsave buttons. One function rather than two, because the button
-- sends the state it wants and not the operation to perform — so a stale button on
-- an old message sets the state it names instead of toggling whatever the state
-- has since become.

create or replace function public.set_note_saved(
  p_user_id uuid,
  p_note_id uuid,
  p_is_saved boolean
)
returns table (outcome text, note_id uuid, is_saved boolean)
language plpgsql
security definer
set search_path = ''
as $$
-- This is the function where the directive earns its place: `is_saved` is an OUT
-- column, a column of notes, and the target of the SET below, all three at once.
-- Resolving it to the column is the only reading that is correct.
#variable_conflict use_column
declare
  v_is_saved boolean;
begin
  update public.notes
     set is_saved = p_is_saved
   where id = p_note_id
     and user_id = p_user_id
     and deleted_at is null
  returning notes.is_saved into v_is_saved;

  if not found then
    return query select 'not_found'::text, null::uuid, null::boolean;
    return;
  end if;

  -- The value read back rather than the value asked for, so a caller can tell a
  -- write that happened from one it merely believed happened.
  return query select 'updated'::text, p_note_id, v_is_saved;
end;
$$;

comment on function public.set_note_saved(uuid, uuid, boolean) is
  'Sets the saved flag on an owned, undeleted note and returns the stored value. Already in the requested state is a successful no-op, so a stale inline button cannot toggle the flag the wrong way.';

-- ---------------------------------------------------------------------------
-- delete_note
-- ---------------------------------------------------------------------------
--
-- Blueprint 11.5 requires deleting a note to remove its note metadata, its
-- source-derived text, and its generated outputs and versions. Principle 11 is
-- the reason the list is a "must": "Deletion is a product feature. Users can
-- delete a note and its derived data, not merely hide it."
--
-- So this is a real delete, one statement, and the schema does the rest:
--
--   * note_outputs.note_id is ON DELETE CASCADE (phase0_notes.sql), so every
--     output and version of the note goes with it. That foreign key is the
--     database's own statement of 11.5's third bullet, and relying on it rather
--     than deleting the children explicitly keeps the requirement in one place —
--     tests/contract/migration-constants.test.ts asserts the cascade exists so
--     that a later migration cannot quietly change the semantics of this
--     function from under it.
--
--   * processing_jobs.note_id is ON DELETE SET NULL, and the job state machine
--     exempts exactly that column from its terminal-state immutability. The two
--     were designed together: a completed job survives the deletion of the note
--     it produced, still recording how long the work took and what it cost. That
--     surviving job — user, timestamps, input type, state, usage events — is the
--     minimal non-content deletion record of blueprint 8.4, and it is the reason
--     no separate audit row is written here.
--
-- deleted_at IS NOT SET. Blueprint 13.6 describes that column as a "soft-delete
-- window **if adopted**", and 11.5's requirement is unconditional, so the window
-- is not adopted in the MVP and the column is left NULL. The `deleted_at is null`
-- predicate in the other four functions is therefore satisfied by every row that
-- exists; it is kept because it is the single expression of "a note that is
-- visible is actionable", so adopting 13.6's window later is a change to one
-- function — this one — rather than an audit of every read and write in the file.
--
-- A consequence recorded because the code cannot state it: deletion is
-- irreversible. There is no undelete, and none can be added without either
-- retaining the content this function exists to remove or accepting that a
-- restored note is a note without its source. Blueprint 7.4's `/delete_account`
-- and 11.5's disclosure duty both point the same way — tell the user before, not
-- after.

create or replace function public.delete_note(
  p_user_id uuid,
  p_note_id uuid
)
returns table (outcome text, note_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
-- `note_id` is an OUT column and the function deletes from notes. See the note on
-- the same directive in persist_note.
#variable_conflict use_column
declare
  v_deleted_id uuid;
begin
  -- The owner predicate is inside the statement that does the deleting, so there
  -- is no version of this function that checks ownership and then forgets it.
  -- `user_id = p_user_id` on a note that is not yours deletes nothing, and the
  -- caller learns only that there was nothing to delete.
  delete from public.notes as note
   where note.id = p_note_id
     and note.user_id = p_user_id
  returning note.id into v_deleted_id;

  if not found then
    -- One outcome covers "already deleted" and "never existed", which is right in
    -- both cases: there is nothing here for this user. A second tap on Delete is
    -- therefore not an error, and the caller renders the same "already gone"
    -- acknowledgement.
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  return query select 'deleted'::text, v_deleted_id;
end;
$$;

comment on function public.delete_note(uuid, uuid) is
  'Deletes an owned note and, by cascade, all of its generated outputs and versions. Idempotent from the caller''s point of view — a note that is already gone reports not_found. The originating job survives with note_id cleared.';

-- ---------------------------------------------------------------------------
-- list_recent_saved_notes
-- ---------------------------------------------------------------------------
--
-- Blueprint 7.4 defines `/recent` as "recent saved notes", and 8.4 asks notes to
-- be listed "by most recent update". Those two together are this query: saved
-- notes, newest update first.
--
-- A note is "saved" when `is_saved` is true — 13.6's words for the column are
-- "explicitly retained in library". The word in 7.4 is taken literally, which
-- means a user who has saved nothing sees an empty list; what that list says is
-- the presentation layer's problem, and the honest thing for it to say is how to
-- put something in it. Phase 4 builds "recent and filtered notes" on top of this.
--
-- The join is a LEFT join on purpose. A note whose `current_output_id` is null
-- would disappear from an inner join, and a note vanishing from a user's own list
-- is a worse failure than a list line with no format on it — the first is silent,
-- the second is visibly wrong. persist_note sets the pointer in the same
-- transaction that creates the note, so the null case should be unreachable; if
-- it ever happens, the caller renders the note without a format rather than
-- losing it.

create or replace function public.list_recent_saved_notes(
  p_user_id uuid,
  p_limit integer
)
returns table (
  note_id uuid,
  title text,
  language text,
  source_type public.input_type,
  template_key text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    note.id,
    note.title,
    note.language,
    note.source_type,
    output.template_key,
    note.created_at,
    note.updated_at
  from public.notes as note
  left join public.note_outputs as output on output.id = note.current_output_id
  where note.user_id = p_user_id
    and note.is_saved
    and note.deleted_at is null
  order by note.updated_at desc
  limit p_limit;
$$;

comment on function public.list_recent_saved_notes(uuid, integer) is
  'Lists a user''s saved, undeleted notes newest-update-first, with each note''s current output format. Owner-scoped in the statement itself.';

-- ---------------------------------------------------------------------------
-- find_note_for_regeneration
-- ---------------------------------------------------------------------------
--
-- Everything the regeneration flow needs to spend a model call: the text to
-- regenerate from, the language to answer in, and the format to answer in.
--
-- IT READS BEFORE THE MODEL IS CALLED, AND THAT IS THE POINT. A callback payload
-- is attacker-chosen — it arrives from the client and names a note — so a
-- generated note cannot be the first thing that proves the note exists. If
-- ownership were checked after generation, a forged callback would make Notinn
-- pay a provider for a note the caller has no claim to. Reading first makes the
-- cost conditional on the check.
--
-- The format comes from the CURRENT OUTPUT rather than from the note, because
-- that is what the user is looking at. Blueprint 8.4 keeps the template on the
-- output so that one note can hold outputs in more than one format, and 7.5's
-- "Change format" is what will use that. Phase 1 does not change format, so the
-- current output's template and the note's original template agree — but reading
-- the current one is the definition that stays right when they stop agreeing.
--
-- The join is INNER, unlike list_recent_saved_notes' LEFT join, and the two
-- differ because the failures differ. There, a missing output row would silently
-- drop a note out of the user's own list; here it would mean there is nothing to
-- regenerate from. A note with no current output is not regenerable, and "not
-- regenerable" and "not yours" deserve the same answer: there is nothing here to
-- work with. persist_note sets the pointer in the transaction that creates the
-- note, so the case is unreachable in any case.

create or replace function public.find_note_for_regeneration(
  p_user_id uuid,
  p_note_id uuid
)
returns table (
  note_id uuid,
  language text,
  source_type public.input_type,
  source_text text,
  template_key text
)
language sql
security definer
set search_path = ''
as $$
  select
    note.id,
    note.language,
    note.source_type,
    note.normalized_source_text,
    output.template_key
  from public.notes as note
  join public.note_outputs as output on output.id = note.current_output_id
  where note.id = p_note_id
    and note.user_id = p_user_id
    and note.deleted_at is null;
$$;

comment on function public.find_note_for_regeneration(uuid, uuid) is
  'Returns an owned, undeleted note''s text, language, input type and current format for regeneration, or no rows if there is nothing regenerable. Called before the provider so that a forged callback cannot cause a paid call.';

-- Phase 0 left a question open on the notes table: "Soft-delete window. Account
-- and note deletion in a later phase decide whether rows are purged or retained
-- as non-content tombstones."
--
-- Phase 1 is that later phase, and it decided: purged. Blueprint 13.6 describes
-- this column as a window "if adopted", and 11.5's requirement that deletion
-- remove metadata, derived text and generated outputs is unconditional — so the
-- window is not adopted and delete_note removes the row. Recording the answer on
-- the column is what stops the next reader from wondering whether something is
-- supposed to be setting it.
comment on column public.notes.deleted_at is
  'Not adopted in the MVP. Blueprint 13.6 permits a soft-delete window; 11.5 requires deletion to remove metadata, derived text and generated outputs, and principle 11 says users delete rather than hide. delete_note therefore removes the row. Retained as the single place a window would be honoured if one is ever adopted.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
--
-- The same posture as every other function in this project: PostgreSQL grants
-- EXECUTE on a new function to PUBLIC, and Supabase additionally grants it to
-- anon and authenticated. All seven of these act on behalf of the server — five
-- write and two read — so EXECUTE is revoked from all three and granted only to
-- service_role. See docs/ADR/0005-access-model.md.
--
-- The two read functions get the same treatment even though they only read. They
-- are SECURITY DEFINER and take the owner as a parameter, so granting them to
-- `authenticated` would let any signed-in user pass any uuid and read that user's
-- notes: the parameter would be a claim rather than a verified identity. A
-- client-facing read surface needs a policy plus a function that derives the
-- owner from the request rather than accepting it, which is a change to ADR 0005
-- and is not in Phase 1.
--
-- No table privileges are touched, because this migration creates no table. The
-- tables these functions write were revoked from the client roles in Phase 0.

revoke all on function public.persist_note(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb, text, text, text,
  public.generation_reason
) from public, anon, authenticated;

revoke all on function public.regenerate_note_output(
  uuid, uuid, text, integer, jsonb, text, text, text, public.generation_reason
) from public, anon, authenticated;

revoke all on function public.set_current_output(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.set_note_saved(uuid, uuid, boolean)
  from public, anon, authenticated;

revoke all on function public.delete_note(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.list_recent_saved_notes(uuid, integer)
  from public, anon, authenticated;

revoke all on function public.find_note_for_regeneration(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.persist_note(
  uuid, uuid, text, text, public.input_type, text, text, text, integer, jsonb, text, text, text,
  public.generation_reason
) to service_role;

grant execute on function public.regenerate_note_output(
  uuid, uuid, text, integer, jsonb, text, text, text, public.generation_reason
) to service_role;

grant execute on function public.set_current_output(uuid, uuid, uuid)
  to service_role;

grant execute on function public.set_note_saved(uuid, uuid, boolean)
  to service_role;

grant execute on function public.delete_note(uuid, uuid)
  to service_role;

grant execute on function public.list_recent_saved_notes(uuid, integer)
  to service_role;

grant execute on function public.find_note_for_regeneration(uuid, uuid)
  to service_role;
