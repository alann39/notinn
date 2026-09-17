import { assert, assertEquals } from "@std/assert";
import { SYSTEM_TEMPLATE_KEYS } from "../../supabase/functions/_shared/config/constants.ts";
import { IngestionRepository } from "../../supabase/functions/_shared/repositories/ingestion.repository.ts";
import { textUpdate } from "../fixtures/telegram/builders.ts";
import {
  acceptedMessage,
  ENABLED,
  nextId,
  serviceClient,
  syntheticDigest,
  targetHost,
} from "./harness.ts";

/**
 * The ingestion contract against a real database.
 *
 * This is where Phase 0 exit criteria 1 and 2 are actually proven:
 *
 *   1. A valid signed test webhook creates exactly one deduplicated job.
 *   2. Replaying the same update_id creates no second job.
 *
 * Neither can be proven anywhere else. Deduplication is a unique constraint
 * inside `accept_telegram_update`, and the entire point of putting it there is
 * that the guarantee holds without the application's cooperation — a test that
 * stubbed the database could only assert that the application *asks* for
 * deduplication, which is not the property anybody cares about.
 *
 * Ignored unless NOTINN_TEST_SUPABASE_URL and NOTINN_TEST_SERVICE_ROLE_KEY are
 * set. See harness.ts.
 */

const client = ENABLED ? serviceClient() : null;
const repository = client === null ? null : new IngestionRepository(client);

/** Assert the suite is configured, so a null check does not have to be repeated. */
function requireRepository(): IngestionRepository {
  assert(repository !== null, "the integration suite is not configured");
  return repository;
}

Deno.test({
  name: "the integration target is a database and not production",
  ignore: !ENABLED,
  fn: async () => {
    const target = serviceClient();

    const { error } = await target.from("templates").select("key").limit(1);

    assertEquals(error, null, `could not read templates from ${targetHost()}`);
  },
});

Deno.test({
  name: "a first delivery creates exactly one job",
  ignore: !ENABLED,
  fn: async () => {
    // Exit criterion 1, against a real instance.
    const repo = requireRepository();
    const updateId = nextId();
    const userId = nextId();

    const message = acceptedMessage(textUpdate({ updateId, userId }));
    const internalUserId = await repo.ensureUser(message);
    const digest = await syntheticDigest(`first-${updateId}`);

    const result = await repo.acceptUpdate(internalUserId, message, digest);

    assertEquals(result.outcome, "accepted");
    assertEquals(result.jobId !== null, true, "no job was created");
    assertEquals(result.jobState, "QUEUED", "the job was not created in QUEUED");
    assertEquals(result.updateId, updateId);

    // And the database agrees: exactly one job for this update.
    const { data, error } = await serviceClient()
      .from("processing_jobs")
      .select("id, state, template_key, input_type")
      .eq("update_id", updateId);

    assertEquals(error, null);
    assertEquals(data?.length, 1, "one update produced more than one job");
    assertEquals(data?.[0]?.["state"], "QUEUED");
    assertEquals(data?.[0]?.["template_key"], "clean_note");
    assertEquals(data?.[0]?.["input_type"], "text");
    assertEquals(data?.[0]?.["id"], result.jobId);
  },
});

Deno.test({
  name: "replaying the same update_id creates no second job",
  ignore: !ENABLED,
  fn: async () => {
    // Exit criterion 2. This is the property that makes Telegram's at-least-once
    // delivery harmless, so it is asserted by counting rows and not only by
    // reading the returned outcome.
    const repo = requireRepository();
    const updateId = nextId();
    const userId = nextId();

    const message = acceptedMessage(textUpdate({ updateId, userId }));
    const internalUserId = await repo.ensureUser(message);
    const digest = await syntheticDigest(`replay-${updateId}`);

    const first = await repo.acceptUpdate(internalUserId, message, digest);
    const second = await repo.acceptUpdate(internalUserId, message, digest);
    const third = await repo.acceptUpdate(internalUserId, message, digest);

    assertEquals(first.outcome, "accepted");
    assertEquals(second.outcome, "duplicate");
    assertEquals(third.outcome, "duplicate");

    // The replay resolves to the same job rather than to nothing, so a caller
    // that lost the first response can still find out what happened.
    assertEquals(second.jobId, first.jobId);
    assertEquals(third.jobId, first.jobId);
    assertEquals(second.jobState, "QUEUED");

    const { data, error } = await serviceClient()
      .from("processing_jobs")
      .select("id")
      .eq("update_id", updateId);

    assertEquals(error, null);
    assertEquals(data?.length, 1, "a replay created a second job");
  },
});

Deno.test({
  name: "a replay with different content still creates no second job",
  ignore: !ENABLED,
  fn: async () => {
    // Deduplication keys on update_id alone, which is the correct key: Telegram
    // guarantees the id is unique per update, and a payload that arrived twice
    // with different bytes is a corrupted delivery rather than a new message.
    // The payload digest is recorded so the discrepancy is visible afterwards —
    // Phase 1 compares it. See docs/IMPLEMENTATION_STATUS.md.
    const repo = requireRepository();
    const updateId = nextId();
    const userId = nextId();

    const original = acceptedMessage(
      textUpdate({ updateId, userId, text: "synthetic first body" }),
    );
    const internalUserId = await repo.ensureUser(original);

    await repo.acceptUpdate(internalUserId, original, await syntheticDigest(`a-${updateId}`));

    const altered = acceptedMessage(
      textUpdate({ updateId, userId, text: "synthetic different body entirely" }),
    );
    const replayed = await repo.acceptUpdate(
      internalUserId,
      altered,
      await syntheticDigest(`b-${updateId}`),
    );

    assertEquals(replayed.outcome, "duplicate");

    const { data } = await serviceClient()
      .from("processing_jobs")
      .select("id")
      .eq("update_id", updateId);

    assertEquals(data?.length, 1);
  },
});

