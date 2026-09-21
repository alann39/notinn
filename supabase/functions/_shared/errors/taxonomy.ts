import type { LogLevel } from "../observability/levels.ts";

/**
 * The Notinn error taxonomy (blueprint 19.1).
 *
 * Two kinds of error exist and they must never be confused:
 *
 *   * The INTERNAL error, which is what actually happened. It carries a stable
 *     code, a retryability verdict and a log level. It is for operators.
 *
 *   * The PUBLIC error, which is what a user is told. It is a fixed sentence from
 *     `publicMessage` and nothing else. It never quotes an exception, a status
 *     code, a provider name or a stack frame, because all of those leak
 *     implementation detail and none of them help the user.
 *
 * The single most important property of this table is that `publicMessage` is a
 * compile-time constant per code. There is no code path in the application that
 * builds a user-facing string out of an exception, so an upstream message cannot
 * be reflected to a user by accident.
 *
 * Phase 0 defined the taxonomy and its safe messages but delivered none of them,
 * because it had no outbound messaging at all. Phase 1 delivers them: blueprint
 * 16.4's fixed error reply and blueprint 16.3's failure reply are sent by the
 * webhook, always as `publicMessage` and never as anything derived from a thrown
 * value. See docs/ADR/0007-phase-1-scope.md.
 */

