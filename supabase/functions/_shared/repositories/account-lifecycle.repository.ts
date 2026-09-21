import { z } from "zod";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

export const ACCOUNT_STATUSES = ["active", "blocked", "deletion_pending", "deleted"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const LifecycleRowSchema = z.object({
  account_status: z.enum(ACCOUNT_STATUSES),
  deletion_requested_at: z.string().nullable(),
  deletion_scheduled_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
});

const DeletionRequestRowSchema = z.object({
  outcome: z.enum(["scheduled", "already_pending", "deleted", "not_found"]),
  deletion_scheduled_at: z.string().nullable(),
});

const CancellationOutcomeSchema = z.enum([
  "cancelled",
  "not_pending",
  "expired",
  "deleted",
  "not_found",
]);

export interface AccountLifecycle {
  readonly status: AccountStatus;
  readonly deletionRequestedAt: string | null;
  readonly deletionScheduledAt: string | null;
  readonly deletedAt: string | null;
}

export type DeletionRequestOutcome = z.infer<typeof DeletionRequestRowSchema>["outcome"];
export type DeletionCancellationOutcome = z.infer<typeof CancellationOutcomeSchema>;

export interface DeletionRequestResult {
  readonly outcome: DeletionRequestOutcome;
  readonly deletionScheduledAt: string | null;
}

export class AccountLifecycleRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async get(userId: string): Promise<AccountLifecycle | null> {
    return await this.#wrap(async () => {
      const { data, error } = await this.#client.rpc("get_account_lifecycle", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);
      const rows = Array.isArray(data) ? data : data === null ? [] : [data];
      if (rows.length === 0) return null;
      const parsed = LifecycleRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("get_account_lifecycle returned an unexpected row shape");
      }
      return {
        status: parsed.data.account_status,
        deletionRequestedAt: parsed.data.deletion_requested_at,
        deletionScheduledAt: parsed.data.deletion_scheduled_at,
        deletedAt: parsed.data.deleted_at,
      };
    });
  }

  async requestDeletion(userId: string): Promise<DeletionRequestResult> {
    return await this.#wrap(async () => {
      const { data, error } = await this.#client.rpc("request_account_deletion", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);
      const rows = Array.isArray(data) ? data : data === null ? [] : [data];
      const parsed = DeletionRequestRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("request_account_deletion returned an unexpected row shape");
      }
      return {
        outcome: parsed.data.outcome,
        deletionScheduledAt: parsed.data.deletion_scheduled_at,
      };
    });
  }

  async cancelDeletion(userId: string): Promise<DeletionCancellationOutcome> {
    return await this.#wrap(async () => {
      const { data, error } = await this.#client.rpc("cancel_account_deletion", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);
      const parsed = CancellationOutcomeSchema.safeParse(data);
      if (!parsed.success) {
        throw AppError.internal("cancel_account_deletion returned an unexpected outcome");
      }
      return parsed.data;
    });
  }

  async #wrap<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }
}
