import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertNotProduction,
  SYNTHETIC_ID_FLOOR,
  targetHost,
  TEST_TARGET_ENABLED,
  testTargetClient,
} from "./lib/test-target.ts";
import { requireConfirmation } from "./lib/prompt.ts";

/**
 * Remove the rows the test suites wrote.
 *
 * Run with `deno task clear-test-data`.
 *
 * The suites deliberately never delete anything. A test that cleaned up after
 * itself would be a test whose cleanup could mask a failure, and a delete
 * scattered through an assertion is a delete nobody reviews. So the rows stay,
 * and this is the one place they are removed — where the deletion is the whole
 * purpose of the program and can be read in one sitting.
 *
 * Three things make it safe:
 *
 *   1. It targets the same database as the integration suite, resolved by the
 *      same rules in scripts/lib/test-target.ts. Running it against production
 *      requires deliberately setting a variable named "test" to a production URL
 *      and unsetting NOTINN_ENV, which the loader additionally refuses.
 *
 *   2. It only ever touches rows in the reserved identifier range. That is a
 *      range boundary rather than a filter that could be edited by mistake: a
 *      real Telegram id is many orders of magnitude below the floor.
 *
 *   3. It counts everything first and asks before deleting. `--yes` approves
 *      non-interactively, for scripted use.
 *
 * It reports what it found before it removes anything, so a run against the
 * wrong project is visible in the output rather than in the aftermath.
 */

/**
 * The tables that can hold synthetic rows, ordered child-first.
 *
 * Deleting a child explicitly rather than relying on a cascade means a foreign
 * key that refuses the delete is reported before anything else has been removed.
 */
const TABLES = [
  "note_outputs",
  "notes",
  "usage_events",
  "user_preferences",
  "processing_jobs",
  "templates",
  "telegram_updates",
  "users",
] as const;

type Table = (typeof TABLES)[number];

/**
 * How to select the synthetic rows of one table.
 *
 * `range` compares the column against the reserved floor directly, for the two
 * tables that *are* the range: `users.telegram_user_id` and
 * `telegram_updates.update_id` hold the Telegram identifiers the floor was
 * reserved for. Every other table is reached through a foreign key to a
 * synthetic row, resolved from the live table rather than recomputed.
 *
 * `null` means there is nothing to select — no synthetic users exist, so the
 * dependent tables have no synthetic rows. An `in ()` with an empty list matches
 * nothing and PostgREST rejects it, so this is checked rather than queried.
 */
type Scope =
  | { kind: "range"; column: string }
  | { kind: "in"; column: string; values: string[] };

/** The filter for one table, or null when no synthetic rows can exist. */
function scopeFor(table: Table, userIds: string[], noteIds: string[]): Scope | null {
  switch (table) {
    case "users":
      return { kind: "range", column: "telegram_user_id" };
    case "telegram_updates":
      // Scoped by the update id, not by user_id: the foreign key to users is
      // ON DELETE SET NULL, so an update row outlives its user and would be
      // missed by a join through it.
      return { kind: "range", column: "update_id" };
    case "note_outputs":
      return noteIds.length === 0 ? null : { kind: "in", column: "note_id", values: noteIds };
    case "templates":
      return userIds.length === 0 ? null : { kind: "in", column: "owner_user_id", values: userIds };
    case "notes":
    case "usage_events":
    case "user_preferences":
    case "processing_jobs":
      return userIds.length === 0 ? null : { kind: "in", column: "user_id", values: userIds };
  }
}

/** Apply a scope to a select or delete builder. */
function apply<T>(query: T, scope: Scope): T {
  return scope.kind === "range"
    ? (query as { gte(column: string, value: number): T }).gte(scope.column, SYNTHETIC_ID_FLOOR)
    : (query as { in(column: string, values: string[]): T }).in(scope.column, scope.values);
}

/** How many rows a table would lose. Counts, but never reads, so no row leaves the database. */
async function countScoped(
  client: SupabaseClient,
  table: Table,
  scope: Scope | null,
): Promise<number> {
  if (scope === null) return 0;

  const query = apply(client.from(table).select("*", { count: "exact", head: true }), scope);
  const { count, error } = await query;

  if (error !== null) throw new Error(`could not count ${table}: ${error.message}`);
  return count ?? 0;
}

/** Delete the rows a table would lose. Same scope as `countScoped`. */
async function deleteScoped(
  client: SupabaseClient,
  table: Table,
  scope: Scope | null,
): Promise<{ error: { message: string } | null }> {
  if (scope === null) return { error: null };

  return await apply(client.from(table).delete(), scope);
}

/**
 * The ids in a table that belong to the given owners.
 *
 * Read from the live table rather than derived, so a note whose owner was
 * removed but whose own row survived is still found.
 */
