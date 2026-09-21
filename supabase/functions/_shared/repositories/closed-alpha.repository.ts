import { z } from "zod";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { sha256Hex } from "../security/hashing.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

export const CLOSED_ALPHA_ACCESS_STATUSES = ["pending", "active", "suspended"] as const;
export type ClosedAlphaAccessStatus = (typeof CLOSED_ALPHA_ACCESS_STATUSES)[number];

const AccessRowSchema = z.object({
  access_status: z.enum(CLOSED_ALPHA_ACCESS_STATUSES),
  activated_at: z.string().nullable(),
  suspended_at: z.string().nullable(),
});

const RedemptionOutcomeSchema = z.enum([
  "activated",
  "already_active",
  "invalid",
  "expired",
  "exhausted",
  "suspended",
  "user_not_active",
]);

export interface ClosedAlphaAccess {
  readonly status: ClosedAlphaAccessStatus;
  readonly activatedAt: string | null;
  readonly suspendedAt: string | null;
}

export type InviteRedemptionOutcome = z.infer<typeof RedemptionOutcomeSchema>;

/** Invite deep-link payloads are case-insensitive and never persisted raw. */
export function normaliseInviteCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{8,64}$/.test(code) ? code : null;
}

export class ClosedAlphaRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async getAccess(userId: string): Promise<ClosedAlphaAccess | null> {
    try {
      const { data, error } = await this.#client.rpc("get_closed_alpha_access", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);
      const rows = Array.isArray(data) ? data : data === null ? [] : [data];
      if (rows.length === 0) return null;
      const parsed = AccessRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("get_closed_alpha_access returned an unexpected row shape");
      }
      return {
        status: parsed.data.access_status,
        activatedAt: parsed.data.activated_at,
        suspendedAt: parsed.data.suspended_at,
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async redeemInvite(userId: string, rawCode: string): Promise<InviteRedemptionOutcome> {
    const code = normaliseInviteCode(rawCode);
    if (code === null) return "invalid";
    try {
      const digest = await sha256Hex(code);
      const { data, error } = await this.#client.rpc("redeem_closed_alpha_invite", {
        p_user_id: userId,
        p_code_sha256: digest,
      });
      if (error !== null) throw classifyPostgresError(error);
      const parsed = RedemptionOutcomeSchema.safeParse(data);
      if (!parsed.success) {
        throw AppError.internal("redeem_closed_alpha_invite returned an unexpected outcome");
      }
      return parsed.data;
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }
}