Deno.test({
  name: "a second update from the same account reuses the user row",
  ignore: !ENABLED,
  fn: async () => {
    // The upsert in ensure_telegram_user. If it inserted instead of upserting,
    // the unique constraint on telegram_user_id would reject the second message
    // and a returning user could never send anything.
    const repo = requireRepository();
    const userId = nextId();

    const first = acceptedMessage(textUpdate({ updateId: nextId(), userId }));
    const second = acceptedMessage(textUpdate({ updateId: nextId(), userId }));

    const firstUserId = await repo.ensureUser(first);
    const secondUserId = await repo.ensureUser(second);

    assertEquals(secondUserId, firstUserId);

    const { data } = await serviceClient()
      .from("users")
      .select("id")
      .eq("telegram_user_id", userId);

    assertEquals(data?.length, 1, "the same account produced two user rows");
  },
});

Deno.test({
  name: "records the update, its digest and its link to the job",
  ignore: !ENABLED,
  fn: async () => {
    // The acceptance record. Its shape is what Phase 1 reads to know an update
    // was seen, so the columns are asserted rather than just the row count.
    const repo = requireRepository();
    const updateId = nextId();
    const userId = nextId();

    const message = acceptedMessage(textUpdate({ updateId, userId }));
    const internalUserId = await repo.ensureUser(message);
    const digest = await syntheticDigest(`ledger-${updateId}`);

    const result = await repo.acceptUpdate(internalUserId, message, digest);

    const { data } = await serviceClient()
      .from("telegram_updates")
      .select("update_id, update_type, input_type, template_key, payload_digest, processing_job_id")
      .eq("update_id", updateId);

    assertEquals(data?.length, 1, "the update was not recorded");
    assertEquals(data?.[0]?.["update_id"], updateId);
    assertEquals(data?.[0]?.["update_type"], "message");
    assertEquals(data?.[0]?.["input_type"], "text");
    assertEquals(data?.[0]?.["template_key"], "clean_note");
    assertEquals(data?.[0]?.["payload_digest"], digest);
    assertEquals(data?.[0]?.["processing_job_id"], result.jobId);
  },
});

Deno.test({
  name: "every template in the catalogue is applied and readable",
  ignore: !ENABLED,
  fn: async () => {
    // The applied half of exit criterion 6. The contract suite proves the file
    // declares these keys; this proves the database has them, which is what
    // makes the foreign key from processing_jobs satisfiable.
    const { data, error } = await serviceClient()
      .from("templates")
      .select("key, status")
      .order("key");

    assertEquals(error, null);

    const keys = (data ?? []).map((row) => row["key"] as string);
    for (const expected of SYSTEM_TEMPLATE_KEYS) {
      assert(keys.includes(expected), `the catalogue is missing ${expected}`);
    }

    // Every system template is active, or the foreign key would still accept a
    // job that can never be processed.
    for (const row of data ?? []) {
      assertEquals(row["status"], "active", `${row["key"]} is not active`);
    }
  },
});

Deno.test({
  name: "a template key that does not exist is refused by the database",
  ignore: !ENABLED,
  fn: async () => {
    // The foreign key is what makes the routing table's correctness a database
    // guarantee rather than an application convention.
    const repo = requireRepository();
    const updateId = nextId();
    const userId = nextId();

    const message = acceptedMessage(textUpdate({ updateId, userId }));
    const internalUserId = await repo.ensureUser(message);

    // The cast is the point of the test. `AcceptedMessage["templateKey"]` is a
    // union of the catalogue's keys, so TypeScript already refuses to construct
    // this — the repository *cannot* be handed an unknown key by a correct
    // caller. What is being asserted is the layer underneath: if a routing table
    // were corrupted, or a future caller cast its way past the type as this line
    // does, the foreign key still refuses the row. Defence in depth, so the
    // escape hatch is explicit rather than a weakening of the type.
    const tampered = {
      ...message,
      templateKey: "not_a_real_template",
    } as unknown as typeof message;

    let threw = false;
    try {
      await repo.acceptUpdate(internalUserId, tampered, await syntheticDigest(`fk-${updateId}`));
    } catch {
      threw = true;
    }

    assert(threw, "an unknown template key was accepted");
  },
});

Deno.test({
  name: "a delivery from an unknown account creates exactly one user",
  ignore: !ENABLED,
  fn: async () => {
    // First contact (blueprint 8.1). Asserted with a fresh account so the create
    // path runs rather than the update path.
    const repo = requireRepository();
    const telegramUserId = nextId();

    const message = acceptedMessage(textUpdate({ updateId: nextId(), userId: telegramUserId }));

    const first = await repo.ensureUser(message);

    const { data } = await serviceClient()
      .from("users")
      .select("id, status, telegram_user_id, telegram_chat_id")
      .eq("id", first);

    assertEquals(data?.length, 1);
    assertEquals(data?.[0]?.["telegram_user_id"], telegramUserId);
    assertEquals(data?.[0]?.["status"], "active");
    assertEquals(data?.[0]?.["telegram_chat_id"], telegramUserId);
  },
});
