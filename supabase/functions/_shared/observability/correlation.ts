/**
 * Correlation identifiers.
 *
 * Every log line in a request carries the same `request_id`, so that a note's
 * whole journey can be reconstructed from a log search without any single line
 * having to contain anything sensitive.
 */

/** A conservative shape for an inbound request id: hex, dashes, short. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Header an upstream caller may use to supply its own correlation id. */
export const REQUEST_ID_HEADER = "x-request-id";

/** A fresh correlation id for a request that arrived without one. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Take the caller's correlation id when it is safe to do so.
 *
 * An inbound header is untrusted input that ends up in every log line for the
 * request, which makes it a log-injection vector and, if unbounded, a way to
 * bloat log storage. Anything that does not match a strict pattern is discarded
 * in favour of a generated id rather than sanitised, because a mangled
 * correlation id is worse than a fresh one.
 */
export function resolveRequestId(request: Request): string {
  const supplied = request.headers.get(REQUEST_ID_HEADER);
  if (supplied !== null && REQUEST_ID_PATTERN.test(supplied)) {
    return supplied;
  }
  return newRequestId();
}