export const ERROR_CODES = {
  // --- Caller and input ----------------------------------------------------
  /** The request, payload or argument shape was not acceptable. */
  VALIDATION_FAILED: "validation_failed",
  /** Input is well-formed but Notinn does not handle this kind of input. */
  UNSUPPORTED_INPUT: "unsupported_input",
  /** Input is a supported kind but exceeds a documented size or duration limit. */
  INPUT_TOO_LARGE: "input_too_large",
  /**
   * Text input exceeds blueprint 5.1's pasted-text limit.
   *
   * Distinct from INPUT_TOO_LARGE, which is about a file. The two are separated
   * because the user's remedy differs — split the note, or send a smaller file —
   * and because "a user pasted 80,000 characters" is a different signal to an
   * operator than "a user uploaded a 40 MB PDF".
   */
  INPUT_TOO_LONG: "input_too_long",
  /** Telegram no longer has the referenced upload; the user must resend it. */
  FILE_UNAVAILABLE: "file_unavailable",
  /** The Telegram update was addressed to something other than a private chat. */
  NON_PRIVATE_CHAT: "non_private_chat",

  // --- Authentication and authorisation ------------------------------------
  /** A webhook request did not carry a valid secret. */
  UNAUTHORIZED: "unauthorized",

  // --- Account state -------------------------------------------------------
  /** The user exists but is blocked, deletion-pending or deleted. */
  USER_NOT_ACTIVE: "user_not_active",

  // --- Limits --------------------------------------------------------------
  /** Too many requests in too short a window. Retryable after a delay. */
  RATE_LIMITED: "rate_limited",
  /** The user's plan quota for this operation is exhausted. Not retryable. */
  QUOTA_EXCEEDED: "quota_exceeded",
  /** The user's UTC-day allowance is exhausted. */
  DAILY_QUOTA_EXCEEDED: "daily_quota_exceeded",
  /** A durable job reached its configured maximum attempts. */
  RETRIES_EXHAUSTED: "retries_exhausted",

  // --- Upstream providers --------------------------------------------------
  /** Gemini returned an error. Retryable only for the subsets we classify. */
  PROVIDER_ERROR: "provider_error",
  /** Gemini did not answer within the configured budget. */
  PROVIDER_TIMEOUT: "provider_timeout",
  /** Gemini refused for rate-limit reasons. Retryable after a delay. */
  PROVIDER_RATE_LIMITED: "provider_rate_limited",
  /** The Telegram Bot API refused a call. */
  TELEGRAM_ERROR: "telegram_error",

  // --- Generation and delivery ---------------------------------------------
  /** The provider answered, and the answer was not a usable note. */
  GENERATION_FAILED: "generation_failed",
  /** The provider produced something that failed validation against the schema. */
  OUTPUT_VALIDATION_FAILED: "output_validation_failed",
  /**
   * The note was generated and stored, but the user never received it.
   *
   * Not the same error as TELEGRAM_ERROR even though the underlying failure is
   * usually the same Bot API call. This one means a note exists that its owner has
   * never seen, which is a state an operator has to reconcile; TELEGRAM_ERROR means
   * a call failed, which for a callback answer or a group refusal loses nothing.
   * They are separated so that alerting can be about lost notes rather than about
   * failed calls.
   */
  DELIVERY_FAILED: "delivery_failed",

  // --- Infrastructure ------------------------------------------------------
  /** Object storage refused an operation. */
  STORAGE_ERROR: "storage_error",
  /** The database refused an operation. */
  DATABASE_ERROR: "database_error",

  // --- Internal ------------------------------------------------------------
  /** The process is misconfigured. Always an operator problem, never a user's. */
  CONFIGURATION_ERROR: "configuration_error",
  /** A bug. The catch-all that should trend towards zero. */
  INTERNAL_ERROR: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorDefinition {
  /** HTTP status used when this error crosses an HTTP boundary. */
  readonly httpStatus: number;
  /**
   * Whether retrying the same operation could plausibly succeed.
   *
   * This drives the job state machine: a retryable failure moves a job to
   * RETRYABLE_FAILED, a non-retryable one to FAILED (blueprint 14).
   */
  readonly retryable: boolean;
  /**
   * The exact sentence a user may be shown. Constant, safe, and deliberately
   * free of any detail that varies per occurrence.
   */
  readonly publicMessage: string;
  /** Severity for operators. */
  readonly logLevel: LogLevel;
}

const DEFINITIONS: Readonly<Record<ErrorCode, ErrorDefinition>> = {
  [ERROR_CODES.VALIDATION_FAILED]: {
    httpStatus: 400,
    retryable: false,
    publicMessage: "That didn't look like something I can save. Please try again.",
    logLevel: "warn",
  },
  [ERROR_CODES.UNSUPPORTED_INPUT]: {
    httpStatus: 415,
    retryable: false,
    publicMessage:
      "I can't read that kind of file yet. Try text, a voice note, an image, a PDF, or a document.",
    logLevel: "info",
  },
  [ERROR_CODES.INPUT_TOO_LARGE]: {
    httpStatus: 413,
    retryable: false,
    publicMessage: "That's too large for me to process. Try a smaller file or a shorter note.",
    logLevel: "info",
  },
  [ERROR_CODES.INPUT_TOO_LONG]: {
    httpStatus: 413,
    retryable: false,
    publicMessage: "That's longer than I can take in one note. Try sending it in two parts.",
    logLevel: "info",
  },
  [ERROR_CODES.FILE_UNAVAILABLE]: {
    httpStatus: 410,
    retryable: false,
    publicMessage: "I can't retrieve that file anymore. Please send it again.",
    logLevel: "info",
  },
  [ERROR_CODES.NON_PRIVATE_CHAT]: {
    httpStatus: 403,
    retryable: false,
    // Delivered once per chat, by the first message of that chat to be ignored,
    // never once per message. The claim is taken by
    // claim_rejected_chat_reply() before the send, so two messages arriving
    // together produce one refusal rather than two. See
    // docs/ADR/0001-blueprint-deviations.md §3.
    publicMessage: "I only work in private chats for now.",
    logLevel: "info",
  },

  [ERROR_CODES.UNAUTHORIZED]: {
    httpStatus: 401,
    retryable: false,
    // Never shown to a user: this is a request-level rejection.
    publicMessage: "Not authorized.",
    logLevel: "warn",
  },

  [ERROR_CODES.USER_NOT_ACTIVE]: {
    httpStatus: 403,
    retryable: false,
    publicMessage: "This account can't save notes right now.",
    logLevel: "warn",
  },

  [ERROR_CODES.RATE_LIMITED]: {
    httpStatus: 429,
    retryable: true,
    publicMessage: "You're sending notes faster than I can save them. Give me a moment.",
    logLevel: "info",
  },
  [ERROR_CODES.QUOTA_EXCEEDED]: {
    httpStatus: 402,
    retryable: false,
    publicMessage: "You've reached your plan's limit for this month.",
    logLevel: "info",
  },
  [ERROR_CODES.DAILY_QUOTA_EXCEEDED]: {
    httpStatus: 402,
    retryable: false,
    publicMessage: "You've reached your plan's limit for today. It resets at 00:00 UTC.",
    logLevel: "info",
  },
  [ERROR_CODES.RETRIES_EXHAUSTED]: {
    httpStatus: 500,
    retryable: false,
    publicMessage: "I couldn't finish that note after several tries. Please send it again.",
    logLevel: "error",
  },

  [ERROR_CODES.PROVIDER_ERROR]: {
    httpStatus: 502,
    retryable: true,
    publicMessage: "I couldn't finish that note. I'll try again shortly.",
    logLevel: "error",
  },
  [ERROR_CODES.PROVIDER_TIMEOUT]: {
    httpStatus: 504,
    retryable: true,
    publicMessage: "That took longer than expected. I'll try again shortly.",
    logLevel: "warn",
  },
  [ERROR_CODES.PROVIDER_RATE_LIMITED]: {
    httpStatus: 503,
    retryable: true,
    publicMessage:
      "I'm a little busy right now. I'll retry automatically in about 5 minutes—no need to send it again.",
    logLevel: "warn",
  },
  [ERROR_CODES.TELEGRAM_ERROR]: {
    httpStatus: 502,
    retryable: true,
    publicMessage: "Something went wrong sending that back to you. I'll try again shortly.",
    logLevel: "error",
  },

  [ERROR_CODES.GENERATION_FAILED]: {
    httpStatus: 502,
    retryable: true,
    publicMessage: "I couldn't turn that into a note. I'll try again shortly.",
    logLevel: "error",
  },
  [ERROR_CODES.OUTPUT_VALIDATION_FAILED]: {
    httpStatus: 502,
    retryable: true,
    // The same sentence as GENERATION_FAILED, deliberately. To a user these are
    // one event — no note arrived — and a second wording would imply a difference
    // they cannot see or act on. The two codes exist for the log, where "the model
    // returned prose" and "the model returned the wrong shape" lead to different
    // fixes.
    publicMessage: "I couldn't turn that into a note. I'll try again shortly.",
    logLevel: "error",
  },
  [ERROR_CODES.DELIVERY_FAILED]: {
    httpStatus: 502,
    retryable: true,
    publicMessage: "I finished that note but couldn't send it back. I'll try again shortly.",
    logLevel: "error",
  },

  [ERROR_CODES.STORAGE_ERROR]: {
    httpStatus: 502,
    retryable: true,
    publicMessage: "I couldn't read that file. I'll try again shortly.",
    logLevel: "error",
  },
  [ERROR_CODES.DATABASE_ERROR]: {
    httpStatus: 500,
    retryable: true,
    publicMessage: "Something went wrong on my side. I'll try again shortly.",
    logLevel: "error",
  },

  [ERROR_CODES.CONFIGURATION_ERROR]: {
    httpStatus: 500,
    retryable: false,
    publicMessage: "I'm not set up correctly right now.",
    logLevel: "error",
  },
  [ERROR_CODES.INTERNAL_ERROR]: {
    httpStatus: 500,
    retryable: false,
    publicMessage: "Something went wrong on my side.",
    logLevel: "error",
  },
};

/**
 * Look up the definition for a code.
 *
 * Total by construction: the table is keyed by `ErrorCode` and TypeScript
 * requires every member, so adding a code without its definition — or its safe
 * public sentence — is a compile error rather than a runtime surprise.
 */
export function definitionFor(code: ErrorCode): ErrorDefinition {
  return DEFINITIONS[code];
}

/** Every code in the taxonomy. Used by the tests to prove total coverage. */
export function allErrorCodes(): readonly ErrorCode[] {
  return Object.values(ERROR_CODES);
}
