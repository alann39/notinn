import { assert, assertEquals } from "@std/assert";
import { IngestionRepository } from "../../supabase/functions/_shared/repositories/ingestion.repository.ts";
import { ProcessingJobsRepository } from "../../supabase/functions/_shared/repositories/processing-jobs.repository.ts";
import { textUpdate } from "../fixtures/telegram/builders.ts";
import { acceptedMessage, ENABLED, nextId, serviceClient, syntheticDigest } from "./harness.ts";

/** Phase 2's durable queue boundary against a real development target. */
Deno.test({
  name: "job creation publishes and claims the same opaque PGMQ message",
  ignore: !ENABLED,
  fn: async () => {
    const client = serviceClient();
    const ingestion = new IngestionRepository(client);
    const jobs = new ProcessingJobsRepository(client);
    const updateId = nextId();
    const message = acceptedMessage(textUpdate({ updateId, userId: nextId() }));
    const userId = await ingestion.ensureUser(message);

    const accepted = await ingestion.acceptUpdate(
      userId,
      message,
      await syntheticDigest(`phase2-queue-${updateId}`),
    );

    assertEquals(accepted.outcome, "accepted");
    assert(accepted.jobId !== null);
    assert(accepted.queueMessageId !== null);
    assertEquals(await jobs.findQueueMessageId(accepted.jobId), accepted.queueMessageId);

    const claim = await jobs.claim(accepted.jobId, 3);
    assertEquals(claim.outcome, "claimed");
    assertEquals(claim.state, "ACQUIRING");
    assertEquals(claim.jobId, accepted.jobId);
    assertEquals(claim.queueMessageId, accepted.queueMessageId);
    assertEquals(claim.sourceText, message.sourceText);
  },
});
