import { z } from "zod";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

export const QUOTA_METRICS = [
  "note_generation",
  "regeneration",
  "semantic_answer",
] as const;

export type QuotaMetric = (typeof QUOTA_METRICS)[number];

const ReservationRowSchema = z.object({
  outcome: z.enum([
    "reserved",
    "existing_reserved",
    "existing_consumed",
    "existing_released",
    "exceeded",
    "daily_exceeded",
    "user_not_active",
    "plan_not_configured",
  ]),
  reservation_id: z.uuid().nullable(),
  plan_key: z.string().nullable(),
  metric: z.enum(QUOTA_METRICS),
  monthly_limit: z.coerce.number().int().nonnegative().nullable(),
  used_units: z.coerce.number().int().nonnegative(),
  reserved_units: z.coerce.number().int().nonnegative(),
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  daily_limit: z.coerce.number().int().nonnegative().nullable(),
  daily_used_units: z.coerce.number().int().nonnegative(),
  daily_reserved_units: z.coerce.number().int().nonnegative(),
  usage_date: z.iso.date(),
});

const SummaryRowSchema = z.object({
  plan_key: z.string().min(1),
  plan_name: z.string().min(1),
  metric: z.enum(QUOTA_METRICS),
  monthly_limit: z.coerce.number().int().positive(),
  used_units: z.coerce.number().int().nonnegative(),
  reserved_units: z.coerce.number().int().nonnegative(),
  remaining_units: z.coerce.number().int().nonnegative(),
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  daily_limit: z.coerce.number().int().positive(),
  daily_used_units: z.coerce.number().int().nonnegative(),
  daily_reserved_units: z.coerce.number().int().nonnegative(),
  daily_remaining_units: z.coerce.number().int().nonnegative(),
  usage_date: z.iso.date(),
});

export interface QuotaReservation {
  readonly reservationId: string;
  readonly outcome: "reserved" | "existing_reserved";
}

export interface UsageSummary {
  readonly planKey: string;
  readonly planName: string;
  readonly metric: QuotaMetric;
  readonly monthlyLimit: number;
  readonly usedUnits: number;
  readonly reservedUnits: number;
  readonly remainingUnits: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dailyLimit: number;
  readonly dailyUsedUnits: number;
  readonly dailyReservedUnits: number;
  readonly dailyRemainingUnits: number;
  readonly usageDate: string;
}

function oneRow(data: unknown, operation: string) {
  const rows = Array.isArray(data) ? data : [data];
  const parsed = ReservationRowSchema.safeParse(rows[0]);
  if (!parsed.success) {
    throw AppError.internal(`${operation} returned an unexpected row shape`);
  }
  return parsed.data;
}

export class QuotaRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async reserve(input: {
    readonly userId: string;
    readonly metric: QuotaMetric;
    readonly reservationKey: string;
    readonly units?: number;
    readonly jobId?: string | null;
  }): Promise<QuotaReservation> {
    try {
      const { data, error } = await this.#client.rpc("reserve_plan_quota", {
        p_user_id: input.userId,
        p_metric: input.metric,
        p_reservation_key: input.reservationKey,
        p_units: input.units ?? 1,
        p_job_id: input.jobId ?? null,
      });
      if (error !== null) throw classifyPostgresError(error);

      const row = oneRow(data, "reserve_plan_quota");
      if (row.outcome === "daily_exceeded") {
        throw AppError.dailyQuotaExceeded(
          `${row.metric} daily limit exhausted for ${row.plan_key ?? "unknown plan"}`,
        );
      }
      if (row.outcome === "exceeded") {
        throw AppError.quotaExceeded(
          `${row.metric} monthly limit exhausted for ${row.plan_key ?? "unknown plan"}`,
        );
      }
      if (row.outcome === "user_not_active") {
        throw AppError.userNotActive("quota reservation rejected an inactive user");
      }
      if (row.outcome === "plan_not_configured") {
        throw AppError.configuration(
          `quota metric ${row.metric} is not configured for ${row.plan_key ?? "unknown plan"}`,
        );
      }
      if (row.outcome === "existing_consumed" || row.outcome === "existing_released") {
        throw AppError.internal(`quota reservation key reused after ${row.outcome.slice(9)}`);
      }
      if (row.reservation_id === null) {
        throw AppError.internal("quota reservation succeeded without an id");
      }
      return { reservationId: row.reservation_id, outcome: row.outcome };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async consume(userId: string, reservationId: string, actualUnits = 1): Promise<void> {
    try {
      const { data, error } = await this.#client.rpc("consume_plan_quota", {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_actual_units: actualUnits,
      });
      if (error !== null) throw classifyPostgresError(error);
      if (data !== "consumed") {
        throw AppError.internal(`consume_plan_quota returned ${String(data)}`);
      }
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async release(userId: string, reservationId: string): Promise<void> {
    try {
      const { data, error } = await this.#client.rpc("release_plan_quota", {
        p_user_id: userId,
        p_reservation_id: reservationId,
      });
      if (error !== null) throw classifyPostgresError(error);
      if (data !== "released") {
        throw AppError.internal(`release_plan_quota returned ${String(data)}`);
      }
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async getSummary(userId: string): Promise<readonly UsageSummary[]> {
    try {
      const { data, error } = await this.#client.rpc("get_user_usage_summary", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);
      const parsed = z.array(SummaryRowSchema).safeParse(data);
      if (!parsed.success || parsed.data.length === 0) {
        throw AppError.internal("get_user_usage_summary returned an unexpected row set");
      }
      return parsed.data.map((row) => ({
        planKey: row.plan_key,
        planName: row.plan_name,
        metric: row.metric,
        monthlyLimit: row.monthly_limit,
        usedUnits: row.used_units,
        reservedUnits: row.reserved_units,
        remainingUnits: row.remaining_units,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        dailyLimit: row.daily_limit,
        dailyUsedUnits: row.daily_used_units,
        dailyReservedUnits: row.daily_reserved_units,
        dailyRemainingUnits: row.daily_remaining_units,
        usageDate: row.usage_date,
      }));
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }
}
