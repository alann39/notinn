/**
 * Constants shared by the Edge Function, the scripts and the tests.
 *
 * Everything in this file is a mirror of something that already exists in the
 * database or in the blueprint. The mirror exists so the application can reason
 * about these values without a round trip; the database remains the source of
 * truth and the contract tests in tests/contract/ assert that the two agree.
 */

/**
 * Mirrors the public.job_state enum (migration 1).
 *
 * The order is the blueprint's pipeline order (blueprint 14), not alphabetical.
 */
export const JOB_STATES = [
  "RECEIVED",
  "QUEUED",
  "ACQUIRING",
  "EXTRACTING",
  "GENERATING",
  "DELIVERING",
  "RETRYABLE_FAILED",
  "COMPLETED",
  "FAILED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type JobState = (typeof JOB_STATES)[number];

/**
 * States from which no further transition is possible (blueprint 14).
 *
 * A terminal job is immutable in the database apart from clearing note_id. See
 * docs/ADR/0004-job-state-machine.md.
 */
export const TERMINAL_JOB_STATES = [
  "COMPLETED",
  "FAILED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const satisfies readonly JobState[];

export type TerminalJobState = (typeof TERMINAL_JOB_STATES)[number];

/**
 * The permitted transitions, mirroring public.enforce_processing_job_transition()
 * (migration 6) exactly. The database is the enforcement point; this copy exists
 * so the application can reject an impossible transition before attempting it,
 * and so a unit test can prove the two definitions have not drifted.
 *
 * CANCELLED is reachable from every non-terminal state. The blueprint's state
 * diagram does not show this edge; it is an inference recorded in
 * docs/ADR/0004-job-state-machine.md.
 */
export const JOB_STATE_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  RECEIVED: ["QUEUED", "REJECTED", "CANCELLED"],
  QUEUED: ["ACQUIRING", "EXPIRED", "CANCELLED"],
  ACQUIRING: ["EXTRACTING", "RETRYABLE_FAILED", "CANCELLED"],
  EXTRACTING: ["GENERATING", "RETRYABLE_FAILED", "CANCELLED"],
  GENERATING: ["DELIVERING", "RETRYABLE_FAILED", "CANCELLED"],
  DELIVERING: ["COMPLETED", "RETRYABLE_FAILED", "CANCELLED"],
  RETRYABLE_FAILED: ["QUEUED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/**
 * The only states a job may be created in (migration 6).
 *
 * Phase 0 creates jobs directly in QUEUED: there is no pgmq queue yet, so the
 * processing_jobs table is itself the durable queue and a QUEUED row is the
 * durable acceptance record. RECEIVED is retained in the enum for Phase 2, where
 * it becomes the state between webhook acknowledgement and queue publication.
 * See docs/ADR/0002-phase-0-scope.md.
 */
export const JOB_CREATION_STATES = ["RECEIVED", "QUEUED"] as const satisfies readonly JobState[];

/** Mirrors the public.input_type enum (migration 1). */
export const INPUT_TYPES = [
  "text",
  "voice",
  "audio",
  "image",
  "pdf",
  "docx",
  "txt",
  "md",
] as const;

export type InputType = (typeof INPUT_TYPES)[number];

/** Mirrors the public.user_status enum (migration 1). */
export const USER_STATUSES = ["active", "blocked", "deletion_pending", "deleted"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/** Mirrors the public.privacy_mode enum (migration 1). */
export const PRIVACY_MODES = ["balanced", "minimal"] as const;

export type PrivacyMode = (typeof PRIVACY_MODES)[number];

/** Mirrors the public.generation_reason enum (migration 1). */
export const GENERATION_REASONS = [
  "initial",
  "regenerate",
  "shorter",
  "detailed",
  "custom",
] as const;

export type GenerationReason = (typeof GENERATION_REASONS)[number];

/** Mirrors the public.usage_operation enum (migration 1). */
export const USAGE_OPERATIONS = [
  "transcription",
  "generation",
  "vision",
  "embedding",
  "storage",
] as const;

export type UsageOperation = (typeof USAGE_OPERATIONS)[number];

/**
 * The system template catalogue (migration 3).
 *
 * Keys 1-10 are blueprint 6.1. extract_and_summarize is blueprint 6.3's default
 * for images, which 6.1 omits from its catalogue; see
 * docs/ADR/0001-blueprint-deviations.md.
 */
export const SYSTEM_TEMPLATE_KEYS = [
  "clean_note",
  "short_summary",
  "detailed_summary",
  "key_points",
  "action_items",
  "meeting_notes",
  "study_notes",
  "decision_log",
  "sop_procedure",
  "research_note",
  "extract_and_summarize",
] as const;

export type SystemTemplateKey = (typeof SYSTEM_TEMPLATE_KEYS)[number];

/**
 * Where in a source a claim came from (blueprint 12.4, `source_references`).
 *
 * A closed vocabulary because each kind is addressed a different way and a reader
 * has to know which. A `page` is a PDF page number, a `timestamp` is an offset
 * into audio or video, a `segment` is a position in text that has been split. The
 * kinds named here are the ones the sources in blueprint 5.1 can actually produce;
 * Phase 3 adds whatever a document renderer turns out to need.
 *
 * Written here as a mirror of the enum in migration
 * 20260917123607_phase1_template_schemas.sql rather than only in the schema module,
 * because `tests/contract/` is where the two copies are made to agree.
 */
export const SOURCE_REFERENCE_KINDS = ["page", "timestamp", "segment"] as const;

export type SourceReferenceKind = (typeof SOURCE_REFERENCE_KINDS)[number];

/**
 * The model providers Notinn can be configured to use (blueprint 12.3).
 *
 * One entry, and that is the point. Blueprint 12.3 fixes `AI_PROVIDER=gemini` for
 * the MVP and requires every model call to go through the `NoteAIProvider`
 * interface, so this list is a mirror of a decision rather than a catalogue. The
 * factory in `_shared/providers/` is total over it — a second value here without a
 * case there is a compile error, not a runtime surprise.
 */
export const AI_PROVIDERS = ["gemini"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Telegram's documented maximum length for a text message. */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/**
 * The largest text body accepted directly from a Telegram message.
 *
 * Telegram caps message text at 4096 characters, so anything longer arrived as a
 * file, not as text. This bound therefore rejects a malformed or hostile payload
 * rather than a legitimate one, and exists so that source_text cannot be used to
 * push an unbounded blob into the database.
 */
export const MAX_SOURCE_TEXT_LENGTH = 100_000;

/** Header carrying the webhook secret, per the Telegram Bot API. */
export const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

/** Header used only by trusted callers of the internal processing worker. */
export const INTERNAL_WORKER_SECRET_HEADER = "X-Notinn-Worker-Secret";

/**
 * Telegram's documented maximum length of `callback_data`, in bytes.
 *
 * A limit and not a target. The payload contract in blueprint 17.4 is what keeps
 * the encoding small; this constant exists so that a rendered payload can be
 * asserted to fit before it is attached to a button, rather than discovered by
 * the Bot API refusing the call.
 */
export const TELEGRAM_MAX_CALLBACK_DATA_BYTES = 64;

/**
 * The largest pasted or forwarded text Notinn accepts (blueprint 5.1).
 *
 * Deliberately tighter than `MAX_SOURCE_TEXT_LENGTH`, and the two answer
 * different questions. This is the product limit: the number blueprint 5.1 names
 * as a configurable safeguard and the number a user is told about. The other is
 * the structural bound that keeps `source_text` from being an unbounded blob.
 * `tests/unit/text-normalisation.test.ts` asserts that this one is the tighter, so
 * the structural bound is implied by the product limit rather than restated at
 * every call site — and only the product limit is enforced at ingestion, by
 * `_shared/services/text-normalisation.ts`.
 *
 * A reader may notice that Telegram caps message text at 4096 characters, so no
 * text message can reach this limit today. That does not make it dead code: it is
 * the product limit for text however it arrives, and text arrives by other routes
 * — a `.txt` or `.md` document in Phase 3, a fetched article in Phase 4. The
 * transport's own cap is a fact about one route, which is why it is not used as
 * the product limit.
 */
export const MAX_PASTED_TEXT_CHARS = 60_000;

/**
 * The largest webhook body Notinn will parse.
 *
 * A Telegram Update is normally a few kilobytes; one carrying a large caption
 * and a document descriptor is still well under a hundred. The limit exists so
 * that an unauthenticated caller who has somehow learned the function URL cannot
 * make the function allocate memory in proportion to whatever they choose to
 * send. One mebibyte leaves more than an order of magnitude of headroom.
 *
 * Note that this bounds the body of the *update*, not the size of any file the
 * update refers to. Files are never sent to the webhook; they are fetched later
 * by `file_id`.
 */
export const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

/** Telegram Bot API's default maximum downloadable file size (20 MiB). */
export const MAX_TELEGRAM_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/** Raw audio ceiling that stays below Gemini's 20 MB total request limit after base64. */
export const MAX_INLINE_AUDIO_BYTES = 14 * 1024 * 1024;

/** Raw image/PDF ceiling that remains below Gemini's 20 MB request limit after base64. */
export const MAX_INLINE_MEDIA_BYTES = 14 * 1024 * 1024;

/** Compressed DOCX ceiling. Its expanded contents are bounded separately by the extractor. */
export const MAX_DOCX_BYTES = 10 * 1024 * 1024;

/** Plain-text document ceiling before strict UTF-8 decoding. */
export const MAX_TEXT_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** Alpha product limit from blueprint 6.2: 30 minutes. */
export const MAX_AUDIO_DURATION_SECONDS = 30 * 60;

/**
 * Phase 0 handles a single input category at a time. A Telegram update carrying
 * more than one of these is ambiguous and is not accepted. See
 * docs/ADR/0003-ingestion-contract.md.
 */
export const SUPPORTED_MESSAGE_CONTENT = ["text", "voice", "audio", "photo", "document"] as const;

export type SupportedMessageContent = (typeof SUPPORTED_MESSAGE_CONTENT)[number];
