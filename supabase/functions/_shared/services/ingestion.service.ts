import type { JobState } from "../config/constants.ts";
import type { Logger } from "../observability/logger.ts";
import type { AcceptedMessage } from "../telegram/parse-update.ts";
import type {
  IngestionOutcome,
  IngestionRepository,
} from "../repositories/ingestion.repository.ts";

/**
 * The ingestion flow: resolve the sender, then record the update and its job.
 *
 * This is separated from the HTTP handler because the sequence is a business
 * rule rather than a transport concern, and because it is the part worth testing
 * without constructing a Request. The handler deals in requests and status
 * codes; this deals in messages and outcomes.
 *
 * The whole flow is two database calls, both idempotent. That is what makes
 * Telegram's at-least-once delivery harmless: a redelivered update resolves to
 * the same user, finds its `update_id` already recorded, and creates no second
 * job.
 */

export interface IngestionDependencies {
  readonly repository: IngestionRepository;
  readonly logger: Logger;
}

export interface IngestionResult {
  readonly outcome: IngestionOutcome;
  readonly userId: string;
  readonly jobId: string | null;
  readonly jobState: JobState | null;
}

/**
 * Ingest one accepted message.
 *
 * Logging here is deliberately restricted to identifiers and routing metadata.
 * The message body, the file handle and the filename are all in scope at this
 * point and none of them is logged — `LogFields` would not accept them even if
 * they were passed, which is the point of the allowlist.
 */
export async function ingestMessage(
  message: AcceptedMessage,
  payloadDigest: string,
  deps: IngestionDependencies,
): Promise<IngestionResult> {
  const { repository, logger } = deps;

  const userId = await repository.ensureUser(message);

  const log = logger.child({
    update_id: message.updateId,
    user_id: userId,
    chat_id: message.telegramChatId,
  });

  const result = await repository.acceptUpdate(userId, message, payloadDigest);

  if (result.outcome === "user_not_active") {
    // A blocked, deletion-pending or deleted account is refused before anything
    // is written. Phase 0 does not reply; blueprint 16.4's fixed response is
    // Phase 1 work. See docs/ADR/0003-ingestion-contract.md.
    log.warn("ingestion.user_not_active", { outcome: result.outcome });
    return { outcome: result.outcome, userId, jobId: null, jobState: null };
  }

  if (result.outcome === "duplicate") {
    // Telegram redelivered an update already recorded. Expected, not an error.
    log.info("ingestion.duplicate", {
      outcome: result.outcome,
      job_id: result.jobId,
      job_state: result.jobState,
    });
    if (result.payloadDigestMatches === false) {
      log.warn("ingestion.duplicate_payload_mismatch", {
        outcome: result.outcome,
        reason: "payload_digest_mismatch",
      });
    }
    return { outcome: result.outcome, userId, jobId: result.jobId, jobState: result.jobState };
  }

  log.info("ingestion.accepted", {
    outcome: result.outcome,
    job_id: result.jobId,
    job_state: result.jobState,
    input_type: message.inputType,
    template_key: message.templateKey,
    ...(message.sizeBytes === null ? {} : { size_bytes: message.sizeBytes }),
    ...(message.durationSeconds === null ? {} : { duration_seconds: message.durationSeconds }),
  });

  return { outcome: result.outcome, userId, jobId: result.jobId, jobState: result.jobState };
}
