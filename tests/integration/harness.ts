import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AcceptedMessage,
  classifyUpdate,
} from "../../supabase/functions/_shared/telegram/parse-update.ts";
import { TelegramUpdateSchema } from "../../supabase/functions/_shared/telegram/schema.ts";
import {
  clientWithKey,
  SYNTHETIC_ID_FLOOR,
  targetHost,
  TEST_SUPABASE_URL,
  TEST_TARGET_ENABLED,
  testTargetClient,
} from "../../scripts/lib/test-target.ts";

/**
 * The integration suite's connection to a real database.
 *
 * These tests are the only ones that touch a real Supabase project. The rules
 * that make that safe — which variables name the target, the production guard,
 * the reserved identifier range — are defined in scripts/lib/test-target.ts and
 * re-exported here, because scripts/clear-test-data.ts deletes the rows this
 * suite writes and must be held to exactly the same rules.
 *
 * When no target is configured the suite is *ignored* rather than failed. The
 * unit, contract and security suites run anywhere and prove most of Phase 0; the
 * integration suite is the part that needs a database, and a developer without
 * one should still be able to run everything else and see it pass.
 */

export { clientWithKey, SYNTHETIC_ID_FLOOR, targetHost, TEST_SUPABASE_URL };

/** Whether a target is configured. `false` means every test in the suite is ignored. */
export const ENABLED: boolean = TEST_TARGET_ENABLED;

/** A service-role client for the test project. Throws when no target is configured. */
export function serviceClient(): SupabaseClient {
  return testTargetClient();
}

// --- Reserved identifiers --------------------------------------------------

/**
 * A counter, seeded from the clock, giving each run its own identifier block.
 *
 * Uniqueness across runs is what makes the suite repeatable: every run creates
 * genuinely new updates, which means "a first delivery creates one job" is
 * exercised on a first delivery every time rather than on a replay from the
 * previous run. It also means the cleanup script can tell one run's data from
 * another's if it ever needs to.
 */
let counter = (Date.now() % 1_000_000_000) * 1_000;

/** The next identifier. Called once per distinct real-world value. */
export function nextId(): number {
  counter += 1;
  return SYNTHETIC_ID_FLOOR + counter;
}

// --- Messages --------------------------------------------------------------

/**
 * Turn a fixture into the message the ingestion path would have produced.
 *
 * The real classifier, not a hand-built object: if routing or the schema changed
 * such that a fixture was no longer accepted, that should fail these tests rather
 * than be papered over.
 */
export function acceptedMessage(update: Record<string, unknown>): AcceptedMessage {
  const parsed = TelegramUpdateSchema.safeParse(update);
  if (!parsed.success) {
    throw new Error(`the fixture is not a valid update: ${JSON.stringify(parsed.error.issues)}`);
  }

  const classification = classifyUpdate(parsed.data);
  if (classification.kind !== "accepted") {
    throw new Error(`the fixture was not accepted: ${classification.reason}`);
  }

  return classification.message;
}

/** A digest of the sort the handler passes. Not a secret; the input is synthetic. */
export async function syntheticDigest(label: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(label));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
