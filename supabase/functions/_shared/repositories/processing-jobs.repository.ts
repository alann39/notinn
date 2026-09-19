import { z } from "zod";
import {
  INPUT_TYPES,
  type InputType,
  JOB_STATES,
  type JobState,
  PRIVACY_MODES,
  type PrivacyMode,
} from "../config/constants.ts";
import { OUTPUT_LANGUAGES, type OutputLanguage } from "./user-preferences.repository.ts";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

const TransitionRowSchema = z.object({
  outcome: z.enum(["advanced", "updated", "not_found"]),
  job_state: z.string().nullable(),
});

const IdSchema = z.coerce.number().int();
const UuidSchema = z.uuid();

const QueueMessageRowSchema = z.object({
  queue_message_id: IdSchema,
  read_count: z.number().int().nonnegative(),
  job_id: UuidSchema,
});

const ClaimedJobRowSchema = z.object({
  outcome: z.enum(["claimed", "not_found", "terminal", "exhausted", "retry_wait", "busy"]),
  job_id: UuidSchema,
  user_id: UuidSchema.nullable(),
  chat_id: IdSchema.nullable(),
  status_message_id: IdSchema.nullable(),
  input_type: z.enum(INPUT_TYPES).nullable(),
  telegram_file_id: z.string().nullable(),
  source_text: z.string().nullable(),
  mime_type: z.string().nullable(),
  size_bytes: IdSchema.nullable(),
  duration_seconds: z.number().int().nonnegative().nullable(),
  template_key: z.string().nullable(),
  output_language: z.enum(OUTPUT_LANGUAGES).nullable(),
  privacy_mode: z.enum(PRIVACY_MODES).nullable(),
  job_state: z.enum(JOB_STATES).nullable(),
  attempt_count: z.number().int().nonnegative().nullable(),
  note_id: UuidSchema.nullable(),
  queue_message_id: IdSchema.nullable(),
});

export interface ProcessingQueueMessage {
  readonly queueMessageId: number;
  readonly readCount: number;
  readonly jobId: string;
}

export type JobClaimOutcome = z.infer<typeof ClaimedJobRowSchema>["outcome"];

export interface ClaimedProcessingJob {
  readonly outcome: JobClaimOutcome;
  readonly jobId: string;
  readonly userId: string | null;
  readonly chatId: number | null;
  readonly statusMessageId: number | null;
  readonly inputType: InputType | null;
  /** Secret-adjacent Telegram capability. Never log this value. */
  readonly telegramFileId: string | null;
  /** User content. Never log this value. */
  readonly sourceText: string | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly templateKey: string | null;
  readonly outputLanguage: OutputLanguage | null;
  readonly privacyMode: PrivacyMode | null;
  readonly state: JobState | null;
  readonly attemptCount: number | null;
  readonly noteId: string | null;
  readonly queueMessageId: number | null;
}

export interface JobTransitionResult {
  readonly outcome: "advanced" | "updated" | "not_found";
  readonly state: JobState | null;
}

