/**
 * Project-reference safety guard.
 *
 * Extracts the Supabase project reference from a URL and optionally compares
 * it against the `NOTINN_PROJECT_REF` environment variable. Prevents the most
 * costly operational mistake: running a development tool against a production
 * database, or vice versa.
 */

/**
 * Parse the project reference out of a Supabase URL.
 *
 * Supabase encodes the project reference as the first subdomain segment:
 * `https://neqfilxouhowuyynntdh.supabase.co` → `neqfilxouhowuyynntdh`.
 */
export function extractProjectRef(supabaseUrl: string): string {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const firstSegment = hostname.split(".")[0];
    if (firstSegment === undefined || firstSegment === "") {
      throw new Error("empty project reference");
    }
    return firstSegment;
  } catch {
    throw new Error(`cannot extract project reference from URL: ${supabaseUrl}`);
  }
}

/**
 * Assert that `NOTINN_PROJECT_REF` matches the deployment target.
 *
 * - If `NOTINN_PROJECT_REF` is not set, logs a warning and proceeds.
 * - If it is set but mismatches, throws with both values.
 * - If it matches, returns silently.
 *
 * @returns The extracted project reference for display purposes.
 */
export function assertProjectRef(supabaseUrl: string): string {
  const ref = extractProjectRef(supabaseUrl);
  const expected = Deno.env.get("NOTINN_PROJECT_REF");

  if (expected === undefined || expected.trim() === "") {
    console.warn(
      `warning: NOTINN_PROJECT_REF is not set. Target: ${ref}. ` +
        `Set NOTINN_PROJECT_REF to guard against accidental cross-project operations.`,
    );
    return ref;
  }

  if (ref !== expected) {
    throw new Error(
      `NOTINN_PROJECT_REF mismatch: expected ${expected}, but SUPABASE_URL points to ${ref}. ` +
        `Refusing to proceed to prevent cross-project operations.`,
    );
  }

  return ref;
}
