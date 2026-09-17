import { AppError } from "../errors/app-error.ts";

/**
 * The translation layer between PostgreSQL and Notinn's error taxonomy.
 *
 * Extracted from `ingestion.repository.ts` when Phase 1 added a second
 * repository. Both need the same two functions and the same retryability
 * argument, and the argument is about the database boundary rather than about
 * ingestion or notes — so a copy per repository would be a decision duplicated,
 * which is how two copies come to disagree.
 *
 * The rule these enforce is the project's: an error never crosses a boundary as
 * a bare `Error`. It becomes an `AppError` with a code, a retryability verdict
 * and a message safe to log.
 */

/** The error shape PostgREST and PostgreSQL produce. */
export interface PostgresErrorLike {
  readonly code?: string | null;
  readonly message?: string | null;
  readonly details?: string | null;
  readonly hint?: string | null;
}

/**
 * Translate a database failure into the error taxonomy.
 *
 * The retryable verdict is decided by SQLSTATE class rather than by "a database
 * call failed", because one class demands the opposite response from all the
 * others:
 *
 *   * Class 23 is an integrity constraint violation. It is deterministic — the
 *     same statement against the same data will violate the same constraint — so
 *     a retry is pure waste. It also means something is wrong that a retry
 *     cannot fix: a routing table naming a template that does not exist, or a
 *     state transition the guard rejected. It is classified as internal because
 *     it is a bug, and it is logged at error level so it is noticed.
 *
 *   * Everything else is treated as transient, including class 08 (connection),
 *     40 (transaction rollback) and 57 (operator intervention). Guessing
 *     "retryable" when wrong costs a duplicate delivery, which update_id
 *     deduplication absorbs; guessing "not retryable" when wrong loses a user's
 *     note. The asymmetry decides it.
 */
export function classifyPostgresError(error: PostgresErrorLike): AppError {
  const code = error.code ?? "";
  const detail = `postgres ${code || "(no code)"}: ${error.message ?? "(no message)"}`;

  if (code.startsWith("23")) {
    return AppError.internal(detail);
  }

  return AppError.database(detail);
}

/**
 * Translate a thrown value from the client into the error taxonomy.
 *
 * The timeout branch is not incidental: `createServiceClient` arms an
 * `AbortSignal.timeout` on every request, so a database that is slow rather than
 * broken arrives here as a `TimeoutError` and must be read as transient. Letting
 * it fall through to the generic branch would still be retryable, but the message
 * would say "database call failed" about a call that merely took too long, which
 * is the difference between a useful log line and a misleading one.
 */
export function toDatabaseError(thrown: unknown): AppError {
  if (thrown instanceof Error && (thrown.name === "TimeoutError" || thrown.name === "AbortError")) {
    return AppError.database("database request exceeded its timeout", thrown);
  }
  if (thrown instanceof AppError) return thrown;
  return AppError.database("database call failed", thrown);
}
