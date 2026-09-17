import { loadScriptConfig, type ScriptConfig } from "../supabase/functions/_shared/config/env.ts";
import { TELEGRAM_SECRET_HEADER } from "../supabase/functions/_shared/config/constants.ts";
import {
  createServiceClient,
  type ServiceClient,
} from "../supabase/functions/_shared/db/client.ts";
import { toAppError } from "../supabase/functions/_shared/errors/app-error.ts";
import { sha256Hex } from "../supabase/functions/_shared/security/hashing.ts";

/**
 * End-to-end smoke test against a deployed webhook.
 *
 * Run with `deno task smoke`.
 *
 * This is the only check in the repository that exercises the whole path —
 * network, secret validation, schema parsing, classification, both database
 * functions — against a real deployment. The unit and integration tests cover
 * each part in isolation and run without a network; this covers the seams
 * between them, which is where the assumptions live.
 *
 * It proves four of the eight Phase 0 exit criteria directly:
 *
 *   1. A valid signed delivery creates exactly one job.
 *   2. Replaying the same update_id creates no second job.
 *   3. A missing or invalid secret is rejected.
 *   4. The database, not the function, is the source of truth for the first two.
 *
 * Every row it creates is synthetic and is deleted before it exits, including
 * on failure. It never touches a real user's data: the identifiers are drawn
 * from a reserved range and the deletions are scoped to exactly those values.
 */

/** Identifier range reserved for synthetic traffic. */
const SYNTHETIC_ID_BASE = 900_000_000;
const SYNTHETIC_ID_SPAN = 99_999_999;

interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail = ""): void {
  results.push({ name, passed, detail });

  const marker = passed ? "  ok  " : " FAIL ";
  const suffix = detail === "" ? "" : `  (${detail})`;
  console.log(`${marker} ${name}${suffix}`);
}

function syntheticId(): number {
  return SYNTHETIC_ID_BASE + Math.floor(Math.random() * SYNTHETIC_ID_SPAN);
}

function syntheticUpdate(updateId: number, userId: number): Record<string, unknown> {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      from: { id: userId, is_bot: false, first_name: "Notinn Smoke Test", language_code: "en" },
      chat: { id: userId, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "Synthetic smoke-test note. Not real user content.",
    },
  };
}

async function deliver(
  webhookUrl: string,
  body: unknown,
  secret: string | null,
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers[TELEGRAM_SECRET_HEADER] = secret;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  return { status: response.status, text: await response.text() };
}

/** How many jobs exist for an update_id, and what state the newest is in. */
async function inspectJob(
  client: ServiceClient,
  updateId: number,
): Promise<{ count: number; state: string | null }> {
  const { data, error, count } = await client
    .from("processing_jobs")
    .select("state", { count: "exact" })
    .eq("update_id", updateId);

  if (error !== null) throw new Error(`job lookup failed: ${error.message}`);

  const first = (data ?? [])[0] as { state?: string } | undefined;
  return { count: count ?? 0, state: first?.state ?? null };
}

async function countLedgerRows(client: ServiceClient, updateId: number): Promise<number> {
  const { error, count } = await client
    .from("telegram_updates")
    .select("update_id", { count: "exact", head: true })
    .eq("update_id", updateId);

  if (error !== null) throw new Error(`ledger lookup failed: ${error.message}`);
  return count ?? 0;
}

/** Remove the synthetic rows. Cascades handle the job and note rows. */
async function cleanup(client: ServiceClient, updateId: number, userId: number): Promise<void> {
  const ledger = await client.from("telegram_updates").delete().eq("update_id", updateId);
  if (ledger.error !== null) {
    console.error(`warning: could not remove the synthetic update row: ${ledger.error.message}`);
  }

  const user = await client.from("users").delete().eq("telegram_user_id", userId);
  if (user.error !== null) {
    console.error(`warning: could not remove the synthetic user row: ${user.error.message}`);
  }
}

