import { z } from "zod";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

// --- Schemas ----------------------------------------------------------------

const UpgradeOrderRowSchema = z.object({
  order_code: z.string(),
  amount_idr: z.coerce.number().int(),
  is_early_bird: z.boolean(),
  early_bird_remaining: z.coerce.number().int(),
  expires_at: z.string(),
});

const ProcessPaymentRowSchema = z.object({
  outcome: z.enum(["success", "order_not_found", "amount_insufficient"]),
  user_id: z.string().uuid().nullable(),
  telegram_user_id: z.coerce.number().nullable(),
  new_plan: z.string().nullable(),
  subscription_expires_at: z.string().nullable(),
  amount_paid: z.coerce.number().int(),
});

const UserSubscriptionRowSchema = z.object({
  plan_key: z.string(),
  starts_at: z.string(),
  expires_at: z.string(),
  status: z.string(),
  days_remaining: z.coerce.number().int(),
});

// --- Exported Types ---------------------------------------------------------

export interface UpgradeOrder {
  readonly orderCode: string;
  readonly amountIdr: number;
  readonly isEarlyBird: boolean;
  readonly earlyBirdRemaining: number;
  readonly expiresAt: string;
}

export type ProcessPaymentOutcome =
  | "success"
  | "order_not_found"
  | "amount_insufficient";

export interface ProcessPaymentResult {
  readonly outcome: ProcessPaymentOutcome;
  readonly userId: string | null;
  readonly telegramUserId: number | null;
  readonly newPlan: string | null;
  readonly subscriptionExpiresAt: string | null;
  readonly amountPaid: number;
}

export interface UserSubscription {
  readonly planKey: string;
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly status: string;
  readonly daysRemaining: number;
}

// --- Repository -------------------------------------------------------------

export class PaymentRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async createUpgradeOrder(userId: string): Promise<UpgradeOrder> {
    try {
      const { data, error } = await this.#client.rpc("create_upgrade_order", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0 || !rows[0]) {
        throw AppError.internal("create_upgrade_order returned no data");
      }

      const parsed = UpgradeOrderRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("create_upgrade_order returned unexpected shape");
      }

      return {
        orderCode: parsed.data.order_code,
        amountIdr: parsed.data.amount_idr,
        isEarlyBird: parsed.data.is_early_bird,
        earlyBirdRemaining: parsed.data.early_bird_remaining,
        expiresAt: parsed.data.expires_at,
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async processTipTapPayment(
    orderCode: string,
    amount: number,
    tiptapId?: string,
    payload?: unknown,
  ): Promise<ProcessPaymentResult> {
    try {
      const { data, error } = await this.#client.rpc("process_tiptap_payment", {
        p_order_code: orderCode,
        p_amount: amount,
        p_tiptap_id: tiptapId ?? null,
        p_payload: payload ?? null,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0 || !rows[0]) {
        throw AppError.internal("process_tiptap_payment returned no data");
      }

      const parsed = ProcessPaymentRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("process_tiptap_payment returned unexpected shape");
      }

      return {
        outcome: parsed.data.outcome,
        userId: parsed.data.user_id,
        telegramUserId: parsed.data.telegram_user_id,
        newPlan: parsed.data.new_plan,
        subscriptionExpiresAt: parsed.data.subscription_expires_at,
        amountPaid: parsed.data.amount_paid,
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const { data, error } = await this.#client.rpc("get_user_subscription", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        return null;
      }

      const parsed = UserSubscriptionRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("get_user_subscription returned unexpected shape");
      }

      return {
        planKey: parsed.data.plan_key,
        startsAt: parsed.data.starts_at,
        expiresAt: parsed.data.expires_at,
        status: parsed.data.status,
        daysRemaining: parsed.data.days_remaining,
      };
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown;
      throw toDatabaseError(thrown);
    }
  }
}
