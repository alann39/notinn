import { z } from "zod";
import type { JobState } from "../config/constants.ts";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import type { AcceptedMessage, TelegramIdentity } from "../telegram/parse-update.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

/**
 * The database operations the webhook performs.
 *
 * There are exactly two, and both are calls to a `SECURITY DEFINER` function
 * rather than statements against a table. That is not incidental. Duplicate
 * suppression has to be atomic with job creation, and the way to get that is to
 * put the check and the insert in one server-side function where they share a
 * transaction. Doing it here would mean two round trips with a race between them
 * and a correctness argument that depends on the application being the only
 * writer. See docs/ADR/0005-access-model.md.
 *
 * Every value returned across this boundary is validated before use. The RPC
 * returns a row shape that TypeScript cannot see, and treating a database reply
 * as trusted is how a schema change becomes a runtime crash in production.
 */

const UuidSchema = z.uuid();
const IdSchema = z.coerce.number().int();

/** One row of `accept_and_enqueue_telegram_update_v2`'s result set. */
const AcceptRowSchema = z.object({
  update_id: IdSchema,
  user_id: UuidSchema.nullable(),
  job_id: UuidSchema.nullable(),
  outcome: z.enum(["accepted", "duplicate", "user_not_active"]),
  job_state: z.string().nullable(),
  chat_id: IdSchema.nullable(),
  message_id: IdSchema.nullable(),
  queue_message_id: IdSchema.nullable(),
  template_key: z.string().nullable(),
});

export type IngestionOutcome = "accepted" | "duplicate" | "user_not_active";

export interface AcceptResult {
  readonly outcome: IngestionOutcome;
  readonly updateId: number;
  readonly userId: string | null;
  readonly jobId: string | null;
  readonly jobState: JobState | null;
  readonly queueMessageId: number | null;
  readonly templateKey: string | null;
  /** Null for a first delivery or when the ledger had no digest. */
  readonly payloadDigestMatches: boolean | null;
}

export class IngestionRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  /**
   * Resolve a Telegram account to an internal user id, creating it on first
   * contact (blueprint 8.1).
   *
   * Idempotent. Concurrent first messages from the same account converge on one
   * row because `telegram_user_id` is unique and the function uses an upsert.
   */
  async ensureUser(message: TelegramIdentity): Promise<string> {
    try {
      const { data, error } = await this.#client.rpc("ensure_telegram_user", {
        p_telegram_user_id: message.telegramUserId,
        p_telegram_chat_id: message.telegramChatId,
        p_telegram_username: message.telegramUsername,
        p_display_name: message.displayName,
      });

      if (error !== null) throw classifyPostgresError(error);

      const parsed = UuidSchema.safeParse(data);
      if (!parsed.success) {
        throw AppError.internal("ensure_telegram_user did not return a user id");
      }

      return parsed.data;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Record the update and create exactly one job for it, atomically.
   *
   * `payloadDigest` is stored for forensics: if the same `update_id` ever
   * arrives with different content, the digest is what makes that visible. Phase
   * 0 records it but does not compare it; comparing is a Phase 1 hardening step
   * noted in docs/IMPLEMENTATION_STATUS.md.
   */
  async acceptUpdate(
    userId: string,
    message: AcceptedMessage,
    payloadDigest: string,
  ): Promise<AcceptResult> {
    try {
      const { data, error } = await this.#client.rpc("accept_and_enqueue_telegram_update_v2", {
        p_update_id: message.updateId,
        p_update_type: "message",
        p_user_id: userId,
        p_chat_id: message.telegramChatId,
        p_message_id: message.messageId,
        p_input_type: message.inputType,
        p_template_key: message.templateKey,
        p_payload_digest: payloadDigest,
        p_source_text: message.sourceText,
        p_telegram_file_id: message.telegramFileId,
        p_telegram_file_unique_id: message.telegramFileUniqueId,
        p_original_filename: message.originalFilename,
        p_mime_type: message.mimeType,
        p_size_bytes: message.sizeBytes,
        p_duration_seconds: message.durationSeconds,
      });

      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      const first = rows[0];
      if (first === undefined) {
        throw AppError.internal("accept_and_enqueue_telegram_update_v2 returned no rows");
      }

      const parsed = AcceptRowSchema.safeParse(first);
      if (!parsed.success) {
        throw AppError.internal(
          "accept_and_enqueue_telegram_update_v2 returned an unexpected row shape",
        );
      }

      let payloadDigestMatches: boolean | null = null;
      if (parsed.data.outcome === "duplicate") {
        const comparison = await this.#client.rpc("telegram_update_digest_matches", {
          p_update_id: message.updateId,
          p_payload_digest: payloadDigest,
        });
        if (comparison.error !== null) throw classifyPostgresError(comparison.error);

        const match = z.boolean().nullable().safeParse(comparison.data);
        if (!match.success) {
          throw AppError.internal("telegram_update_digest_matches returned an unexpected value");
        }
        payloadDigestMatches = match.data;
      }

      return {
        outcome: parsed.data.outcome,
        updateId: parsed.data.update_id,
        userId: parsed.data.user_id,
        jobId: parsed.data.job_id,
        jobState: parsed.data.job_state as JobState | null,
        queueMessageId: parsed.data.queue_message_id,
        templateKey: parsed.data.template_key,
        payloadDigestMatches,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
