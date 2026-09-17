import { AppError } from "../errors/app-error.ts";
import type { Secret } from "../config/env.ts";
import { TELEGRAM_SECRET_HEADER } from "../config/constants.ts";

/**
 * Constant-time comparison.
 *
 * A naive `a === b` on strings returns as soon as it finds a differing
 * character, so the time it takes reveals how many leading characters were
 * correct. An attacker who can measure that can recover a secret one character
 * at a time, which turns an infeasible search into a linear one.
 *
 * This implementation hashes both inputs with SHA-256 before comparing, which
 * buys a property that a plain byte-wise loop does not: the comparison always
 * runs over exactly 32 bytes, so the length of the secret is not leaked either.
 * A loop over raw bytes would still need equal-length inputs to be truly
 * constant-time, and equalising them by padding leaks the length instead.
 *
 * Hashing first does not weaken the check. SHA-256 is collision-resistant, so
 * two inputs producing the same digest are the same input for any practical
 * purpose.
 */

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

/**
 * Compare two strings without leaking, through timing, where they differ.
 *
 * Always hashes both inputs, even when one is obviously empty, so that the work
 * performed does not depend on either value.
 */
export async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256(a), sha256(b)]);

  let difference = 0;
  for (let index = 0; index < digestA.length; index += 1) {
    // Both digests are 32 bytes, so these indices are always in range.
    difference |= (digestA[index] as number) ^ (digestB[index] as number);
  }

  return difference === 0;
}

export interface WebhookSecretCheck {
  readonly ok: boolean;
  /** Why the check failed. Safe to log; contains no part of either secret. */
  readonly reason: "ok" | "missing_header" | "mismatch";
}

/**
 * Check the secret token Telegram echoes back on every webhook delivery.
 *
 * Telegram sends the value configured at registration time in
 * `X-Telegram-Bot-Api-Secret-Token`. Comparing it is the only thing that
 * distinguishes a genuine delivery from anyone who has learned the function URL.
 *
 * A missing header and a wrong header are distinguished internally because they
 * indicate different problems — a misconfigured registration versus a hostile
 * caller — but they produce the same outward response.
 */
export async function checkWebhookSecret(
  request: Request,
  expected: Secret,
): Promise<WebhookSecretCheck> {
  const presented = request.headers.get(TELEGRAM_SECRET_HEADER);

  if (presented === null || presented === "") {
    return { ok: false, reason: "missing_header" };
  }

  const matches = await constantTimeEquals(presented, expected.reveal());
  return matches ? { ok: true, reason: "ok" } : { ok: false, reason: "mismatch" };
}

/**
 * Enforce the secret check, throwing a classified error on failure.
 *
 * Throws rather than returning a boolean so a caller cannot forget to check the
 * result. The thrown error carries a reason for operators and a generic public
 * message for everyone else.
 */
export async function assertWebhookSecret(request: Request, expected: Secret): Promise<void> {
  const result = await checkWebhookSecret(request, expected);

  if (!result.ok) {
    throw AppError.unauthorized(`webhook secret check failed: ${result.reason}`);
  }
}
