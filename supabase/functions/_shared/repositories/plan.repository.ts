import { z } from "zod";
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
}