export class ProcessingJobsRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async advance(
    userId: string,
    jobId: string,
    expected: JobState,
    next: JobState,
  ): Promise<JobTransitionResult> {
    return await this.#call("advance_processing_job", {
      p_user_id: userId,
      p_job_id: jobId,
      p_expected_state: expected,
      p_next_state: next,
    });
  }

  async markRetryable(
    userId: string,
    jobId: string,
    expected: JobState,
    errorCode: string,
    errorDetail: string,
  ): Promise<JobTransitionResult> {
    return await this.#call("mark_processing_job_retryable", {
      p_user_id: userId,
      p_job_id: jobId,
      p_expected_state: expected,
      p_error_code: errorCode,
      p_error_detail: errorDetail,
    });
  }

  /** Read a bounded pgmq batch. The payload contains an internal job UUID only. */
  async readQueue(visibilitySeconds = 300, batchSize = 5): Promise<ProcessingQueueMessage[]> {
    try {
      const { data, error } = await this.#client.rpc("read_processing_queue", {
        p_visibility_seconds: visibilitySeconds,
        p_batch_size: batchSize,
      });
      if (error !== null) throw classifyPostgresError(error);

      const parsed = z.array(QueueMessageRowSchema).safeParse(data ?? []);
      if (!parsed.success) {
        throw AppError.internal("read_processing_queue returned an unexpected row shape");
      }

      return parsed.data.map((row) => ({
        queueMessageId: row.queue_message_id,
        readCount: row.read_count,
        jobId: row.job_id,
      }));
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async deleteQueueMessage(queueMessageId: number): Promise<boolean> {
    return await this.#booleanCall("delete_processing_queue_message", {
      p_queue_message_id: queueMessageId,
    });
  }

  async findQueueMessageId(jobId: string): Promise<number | null> {
    try {
      const { data, error } = await this.#client.rpc("find_processing_queue_message_id", {
        p_job_id: jobId,
      });
      if (error !== null) throw classifyPostgresError(error);
      if (data === null || data === undefined) return null;

      const parsed = IdSchema.safeParse(data);
      if (!parsed.success) {
        throw AppError.internal(
          "find_processing_queue_message_id returned an unexpected value",
        );
      }
      return parsed.data;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async claim(jobId: string, maxAttempts = 3): Promise<ClaimedProcessingJob> {
    try {
      const { data, error } = await this.#client.rpc("claim_processing_job", {
        p_job_id: jobId,
        p_max_attempts: maxAttempts,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      const parsed = ClaimedJobRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("claim_processing_job returned an unexpected row shape");
      }

      const row = parsed.data;
      return {
        outcome: row.outcome,
        jobId: row.job_id,
        userId: row.user_id,
        chatId: row.chat_id,
        statusMessageId: row.status_message_id,
        inputType: row.input_type,
        telegramFileId: row.telegram_file_id,
        sourceText: row.source_text,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        durationSeconds: row.duration_seconds,
        templateKey: row.template_key,
        outputLanguage: row.output_language,
        privacyMode: row.privacy_mode,
        state: row.job_state,
        attemptCount: row.attempt_count,
        noteId: row.note_id,
        queueMessageId: row.queue_message_id,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async setStatusMessage(userId: string, jobId: string, messageId: number): Promise<boolean> {
    return await this.#booleanCall("set_processing_job_status_message", {
      p_user_id: userId,
      p_job_id: jobId,
      p_status_message_id: messageId,
    });
  }

  async complete(userId: string, jobId: string): Promise<boolean> {
    return await this.#booleanCall("complete_processing_job", {
      p_user_id: userId,
      p_job_id: jobId,
    });
  }

  async fail(
    userId: string,
    jobId: string,
    expected: JobState,
    errorCode: string,
    errorDetail: string,
  ): Promise<boolean> {
    return await this.#booleanCall("fail_processing_job", {
      p_user_id: userId,
      p_job_id: jobId,
      p_expected_state: expected,
      p_error_code: errorCode,
      p_error_detail: errorDetail,
    });
  }

  async #call(fn: string, args: Record<string, unknown>): Promise<JobTransitionResult> {
    try {
      const { data, error } = await this.#client.rpc(fn, args);
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      const parsed = TransitionRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal(`${fn} returned an unexpected row shape`);
      }

      return {
        outcome: parsed.data.outcome,
        state: parsed.data.job_state as JobState | null,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async #booleanCall(fn: string, args: Record<string, unknown>): Promise<boolean> {
    try {
      const { data, error } = await this.#client.rpc(fn, args);
      if (error !== null) throw classifyPostgresError(error);

      const value = Array.isArray(data) ? data[0] : data;
      if (value === null || value === undefined) return false;

      const parsed = z.boolean().safeParse(value);
      if (!parsed.success) {
        throw AppError.internal(`${fn} returned an unexpected value`);
      }
      return parsed.data;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
