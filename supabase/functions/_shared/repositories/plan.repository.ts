import { z } from "zod";
import { MAX_AUDIO_DURATION_SECONDS_FREE } from "../config/constants.ts";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";
// --- Schemas ----------------------------------------------------------------

const PlanCatalogueRowSchema = z.object({
  plan_key: z.string(),
  display_name: z.string(),
  price_monthly_usd: z.coerce.number().nullable(),
  features: z.array(z.string()),
  display_order: z.coerce.number().int(),
});

const UserAudioLimitRowSchema = z.object({
  plan_key: z.string(),
  max_audio_duration_seconds: z.coerce.number().int().positive(),
});

const AudioLimitResponseSchema = z.union([
  z.array(UserAudioLimitRowSchema),
  UserAudioLimitRowSchema.transform((row) => [row]),
]);
// --- Exported types ---------------------------------------------------------

export interface PlanCatalogueEntry {
  readonly planKey: string;
  readonly displayName: string;
  readonly priceMonthlyUsd: number | null;
  readonly features: readonly string[];
  readonly displayOrder: number;
}

export type ChangePlanOutcome =
  | "changed"
  | "not_found"
  | "user_deleted"
  | "already_on_plan"
  | "plan_not_found"
  | "plan_inactive";

// --- Repository -------------------------------------------------------------

export class PlanRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async getCatalogue(): Promise<readonly PlanCatalogueEntry[]> {
    try {
      const { data, error } = await this.#client.rpc("get_plan_catalogue", {});
      if (error !== null) throw classifyPostgresError(error);

      const parsed = z.array(PlanCatalogueRowSchema).safeParse(data);
      if (!parsed.success) {
        throw AppError.internal("get_plan_catalogue returned an unexpected shape");
      }
      return parsed.data.map((row) => ({
        planKey: row.plan_key,
        displayName: row.display_name,
        priceMonthlyUsd: row.price_monthly_usd,
        features: row.features,
        displayOrder: row.display_order,
      }));
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async changePlan(
    userId: string,
    newPlan: string,
    changedBy: string,
    reason?: string,
  ): Promise<ChangePlanOutcome> {
    try {
      const { data, error } = await this.#client.rpc("change_user_plan", {
        p_user_id: userId,
        p_new_plan: newPlan,
        p_changed_by: changedBy,
        p_reason: reason ?? null,
      });
      if (error !== null) throw classifyPostgresError(error);

      const outcome = String(data);
      if (
        outcome !== "changed" &&
        outcome !== "not_found" &&
        outcome !== "user_deleted" &&
        outcome !== "already_on_plan" &&
        outcome !== "plan_not_found" &&
        outcome !== "plan_inactive"
      ) {
        throw AppError.internal(`change_user_plan returned unexpected outcome: ${outcome}`);
      }
      return outcome as ChangePlanOutcome;
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async getAudioLimit(userId: string): Promise<{ planKey: string; maxAudioSeconds: number }> {
    try {
      const { data, error } = await this.#client.rpc("get_user_audio_limit", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);

      const parsed = AudioLimitResponseSchema.safeParse(data);
      if (!parsed.success || parsed.data.length === 0) {
        return {
          planKey: "free",
          maxAudioSeconds: MAX_AUDIO_DURATION_SECONDS_FREE,
        };
      }
      const row = parsed.data[0]!;
      return {
        planKey: row.plan_key,
        maxAudioSeconds: row.max_audio_duration_seconds,
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async submitAudioJob(input: {
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    durationSeconds?: number | null;
    templateKey?: string;
  }): Promise<{ jobId: string; status: string }> {
    try {
      const { data, error } = await this.#client.rpc("web_submit_audio_job", {
        p_storage_path: input.storagePath,
        p_mime_type: input.mimeType,
        p_size_bytes: input.sizeBytes,
        p_duration_seconds: input.durationSeconds ?? null,
        p_template_key: input.templateKey ?? "clean_note",
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      const row = rows[0] as { job_id?: string; status?: string } | undefined;
      return {
        jobId: String(row?.job_id ?? ""),
        status: String(row?.status ?? "QUEUED"),
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }
}
