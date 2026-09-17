import { AppError } from "./app-error.ts";
import { ERROR_CODES } from "./taxonomy.ts";

/**
 * HTTP responses for the webhook endpoint.
 *
 * The status code is the entire feedback channel to Telegram: a 2xx means "done,
 * do not send this again", anything else means "try again later". Choosing it
 * correctly is therefore load-bearing, and the rule is derived from the error
 * taxonomy rather than decided case by case:
 *
 *   * RETRYABLE errors answer 5xx. Telegram redelivers, and redelivery is safe
 *     because update_id deduplication makes the second attempt a no-op. This is
 *     what turns a transient database failure into a note that arrives a minute
 *     late instead of a note that never arrives.
 *
 *   * NON-RETRYABLE errors answer 200. Redelivering a payload that failed to
 *     parse will fail to parse again, so retrying only multiplies the failure.
 *     The error is logged at error level, which is the actual alerting path.
 *
 *   * UNAUTHORIZED always answers 401. A caller who does not hold the webhook
 *     secret is not Telegram and gets no useful signal back.
 *
 * The body is deliberately empty on every non-success. Blueprint 17.1 requires
 * that the endpoint never expose job internals or provider errors to its caller,
 * and an empty body cannot.
 */

export interface JsonResponseInit {
  readonly status?: number;
  readonly headers?: Record<string, string>;
}

/** A JSON response with no-store caching, which webhooks must never have. */
export function jsonResponse(body: unknown, init: JsonResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

/** An empty response. Used for every non-success path. */
export function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * The success acknowledgement (blueprint 17.1).
 *
 * Returns no job id, no state and no timing. The caller learns only that the
 * delivery was accepted, which is all Telegram needs and all it should have.
 */
export function acceptedResponse(): Response {
  return jsonResponse({ ok: true });
}

/** Map an error to the HTTP status Telegram should receive. */
export function httpStatusForError(error: AppError): number {
  if (error.code === ERROR_CODES.UNAUTHORIZED) return 401;
  return error.retryable ? 500 : 200;
}

/** The response for a failed delivery. */
export function errorResponse(error: AppError): Response {
  // A 2xx must not carry a body claiming failure, and a 5xx must not carry a
  // body claiming success. Both are empty, so there is one path.
  return emptyResponse(httpStatusForError(error));
}