async function run(config: ScriptConfig): Promise<void> {
  if (config.webhookUrl === null) {
    console.error("TELEGRAM_WEBHOOK_URL is not set; there is nothing to test.");
    Deno.exit(1);
  }
  if (config.webhookSecret === null) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not set; deliveries cannot be signed.");
    Deno.exit(1);
  }

  const webhookUrl = config.webhookUrl;
  const secret = config.webhookSecret.reveal();
  const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);

  const updateId = syntheticId();
  const userId = syntheticId();
  const update = syntheticUpdate(updateId, userId);

  console.log("Notinn webhook smoke test");
  console.log("=========================");
  console.log(`endpoint    ${webhookUrl}`);
  console.log(`update_id   ${updateId} (synthetic)`);
  console.log("");

  try {
    // --- Criterion 1: a valid signed delivery creates exactly one job -------
    const first = await deliver(webhookUrl, update, secret);
    check("signed delivery accepted (HTTP 200)", first.status === 200, `got ${first.status}`);
    check(
      "response body is an acknowledgement",
      first.text.trim() === '{"ok":true}',
      first.text.slice(0, 80),
    );

    const afterFirst = await inspectJob(client, updateId);
    check("exactly one job created", afterFirst.count === 1, `found ${afterFirst.count}`);
    check(
      "job is in the durable QUEUED state",
      afterFirst.state === "QUEUED",
      String(afterFirst.state),
    );

    const ledgerAfterFirst = await countLedgerRows(client, updateId);
    check("exactly one ledger row recorded", ledgerAfterFirst === 1, `found ${ledgerAfterFirst}`);

    // --- Criterion 2: replaying the same update_id creates nothing ---------
    const replay = await deliver(webhookUrl, update, secret);
    check("replayed delivery accepted (HTTP 200)", replay.status === 200, `got ${replay.status}`);

    const afterReplay = await inspectJob(client, updateId);
    check("replay created no second job", afterReplay.count === 1, `found ${afterReplay.count}`);

    const ledgerAfterReplay = await countLedgerRows(client, updateId);
    check(
      "replay created no second ledger row",
      ledgerAfterReplay === 1,
      `found ${ledgerAfterReplay}`,
    );

    // A replay carrying different content must still be refused: the ledger is
    // keyed on update_id alone, which is what makes the dedup total.
    const tampered = syntheticUpdate(updateId, userId);
    (tampered["message"] as Record<string, unknown>)["text"] =
      "Different content under the same update_id.";
    await deliver(webhookUrl, tampered, secret);

    const afterTamper = await inspectJob(client, updateId);
    check(
      "same update_id with different content created no job",
      afterTamper.count === 1,
      `found ${afterTamper.count}`,
    );

    // --- Criterion 3: secrets are enforced ---------------------------------
    const missing = await deliver(webhookUrl, syntheticUpdate(syntheticId(), syntheticId()), null);
    check(
      "delivery without a secret rejected (HTTP 401)",
      missing.status === 401,
      `got ${missing.status}`,
    );

    const wrong = await deliver(
      webhookUrl,
      syntheticUpdate(syntheticId(), syntheticId()),
      "definitely-not-the-right-secret",
    );
    check(
      "delivery with a wrong secret rejected (HTTP 401)",
      wrong.status === 401,
      `got ${wrong.status}`,
    );

    // An unauthenticated request must have no side effect at all.
    const unauthorisedUpdateId = syntheticId();
    await deliver(
      webhookUrl,
      syntheticUpdate(unauthorisedUpdateId, syntheticId()),
      "wrong-secret-again",
    );
    const leaked = await countLedgerRows(client, unauthorisedUpdateId);
    check("rejected delivery wrote nothing", leaked === 0, `found ${leaked}`);

    // --- The payload digest is recorded ------------------------------------
    const { data: digestRow } = await client
      .from("telegram_updates")
      .select("payload_digest")
      .eq("update_id", updateId)
      .maybeSingle();

    const expectedDigest = await sha256Hex(JSON.stringify(update));
    const recordedDigest = (digestRow as { payload_digest?: string } | null)?.payload_digest;
    check(
      "payload digest matches the delivered bytes",
      recordedDigest === expectedDigest,
      recordedDigest === undefined ? "not recorded" : `${recordedDigest.slice(0, 12)}…`,
    );
  } finally {
    await cleanup(client, updateId, userId);
    console.log("\nSynthetic rows removed.");
  }
}

if (import.meta.main) {
  try {
    const config = await loadScriptConfig();
    await run(config);

    const failed = results.filter((result) => !result.passed);
    console.log("");
    console.log(
      failed.length === 0
        ? `Result: PASS (${results.length} checks)`
        : `Result: FAIL (${failed.length} of ${results.length} checks failed)`,
    );

    Deno.exit(failed.length === 0 ? 0 : 1);
  } catch (thrown) {
    const error = toAppError(thrown);
    console.error(`\nsmoke test could not run — ${error.publicMessage}`);
    if (error.internalDetail !== undefined) console.error(error.internalDetail);

    // The common cause is a function that is not deployed, or a URL that points
    // at nothing. Say so rather than leaving an opaque fetch error.
    console.error(
      "\nCheck that the function is deployed and TELEGRAM_WEBHOOK_URL is correct:\n" +
        "  supabase functions deploy telegram-webhook --no-verify-jwt\n" +
        "  deno task webhook:info",
    );
    Deno.exit(1);
  }
}
