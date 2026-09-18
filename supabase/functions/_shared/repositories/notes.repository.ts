import { z } from "zod";
import type { GenerationReason, InputType } from "../config/constants.ts";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import {
  classifyPostgresError,
  type PostgresErrorLike,
  toDatabaseError,
} from "./postgres-errors.ts";

/**
 * The note lifecycle, as the webhook performs it.
 *
 * Every method here is a call to a `SECURITY DEFINER` function, including the two
 * reads, and the reason is ownership rather than transactionality. The service
 * role bypasses row level security, so the only place a note's owner can be
 * enforced is inside the statement that touches it — see
 * `supabase/migrations/20260917123623_phase1_note_functions.sql` for the argument
 * in full, and docs/ADR/0005-access-model.md for the access model itself.
 *
 * The shape of this boundary is deliberate and worth stating once. A method
 * returns an outcome and the identifiers the caller needs, and it does not throw
 * for a refusal. "This note is not yours", "this note is gone" and "this job is
 * not in the state it needs to be" are ordinary answers, not failures — the caller
 * has to handle them anyway, and an exception would make the common path look like
 * an error in the logs. It throws only when the database is broken or the reply is
 * not the shape this file expects, which is a bug on one side of the boundary or
 * the other.
 *
 * Every value returned across the boundary is validated before use. The RPC
 * returns a row shape TypeScript cannot see, and treating a database reply as
 * trusted is how a schema change becomes a runtime crash in production.
 */

const UuidSchema = z.uuid();
const TimestampSchema = z.string();

/** One row of `persist_note`'s result set. */
const PersistNoteRowSchema = z.object({
  outcome: z.enum(["created", "existing", "not_found", "wrong_state"]),
  note_id: UuidSchema.nullable(),
  output_id: UuidSchema.nullable(),
});

export type PersistNoteOutcome = "created" | "existing" | "not_found" | "wrong_state";

/** One row of `regenerate_note_output`'s result set. */
const RegenerateRowSchema = z.object({
  outcome: z.enum(["created", "not_found"]),
  note_id: UuidSchema.nullable(),
  output_id: UuidSchema.nullable(),
});

export type NoteWriteOutcome = "created" | "not_found";

/** One row of `set_current_output`'s result set. */
const SetCurrentOutputRowSchema = z.object({
  outcome: z.enum(["updated", "not_found"]),
  note_id: UuidSchema.nullable(),
  output_id: UuidSchema.nullable(),
});

export type SetCurrentOutputOutcome = "updated" | "not_found";

/** One row of `set_note_saved`'s result set. */
const SetNoteSavedRowSchema = z.object({
  outcome: z.enum(["updated", "not_found"]),
  note_id: UuidSchema.nullable(),
  is_saved: z.boolean().nullable(),
});

export type SetNoteSavedOutcome = "updated" | "not_found";

/** One row of `delete_note`'s result set. */
const DeleteNoteRowSchema = z.object({
  outcome: z.enum(["deleted", "not_found"]),
  note_id: UuidSchema.nullable(),
});

export type DeleteNoteOutcome = "deleted" | "not_found";

