import { z } from "zod";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

// --- Schemas ----------------------------------------------------------------

const HealthRowSchema = z.object({
  queue_depth: z.coerce.number().int().nonnegative(),
  stale_jobs: z.coerce.number().int().nonnegative(),
  failed_jobs: z.coerce.number().int().nonnegative(),
  deletion_backlog: z.coerce.number().int().nonnegative(),
  active_users: z.coerce.number().int().nonnegative(),
  total_notes: z.coerce.number().int().nonnegative(),
});

const ProblematicJobRowSchema = z.object({
  job_id: z.uuid(),
  user_id: z.uuid().nullable(),
  state: z.string(),
  attempt_count: z.coerce.number().int(),
  created_at: z.string(),
  last_error_code: z.string().nullable(),
});

const UserStatusRowSchema = z.object({
  internal_user_id: z.uuid(),
  status: z.string(),
  alpha_access_status: z.string().nullable(),
  plan_key: z.string().nullable(),
  notes_count: z.coerce.number().int().nonnegative(),
  active_jobs: z.coerce.number().int().nonnegative(),
  failed_jobs: z.coerce.number().int().nonnegative(),
});

// --- Exported types ---------------------------------------------------------

export interface OpsHealth {
  readonly queueDepth: number;
  readonly staleJobs: number;
  readonly failedJobs: number;
  readonly deletionBacklog: number;
  readonly activeUsers: number;
  readonly totalNotes: number;
}

export interface ProblematicJob {
  readonly jobId: string;
  readonly userId: string | null;
  readonly state: string;
  readonly attemptCount: number;
  readonly createdAt: string;
  readonly lastErrorCode: string | null;
}

export interface OpsUserStatus {
  readonly internalUserId: string;
  readonly status: string;
  readonly alphaAccessStatus: string | null;
  readonly planKey: string | null;
  readonly notesCount: number;
  readonly activeJobs: number;
  readonly failedJobs: number;
}

export type RequeueOutcome = "requeued" | "no_note_yet" | "not_found" | "terminal";

export type CancelOutcome = "cancelled" | "not_found" | "already_terminal";

// --- Helpers ----------------------------------------------------------------

function parseSingleRow<T>(data: unknown, schema: z.ZodType<T>, operation: string): T {
  const rows = Array.isArray(data) ? data : [data];
  const parsed = schema.safeParse(rows[0]);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw AppError.internal(`${operation} returned an unexpected row shape: ${issues}`);
  }
  return parsed.data;
}

// --- Repository -------------------------------------------------------------

export class OpsMetricsRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async getHealth(): Promise<OpsHealth> {
    try {
      const { data, error } = await this.#client.rpc("get_ops_health", {});
      if (error !== null) throw classifyPostgresError(error);

      const row = parseSingleRow(data, HealthRowSchema, "get_ops_health");
      return {
        queueDepth: row.queue_depth,
        staleJobs: row.stale_jobs,
        failedJobs: row.failed_jobs,
        deletionBacklog: row.deletion_backlog,
        activeUsers: row.active_users,
        totalNotes: row.total_notes,
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async getProblematicJobs(staleSeconds = 600): Promise<readonly ProblematicJob[]> {
    try {
      const { data, error } = await this.#client.rpc("get_ops_problematic_jobs", {
        p_stale_seconds: staleSeconds,
      });
      if (error !== null) throw classifyPostgresError(error);

      const parsed = z.array(ProblematicJobRowSchema).safeParse(data);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw AppError.internal(`get_ops_problematic_jobs returned an unexpected shape: ${issues}`);
      }
      return parsed.data.map((row) => ({
        jobId: row.job_id,
        userId: row.user_id,
        state: row.state,
        attemptCount: row.attempt_count,
        createdAt: row.created_at,
        lastErrorCode: row.last_error_code,
      }));
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async getUserStatus(telegramUserId: number): Promise<OpsUserStatus | null> {
    try {
      const { data, error } = await this.#client.rpc("get_user_ops_status", {
        p_telegram_user_id: telegramUserId,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) return null;

      const row = parseSingleRow(data, UserStatusRowSchema, "get_user_ops_status");
      return {
        internalUserId: row.internal_user_id,
        status: row.status,
        alphaAccessStatus: row.alpha_access_status,
        planKey: row.plan_key,
        notesCount: row.notes_count,
        activeJobs: row.active_jobs,
        failedJobs: row.failed_jobs,
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async requeueJob(jobId: string): Promise<RequeueOutcome> {
    try {
      const { data, error } = await this.#client.rpc("requeue_processing_job", {
        p_job_id: jobId,
      });
      if (error !== null) throw classifyPostgresError(error);

      const outcome = String(data);
      if (
        outcome !== "requeued" &&
        outcome !== "no_note_yet" &&
        outcome !== "not_found" &&
        outcome !== "terminal"
      ) {
        throw AppError.internal(`requeue_processing_job returned unexpected outcome: ${outcome}`);
      }
      return outcome as RequeueOutcome;
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async cancelJob(jobId: string): Promise<CancelOutcome> {
    try {
      const { data, error } = await this.#client.rpc("cancel_processing_job", {
        p_job_id: jobId,
      });
      if (error !== null) throw classifyPostgresError(error);

      const outcome = String(data);
      if (
        outcome !== "cancelled" &&
        outcome !== "not_found" &&
        outcome !== "already_terminal"
      ) {
        throw AppError.internal(`cancel_processing_job returned unexpected outcome: ${outcome}`);
      }
      return outcome as CancelOutcome;
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }
}
