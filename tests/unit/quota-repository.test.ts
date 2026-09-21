import { assertEquals, assertRejects } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { QuotaRepository } from "../../supabase/functions/_shared/repositories/quota.repository.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

Deno.test("a daily quota refusal is distinct from monthly exhaustion", async () => {
  const client = {
    rpc() {
      return Promise.resolve({
        data: [{
          outcome: "daily_exceeded",
          reservation_id: null,
          plan_key: "alpha",
          metric: "note_generation",
          monthly_limit: 500,
          used_units: 10,
          reserved_units: 0,
          period_start: "2026-09-01",
          period_end: "2026-10-01",
          daily_limit: 50,
          daily_used_units: 50,
          daily_reserved_units: 0,
          usage_date: "2026-09-21",
        }],
        error: null,
      });
    },
  };
  const repository = new QuotaRepository(client as never);

  await assertRejects(
    () =>
      repository.reserve({
        userId: USER_ID,
        metric: "note_generation",
        reservationKey: "job:synthetic:attempt:0",
      }),
    AppError,
    "limit for today",
  );
  try {
    await repository.reserve({
      userId: USER_ID,
      metric: "note_generation",
      reservationKey: "job:synthetic:attempt:1",
    });
  } catch (thrown) {
    assertEquals((thrown as AppError).code, "daily_quota_exceeded");
  }
});
