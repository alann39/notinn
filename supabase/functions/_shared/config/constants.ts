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

/**
 * Phase 0 handles a single input category at a time. A Telegram update carrying
 * more than one of these is ambiguous and is not accepted. See
 * docs/ADR/0003-ingestion-contract.md.
 */
export const SUPPORTED_MESSAGE_CONTENT = ["text", "voice", "audio", "photo", "document"] as const;

export type SupportedMessageContent = (typeof SUPPORTED_MESSAGE_CONTENT)[number];
