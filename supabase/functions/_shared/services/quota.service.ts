import type { QuotaMetric, QuotaRepository } from "../repositories/quota.repository.ts";
import { AppError } from "../errors/app-error.ts";

export interface QuotaGuard {
  readonly reserve: QuotaRepository["reserve"];
  readonly consume: QuotaRepository["consume"];
  readonly release: QuotaRepository["release"];
}

/**
 * Reserve one logical operation and reconcile it: consume on success, release on failure.
 * Callers validate and extract input before entering here, so pre-provider
 * failures consume no allowance.
 */
export async function withConsumedQuota<T>(
  quota: QuotaGuard,
  input: {
    readonly userId: string;
    readonly metric: QuotaMetric;
    readonly reservationKey: string;
    readonly jobId?: string | null;
  },
  operation: () => Promise<T>,
): Promise<T> {
  const reservation = await quota.reserve(input);
  if (reservation.outcome === "existing_reserved") {
    throw AppError.rateLimited("duplicate quota reservation is still in flight");
  }
  try {
    const result = await operation();
    await quota.consume(input.userId, reservation.reservationId, 1);
    return result;
  } catch (error) {
    try {
      await quota.release(input.userId, reservation.reservationId);
    } catch {
      // Do not mask original failure
    }
    throw error;
  }
}