/** One row of `list_recent_saved_notes`'s result set. */
const RecentNoteRowSchema = z.object({
  note_id: UuidSchema,
  title: z.string(),
  language: z.string(),
  source_type: z.string(),
  template_key: z.string().nullable(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

/** One ranked row of `search_saved_notes`. */
const SearchNoteRowSchema = RecentNoteRowSchema.extend({
  tags: z.array(z.string()),
  rank: z.number().nonnegative(),
});

/** One row of `find_note_for_regeneration`'s result set. */
const RegenerationSourceRowSchema = z.object({
  note_id: UuidSchema,
  language: z.string(),
  source_type: z.string(),
  source_text: z.string().nullable(),
  template_key: z.string(),
});

/** One row of `find_note_for_display`'s result set. */
const DisplayNoteRowSchema = z.object({
  note_id: UuidSchema,
  rendered_text: z.string(),
  content_json: z.unknown(),
  template_key: z.string(),
  is_saved: z.boolean(),
});

/** The note-creation arguments, grouped so that a call site reads as one thing. */
export interface PersistNoteInput {
  readonly userId: string;
  readonly jobId: string;
  readonly title: string;
  readonly language: string;
  readonly sourceType: InputType;
  readonly normalizedSourceText: string | null;
  readonly sourceTextSha256: string | null;
  readonly templateKey: string;
  readonly schemaVersion: number;
  readonly contentJson: unknown;
  readonly renderedText: string;
  readonly provider: string;
  readonly model: string;
  readonly generationReason: GenerationReason;
}

export interface PersistNoteResult {
  readonly outcome: PersistNoteOutcome;
  readonly noteId: string | null;
  readonly outputId: string | null;
}

/** A new generated output for an existing note. */
export interface RegenerateNoteOutputInput {
  readonly userId: string;
  readonly noteId: string;
  readonly templateKey: string;
  readonly schemaVersion: number;
  readonly contentJson: unknown;
  readonly renderedText: string;
  readonly provider: string;
  readonly model: string;
  readonly generationReason: GenerationReason;
}

export interface NoteWriteResult {
  readonly outcome: NoteWriteOutcome;
  readonly noteId: string | null;
  readonly outputId: string | null;
}

export interface SetCurrentOutputResult {
  readonly outcome: SetCurrentOutputOutcome;
  readonly noteId: string | null;
  readonly outputId: string | null;
}

export interface SetNoteSavedResult {
  readonly outcome: SetNoteSavedOutcome;
  readonly noteId: string | null;
  /** The stored value, read back from the row rather than echoed from the request. */
  readonly isSaved: boolean | null;
}

export interface DeleteNoteResult {
  readonly outcome: DeleteNoteOutcome;
  readonly noteId: string | null;
}

/** One line of `/recent`. */
export interface RecentNote {
  readonly noteId: string;
  readonly title: string;
  readonly language: string;
  readonly sourceType: InputType;
  /**
   * The current output's format, or null if the note somehow has no current
   * output. Null is not expected — `persist_note` sets the pointer in the
   * transaction that creates the note — and the caller renders the line without a
   * format rather than dropping it.
   */
  readonly templateKey: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SearchNote extends RecentNote {
  readonly tags: readonly string[];
  readonly rank: number;
}

/** What regeneration needs, read before the provider is called. */
export interface RegenerationSource {
  readonly noteId: string;
  readonly language: string;
  readonly sourceType: InputType;
  /**
   * The transcript or extracted text to regenerate from.
   *
   * Nullable because the column is: retention is governed by
   * `user_preferences.privacy_mode` at write time. Phase 1 always stores it for a
   * text note, so the caller treats null as unreachable.
   * TODO(Phase 2): branch on it when a privacy mode that discards the source
   * exists, and tell the user the note cannot be regenerated rather than failing.
   */
  readonly sourceText: string | null;
  readonly templateKey: string;
}

/** The current output and state needed to show a note and rebuild its keyboard. */
export interface DisplayNote {
  readonly noteId: string;
  readonly renderedText: string;
  readonly contentJson: unknown;
  readonly templateKey: string;
  readonly isSaved: boolean;
}

export class NotesRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  /**
   * Persist a note and its first output, and complete the job that produced it.
   *
   * Idempotent against Telegram's at-least-once delivery: the job row is locked,
   * so a second call for the same job returns `existing` with the note that
   * already exists rather than failing on `notes_source_job_id_key`.
   *
   * `wrong_state` means the job never reached DELIVERING, which is a routing bug
   * rather than a user-visible condition — the pipeline does not call this until
   * it has something to deliver.
   */
  async persistNote(input: PersistNoteInput): Promise<PersistNoteResult> {
    try {
      const { data, error } = await this.#client.rpc("persist_note", {
        p_user_id: input.userId,
        p_job_id: input.jobId,
        p_title: input.title,
        p_language: input.language,
        p_source_type: input.sourceType,
        p_normalized_source_text: input.normalizedSourceText,
        p_source_text_sha256: input.sourceTextSha256,
        p_template_key: input.templateKey,
        p_schema_version: input.schemaVersion,
        p_content_json: input.contentJson,
        p_rendered_text: input.renderedText,
        p_provider: input.provider,
        p_model: input.model,
        p_generation_reason: input.generationReason,
      });

      const row = parseSingle(data, error, PersistNoteRowSchema, "persist_note");

      return { outcome: row.outcome, noteId: row.note_id, outputId: row.output_id };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Persist the first output without completing the job.
   *
   * Phase 2 uses this delivery-safe variant so a Telegram failure leaves the job
   * retryable with one already-persisted note. A retry can deliver that note
   * again without generating or inserting a duplicate.
   */
  async stageNoteForDelivery(input: PersistNoteInput): Promise<PersistNoteResult> {
    try {
      const { data, error } = await this.#client.rpc("stage_note_for_delivery", {
        p_user_id: input.userId,
        p_job_id: input.jobId,
        p_title: input.title,
        p_language: input.language,
        p_source_type: input.sourceType,
        p_normalized_source_text: input.normalizedSourceText,
        p_source_text_sha256: input.sourceTextSha256,
        p_template_key: input.templateKey,
        p_schema_version: input.schemaVersion,
        p_content_json: input.contentJson,
        p_rendered_text: input.renderedText,
        p_provider: input.provider,
        p_model: input.model,
        p_generation_reason: input.generationReason,
      });

      const row = parseSingle(data, error, PersistNoteRowSchema, "stage_note_for_delivery");
      return { outcome: row.outcome, noteId: row.note_id, outputId: row.output_id };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Append a generated output to an existing note.
   *
   * Deliberately does not move the current-output pointer. Blueprint 10.7 step 5
   * marks the new output current only after it has been delivered, so this and
   * `setCurrentOutput` are two calls with a send between them. The superseded
   * output is left untouched, which is Phase 1's "regeneration does not mutate the
   * prior output".
   *
   * A crash between the two leaves an output that no pointer reaches. That is the
   * intended trade: the alternative is a note pointing at something the user never
   * received.
   */
  async regenerateNoteOutput(input: RegenerateNoteOutputInput): Promise<NoteWriteResult> {
    try {
      const { data, error } = await this.#client.rpc("regenerate_note_output", {
        p_user_id: input.userId,
        p_note_id: input.noteId,
        p_template_key: input.templateKey,
        p_schema_version: input.schemaVersion,
        p_content_json: input.contentJson,
        p_rendered_text: input.renderedText,
        p_provider: input.provider,
        p_model: input.model,
        p_generation_reason: input.generationReason,
      });

      const row = parseSingle(data, error, RegenerateRowSchema, "regenerate_note_output");

      return { outcome: row.outcome, noteId: row.note_id, outputId: row.output_id };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Mark one of a note's outputs as current.
   *
   * The second half of blueprint 10.7 step 5. An output id that belongs to another
   * note is an ordinary `not_found` rather than a foreign-key violation, so a
   * hand-built callback payload gets a refusal and not an error log entry that
   * reads like a bug.
   */
  async setCurrentOutput(
    userId: string,
    noteId: string,
    outputId: string,
  ): Promise<SetCurrentOutputResult> {
    try {
      const { data, error } = await this.#client.rpc("set_current_output", {
        p_user_id: userId,
        p_note_id: noteId,
        p_output_id: outputId,
      });

      const row = parseSingle(data, error, SetCurrentOutputRowSchema, "set_current_output");

      return { outcome: row.outcome, noteId: row.note_id, outputId: row.output_id };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Set the saved flag, which is what puts a note in `/recent`.
   *
   * Carries the desired state rather than a toggle, so a stale button on an old
   * message sets the state it names instead of flipping whatever the flag has
   * become. That is why blueprint 17.4's "verify the revision when a stale action
   * could be harmful" is satisfiable without a revision check here: no Phase 1
   * action is harmful when stale.
   */
  async setNoteSaved(
    userId: string,
    noteId: string,
    isSaved: boolean,
  ): Promise<SetNoteSavedResult> {
    try {
      const { data, error } = await this.#client.rpc("set_note_saved", {
        p_user_id: userId,
        p_note_id: noteId,
        p_is_saved: isSaved,
      });

      const row = parseSingle(data, error, SetNoteSavedRowSchema, "set_note_saved");

      return { outcome: row.outcome, noteId: row.note_id, isSaved: row.is_saved };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Delete a note and, by cascade, its outputs and versions.
   *
   * Not a soft delete. Blueprint 11.5 requires deletion to remove metadata,
   * derived text and generated outputs, and 13.6's window is explicitly optional;
   * see the migration for why the window is not adopted.
   *
   * Idempotent from the caller's point of view: a note that is already gone
   * reports `not_found`, so a second tap on Delete is an acknowledgement rather
   * than an error.
   */
  async deleteNote(userId: string, noteId: string): Promise<DeleteNoteResult> {
    try {
      const { data, error } = await this.#client.rpc("delete_note", {
        p_user_id: userId,
        p_note_id: noteId,
      });

      const row = parseSingle(data, error, DeleteNoteRowSchema, "delete_note");

      return { outcome: row.outcome, noteId: row.note_id };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * The most recently updated saved notes, for `/recent`.
   *
   * Ordering is by `updated_at`, which blueprint 8.4 states as "most recent
   * update" and which the `notes_set_updated_at` trigger maintains on every write
   * — so saving a note moves it to the top, which is what a user who has just
   * saved something expects to see.
   */
  async listRecentSavedNotes(userId: string, limit: number): Promise<RecentNote[]> {
    try {
      const { data, error } = await this.#client.rpc("list_recent_saved_notes", {
        p_user_id: userId,
        p_limit: limit,
      });

      const rows = parseMany(data, error, RecentNoteRowSchema, "list_recent_saved_notes");

      return rows.map((row) => ({
        noteId: row.note_id,
        title: row.title,
        language: row.language,
        sourceType: row.source_type as InputType,
        templateKey: row.template_key,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /** Ranked full-text search across one user's explicitly saved notes. */
  async searchSavedNotes(userId: string, query: string, limit: number): Promise<SearchNote[]> {
    try {
      const { data, error } = await this.#client.rpc("search_saved_notes", {
        p_user_id: userId,
        p_query: query,
        p_limit: limit,
      });

      const rows = parseMany(data, error, SearchNoteRowSchema, "search_saved_notes");
      return rows.map((row) => ({
        noteId: row.note_id,
        title: row.title,
        language: row.language,
        sourceType: row.source_type as InputType,
        templateKey: row.template_key,
        tags: row.tags,
        rank: row.rank,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Read what regeneration needs, or nothing if there is nothing regenerable.
   *
   * Called before the provider, so that a forged callback cannot make Notinn pay
   * for a note the caller has no claim to. A null return covers "no such note",
   * "somebody else's note" and "already deleted", which are one answer on purpose:
   * separating them would let a caller probe for the existence of other users'
   * notes.
   */
  async findNoteForRegeneration(
    userId: string,
    noteId: string,
  ): Promise<RegenerationSource | null> {
    try {
      const { data, error } = await this.#client.rpc("find_note_for_regeneration", {
        p_user_id: userId,
        p_note_id: noteId,
      });

      const rows = parseMany(
        data,
        error,
        RegenerationSourceRowSchema,
        "find_note_for_regeneration",
      );
      const row = rows[0];

      if (row === undefined) return null;

      return {
        noteId: row.note_id,
        language: row.language,
        sourceType: row.source_type as InputType,
        sourceText: row.source_text,
        templateKey: row.template_key,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async findNoteForDisplay(userId: string, noteId: string): Promise<DisplayNote | null> {
    try {
      const { data, error } = await this.#client.rpc("find_note_for_display", {
        p_user_id: userId,
        p_note_id: noteId,
      });

      const rows = parseMany(data, error, DisplayNoteRowSchema, "find_note_for_display");
      const row = rows[0];
      if (row === undefined) return null;

      return {
        noteId: row.note_id,
        renderedText: row.rendered_text,
        contentJson: row.content_json,
        templateKey: row.template_key,
        isSaved: row.is_saved,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}

/**
 * Validate one row from a result set that always has exactly one.
 *
 * The PostgREST error is a parameter rather than a separate check at each call
 * site, so that a method cannot validate a reply it never established was a reply
 * — omitting the argument is a compile error, not a silent misreading of `null` as
 * an empty result.
 *
 * PostgREST returns a set-returning function's rows as an array, but a
 * single-column or single-row reply can arrive unwrapped, so both shapes are
 * accepted. An empty set is a bug rather than an empty answer: every one of these
 * functions returns a row on every path, including its refusal paths.
 */
function parseSingle<T>(
  data: unknown,
  error: PostgresErrorLike | null,
  schema: z.ZodType<T>,
  fn: string,
): T {
  if (error !== null) throw classifyPostgresError(error);

  const rows = Array.isArray(data) ? data : [data];
  const first = rows[0];

  if (first === undefined) {
    throw AppError.internal(`${fn} returned no rows`);
  }

  const parsed = schema.safeParse(first);
  if (!parsed.success) {
    throw AppError.internal(`${fn} returned an unexpected row shape`);
  }

  return parsed.data;
}

/**
 * Validate every row of a result set that may legitimately be empty.
 *
 * An empty array here is an ordinary answer — a user with no saved notes, or a
 * note that is not theirs — which is why this is a separate helper from
 * `parseSingle` rather than a flag on it.
 *
 * `null` is read as empty rather than as a malformed reply. PostgREST returns `[]`
 * for a zero-row set in the general case, but it returns `null` when the function's
 * result set has a single column, and a reply that means "no rows" must not be
 * reported as a bug — that path is the ordinary one for a forged callback, and an
 * internal error there would put a false alarm in the log on every probe.
 */
function parseMany<T>(
  data: unknown,
  error: PostgresErrorLike | null,
  schema: z.ZodType<T>,
  fn: string,
): T[] {
  if (error !== null) throw classifyPostgresError(error);
  if (data === null || data === undefined) return [];

  const rows = Array.isArray(data) ? data : [data];

  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) {
    throw AppError.internal(`${fn} returned an unexpected row shape`);
  }

  return parsed.data;
}
