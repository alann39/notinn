import type { QuotaMetric, QuotaRepository } from "../repositories/quota.repository.ts";
import { AppError } from "../errors/app-error.ts";

export interface QuotaGuard {
  readonly reserve: QuotaRepository["reserve"];
  readonly consume: QuotaRepository["consume"];
}

/**
 * Reserve one logical provider operation and reconcile it once the provider
 * call has started. Callers validate and extract input before entering here, so
 * pre-provider failures consume no allowance.
 */
export async function withConsumedQuota<T>(
  quota: QuotaGuard,
  input: {
    readonly userId: string;
    readonly metric: QuotaMetric;
    readonly reservationKey: string;
    readonly jobId?: string | null;
  },
  providerCall: () => Promise<T>,
): Promise<T> {
  const reservation = await quota.reserve(input);
  if (reservation.outcome === "existing_reserved") {
    throw AppError.rateLimited("duplicate quota reservation is still in flight");
  }
  try {
    return await providerCall();
  } finally {
    await quota.consume(input.userId, reservation.reservationId, 1);
  }
}
