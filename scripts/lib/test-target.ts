import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Which database the development tooling is allowed to touch.
 *
 * Two tools ask this question — the integration suite, which writes rows, and
 * scripts/clear-test-data.ts, which deletes them — and they must answer it
 * identically. A cleanup script with a weaker guard than the suite it cleans up
 * after is the more dangerous of the two, so the answer lives in one place and
 * both import it.
 *
 * The design is a variable-name trick, and it is the load-bearing part:
 *
 *   * The target is read from `NOTINN_TEST_SUPABASE_URL` and
 *     `NOTINN_TEST_SERVICE_ROLE_KEY`. Neither name appears anywhere in the
 *     application, so a test run cannot inherit the credentials that happen to
 *     be exported for the function. Pointing these at production requires
 *     deliberately typing a production URL into a variable named "test".
 *
 *   * `NOTINN_ENV=production` in the same environment aborts outright. That is
 *     the shape of the mistake that matters: sourcing a production env file and
 *     then running the tooling. It costs three lines to rule out.
 *
 * The reserved identifier range lives here too, because it is the other half of
 * the same contract: the suite only writes rows above the floor, and the cleanup
 * script only deletes rows above the floor, so neither has to trust the other.
 */

/** Reads an environment variable, treating blank as absent. */
function env(name: string): string | null {
  const value = Deno.env.get(name);
  return value === undefined || value.trim() === "" ? null : value.trim();
}

export const TEST_SUPABASE_URL: string | null = env("NOTINN_TEST_SUPABASE_URL");
export const TEST_SERVICE_ROLE_KEY: string | null = env("NOTINN_TEST_SERVICE_ROLE_KEY");

/**
 * Refuse to run against an environment that has declared itself production.
 *
 * Called at import rather than inside a function, so a misconfigured run fails
 * while loading and stops before a single row is read or written.
 */
export function assertNotProduction(): void {
  if (env("NOTINN_ENV") === "production") {
    throw new Error(
      "NOTINN_ENV=production is set. This tooling writes and deletes rows and must not " +
        "run against production. Unset it, or run the unit, contract and security suites instead.",
    );
  }
}

assertNotProduction();

if (TEST_SUPABASE_URL !== null && TEST_SERVICE_ROLE_KEY === null) {
  throw new Error("NOTINN_TEST_SUPABASE_URL is set but NOTINN_TEST_SERVICE_ROLE_KEY is not.");
}

if (TEST_SUPABASE_URL === null && TEST_SERVICE_ROLE_KEY !== null) {
  throw new Error("NOTINN_TEST_SERVICE_ROLE_KEY is set but NOTINN_TEST_SUPABASE_URL is not.");
}

/** Whether a target is configured. `false` means the tools have nothing to do. */
export const TEST_TARGET_ENABLED: boolean = TEST_SUPABASE_URL !== null &&
  TEST_SERVICE_ROLE_KEY !== null;

/**
 * Identifier ranges reserved for synthetic data.
 *
 * Telegram's real update and chat ids are far smaller than this, so a value in
 * these ranges cannot be mistaken for production traffic, and a row that escaped
 * a run is identifiable on sight.
 *
 * Stated as a rule rather than a convention: the suite never writes below it and
 * the cleanup script never deletes below it. Neither needs to trust the other.
 */
export const SYNTHETIC_ID_FLOOR = 4_000_000_000_000;

/** The project host, for a message that names the target without a credential. */
export function targetHost(): string {
  if (TEST_SUPABASE_URL === null) return "(unset)";
  try {
    return new URL(TEST_SUPABASE_URL).host;
  } catch {
    return "(unparseable)";
  }
}

/** A service-role client for the test project. Throws when no target is configured. */
export function testTargetClient(): SupabaseClient {
  if (TEST_SUPABASE_URL === null || TEST_SERVICE_ROLE_KEY === null) {
    throw new Error("no test target is configured");
  }

  return createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A publishable-key client, for the checks that prove row level security denies it. */
export function clientWithKey(key: string): SupabaseClient {
  if (TEST_SUPABASE_URL === null) throw new Error("no test target is configured");

  return createClient(TEST_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