async function ownedIds(
  client: SupabaseClient,
  table: string,
  column: string,
  owners: string[],
): Promise<string[]> {
  if (owners.length === 0) return [];

  const { data, error } = await client.from(table).select("id").in(column, owners);
  if (error !== null) throw new Error(`could not read ${table}: ${error.message}`);

  return (data ?? []).map((row) => row["id"] as string);
}

async function main(): Promise<void> {
  if (!TEST_TARGET_ENABLED) {
    console.log(
      "No test target is configured. Set NOTINN_TEST_SUPABASE_URL and\n" +
        "NOTINN_TEST_SERVICE_ROLE_KEY to the project the test suites ran against.",
    );
    Deno.exit(1);
  }

  assertNotProduction();

  const client = testTargetClient();
  console.log(`Target: ${targetHost()}\n`);

  const { data: users, error: usersError } = await client
    .from("users")
    .select("id")
    .gte("telegram_user_id", SYNTHETIC_ID_FLOOR);

  if (usersError !== null) throw new Error(`could not read synthetic users: ${usersError.message}`);

  const userIds = (users ?? []).map((row) => row["id"] as string);
  const noteIds = await ownedIds(client, "notes", "user_id", userIds);
  const queueMessageIds: number[] = [];
  if (userIds.length > 0) {
    const { data: jobs, error: jobsError } = await client
      .from("processing_jobs")
      .select("queue_message_id")
      .in("user_id", userIds)
      .not("queue_message_id", "is", null);
    if (jobsError !== null) {
      throw new Error(`could not read synthetic queue ids: ${jobsError.message}`);
    }
    for (const row of jobs ?? []) {
      const id = Number(row["queue_message_id"]);
      if (Number.isSafeInteger(id) && id > 0 && !queueMessageIds.includes(id)) {
        queueMessageIds.push(id);
      }
    }
  }

  // --- Count first, so the operator sees the scope before approving ---------
  const counts: { table: Table; rows: number }[] = [];
  for (const table of TABLES) {
    counts.push({
      table,
      rows: await countScoped(client, table, scopeFor(table, userIds, noteIds)),
    });
  }

  const total = counts.reduce((sum, entry) => sum + entry.rows, 0) + queueMessageIds.length;

  for (const { table, rows } of counts) {
    console.log(`  ${String(rows).padStart(7)}  ${table}`);
  }
  console.log(`  ${String(queueMessageIds.length).padStart(7)}  pgmq messages`);
  console.log(`  ${String(total).padStart(7)}  total\n`);

  if (total === 0) {
    console.log("Nothing to remove.");
    return;
  }

  // --- The one thing that can block a delete ---------------------------------
  //
  // `usage_events.user_id` is ON DELETE RESTRICT by design: usage history is
  // retained for billing after an account is deleted (blueprint 11.3). A
  // synthetic user with usage history therefore cannot be removed at all, and
  // that is reported here — before any other delete has run — rather than
  // surfacing as a half-finished cleanup.
  //
  // Phase 0 writes no usage events, so this fires only if something unexpected
  // has been metering against a synthetic account.
  const usageRows = counts.find((entry) => entry.table === "usage_events")?.rows ?? 0;
  if (usageRows > 0) {
    console.log(
      `Refusing to continue: ${usageRows} usage event(s) reference a synthetic user, and\n` +
        "usage_events is ON DELETE RESTRICT by design. Remove them deliberately, as a separate\n" +
        "operation, once you have confirmed they are synthetic. Nothing has been deleted.",
    );
    Deno.exit(1);
  }

  await requireConfirmation(Deno.args, `Delete ${total} row(s) from ${targetHost()}?`);

  // Queue messages are not foreign-key children of processing_jobs. A test row
  // deleted without its message would later become stale recovery work, so they
  // are acknowledged first through the same service-role-only RPC as the worker.
  for (const queueMessageId of queueMessageIds) {
    const { error } = await client.rpc("delete_processing_queue_message", {
      p_queue_message_id: queueMessageId,
    });
    if (error !== null) {
      console.error(`\nFAILED to delete pgmq message ${queueMessageId}: ${error.message}`);
      console.error("Stopped before deleting application rows.");
      Deno.exit(1);
    }
  }
  if (queueMessageIds.length > 0) {
    console.log(`  deleted ${String(queueMessageIds.length).padStart(7)}  pgmq messages`);
  }

  // --- Delete, child first, under the same scope ----------------------------
  for (const table of TABLES) {
    const scope = scopeFor(table, userIds, noteIds);
    const rows = counts.find((entry) => entry.table === table)?.rows ?? 0;
    if (rows === 0) continue;

    const { error } = await deleteScoped(client, table, scope);
    if (error !== null) {
      console.error(`\nFAILED to delete from ${table}: ${error.message}`);
      console.error("Stopped. Rows already deleted are gone; the rest are untouched.");
      Deno.exit(1);
    }

    console.log(`  deleted ${String(rows).padStart(7)}  ${table}`);
  }

  console.log("\nDone.");
}

if (import.meta.main) {
  await main();
}
