/**
 * Hashing primitives.
 *
 * Kept separate from the redaction module, which uses SHA-256 for a different
 * purpose (producing non-reversible correlation digests) but should not own the
 * primitive itself.
 */

/**
 * The SHA-256 digest of a string, as lower-case hex.
 *
 * Used for the webhook payload digest, which is stored alongside a Telegram
 * `update_id` so that a replay carrying different content is detectable. The
 * column has a `^[0-9a-f]{64}$` constraint, so the format here is part of the
 * database contract and not merely a convention.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
