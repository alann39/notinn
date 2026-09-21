import type { LogLevel } from "../observability/levels.ts";
import { definitionFor, ERROR_CODES, type ErrorCode } from "./taxonomy.ts";

/**
 * The single error type the application throws.
 *
 * The safety property that matters here is in the constructor: `message` is set
 * to the taxonomy's public sentence, never to the internal detail. That means a
 * careless `console.log(err)`, `err.message` or `String(err)` anywhere in the
 * codebase cannot leak an upstream response, a database constraint violation or
 * a fragment of user content. The real detail is reachable, but only by asking
 * for it explicitly via `internalDetail`.
 *
 * `internalDetail` is SENSITIVE. A PostgreSQL error message can quote the value
 * that violated a constraint, which may be user content. It is never sent to a
 * user, and the logger passes it through redaction before writing it.
 */
export class AppError extends Error {
  override readonly name = "AppError";

  /** Stable machine-readable code from the taxonomy. */
  readonly code: ErrorCode;
  /** Whether retrying the same operation could plausibly succeed. */
  readonly retryable: boolean;
  /** HTTP status when this error crosses an HTTP boundary. */
  readonly httpStatus: number;
  /** The exact sentence a user may be shown. Always safe. */
  readonly publicMessage: string;
  /** Operator severity. */
  readonly logLevel: LogLevel;

  /**
   * SENSITIVE. Never shown to a user. Redacted before it reaches a log sink.
   *
   * Declared rather than initialised as a field so that the constructor can
   * install it as a non-enumerable property. See the comment there.
   */
  declare readonly internalDetail: string | undefined;

  constructor(
    code: ErrorCode,
    options: { internalDetail?: string; cause?: unknown } = {},
  ) {
    const definition = definitionFor(code);

    super(
      definition.publicMessage,
      options.cause === undefined ? undefined : { cause: options.cause },
    );

    this.code = code;
    this.retryable = definition.retryable;
    this.httpStatus = definition.httpStatus;
    this.publicMessage = definition.publicMessage;
    this.logLevel = definition.logLevel;

    // Installed as non-enumerable. `JSON.stringify(error)`, `{ ...error }`,
    // `Object.assign` and structured clone all walk enumerable own properties,
    // so an enumerable internalDetail would ride along into a crash report or a
    // log line that serialises the error object as a whole — which is precisely
    // the accident the rest of this class is arranged to prevent. A PostgreSQL
    // message can quote the value that violated a constraint, and that value can
    // be user content.
    //
    // Reading `error.internalDetail` explicitly is unaffected, so the operator
    // path that needs it still has it.
    Object.defineProperty(this, "internalDetail", {
      value: options.internalDetail,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  // --- Factories -----------------------------------------------------------
  //
  // These exist so call sites read as intent ("the payload was malformed")
  // rather than as taxonomy plumbing. Each takes an internal detail that an
  // operator will want and a user never will.

  /** The payload or arguments were malformed. */
  static validation(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, { internalDetail, cause });
  }

  /** Input is well-formed but unsupported. */
  static unsupportedInput(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.UNSUPPORTED_INPUT, { internalDetail });
  }

  /** Input exceeds a documented limit. */
  static inputTooLarge(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.INPUT_TOO_LARGE, { internalDetail });
  }

  /** Text exceeds blueprint 5.1's pasted-text limit. */
  static inputTooLong(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.INPUT_TOO_LONG, { internalDetail });
  }

  /** Telegram no longer has the upload referenced by the queued job. */
  static fileUnavailable(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.FILE_UNAVAILABLE, { internalDetail, cause });
  }

  /** A webhook request did not carry a valid secret. */
  static unauthorized(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.UNAUTHORIZED, { internalDetail });
  }

  /** The account exists but may not act. */
  static userNotActive(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.USER_NOT_ACTIVE, { internalDetail });
  }

  /** Another equivalent operation is already consuming the current capacity. */
  static rateLimited(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.RATE_LIMITED, { internalDetail });
  }

  /** The active plan has no remaining allowance for this operation. */
  static quotaExceeded(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.QUOTA_EXCEEDED, { internalDetail });
  }

  /** The active plan has no remaining daily allowance for this operation. */
  static dailyQuotaExceeded(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.DAILY_QUOTA_EXCEEDED, { internalDetail });
  }

  /** The durable worker has used every configured attempt. */
  static retriesExhausted(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.RETRIES_EXHAUSTED, { internalDetail });
  }

  // --- Upstream and pipeline ----------------------------------------------
  //
  // The provider and delivery codes are added here in Phase 1 because that is
  // when the first code that can throw them arrives. An unused factory would be a
  // claim about the future; the taxonomy above already carries the codes.

  /** The provider refused the call. `internalDetail` carries the status only. */
  static providerError(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.PROVIDER_ERROR, { internalDetail, cause });
  }

  /** The provider did not answer within the budget. */
  static providerTimeout(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.PROVIDER_TIMEOUT, { internalDetail, cause });
  }

  /** The provider refused for rate-limit reasons. */
  static providerRateLimited(internalDetail?: string): AppError {
    return new AppError(ERROR_CODES.PROVIDER_RATE_LIMITED, { internalDetail });
  }

  /** The Telegram Bot API refused a call. */
  static telegramError(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.TELEGRAM_ERROR, { internalDetail, cause });
  }

  /** The provider answered without producing a usable note. */
  static generationFailed(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.GENERATION_FAILED, { internalDetail, cause });
  }

  /** The provider's answer did not satisfy the structured-note schema. */
  static outputValidationFailed(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.OUTPUT_VALIDATION_FAILED, { internalDetail, cause });
  }

  /** The note exists but the user never received it. */
  static deliveryFailed(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.DELIVERY_FAILED, { internalDetail, cause });
  }

  /** The process is misconfigured. */
  static configuration(internalDetail: string): AppError {
    return new AppError(ERROR_CODES.CONFIGURATION_ERROR, { internalDetail });
  }

  /** The database refused an operation. */
  static database(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.DATABASE_ERROR, { internalDetail, cause });
  }

  /** A bug. */
  static internal(internalDetail?: string, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.INTERNAL_ERROR, { internalDetail, cause });
  }
}

/** Narrow an unknown caught value to an AppError. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Turn anything that was thrown into an AppError.
 *
 * An already-classified error passes through untouched. Everything else becomes
 * INTERNAL_ERROR carrying the original's `name` and `message` as internal
 * detail, which is where an unexpected library error lands. Because
 * `internalDetail` never reaches a user, this is safe even when the original
 * message contains arbitrary text.
 */
export function toAppError(thrown: unknown): AppError {
  if (isAppError(thrown)) return thrown;

  if (thrown instanceof Error) {
    return AppError.internal(`${thrown.name}: ${thrown.message}`, thrown);
  }

  if (typeof thrown === "string") {
    return AppError.internal(`non-error thrown: ${thrown}`, thrown);
  }

  return AppError.internal("non-error thrown of unknown type", thrown);
}
