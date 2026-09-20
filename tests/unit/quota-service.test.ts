import { assertEquals, assertRejects } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { withConsumedQuota } from "../../supabase/functions/_shared/services/quota.service.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RESERVATION_ID = "22222222-2222-4222-8222-222222222222";

function harness(reserveError?: AppError, outcome: "reserved" | "existing_reserved" = "reserved") {
  const events: string[] = [];
  return {
    events,
    quota: {
      reserve: () => {
        events.push("reserve");
        return reserveError === undefined
          ? Promise.resolve({ reservationId: RESERVATION_ID, outcome })
          : Promise.reject(reserveError);
      },
      consume: (userId: string, reservationId: string, units: number) => {
        events.push(`consume:${userId}:${reservationId}:${units}`);
        return Promise.resolve();
      },
    },
  };
}

Deno.test("a successful provider operation reserves before it starts and then consumes", async () => {
  const test = harness();
  const result = await withConsumedQuota(
    test.quota,
    {
      userId: USER_ID,
      metric: "note_generation",
      reservationKey: "job:synthetic:attempt:0",
    },
    () => {
      test.events.push("provider");
      return Promise.resolve("generated");
    },
  );

  assertEquals(result, "generated");
  assertEquals(test.events, [
    "reserve",
    "provider",
    `consume:${USER_ID}:${RESERVATION_ID}:1`,
  ]);
});

Deno.test("a provider failure still consumes the logical operation", async () => {
  const test = harness();
  await assertRejects(() =>
    withConsumedQuota(
      test.quota,
      {
        userId: USER_ID,
        metric: "regeneration",
        reservationKey: "callback:synthetic:regeneration",
      },
      () => {
        test.events.push("provider");
        return Promise.reject(AppError.providerError("synthetic"));
      },
    )
  );

  assertEquals(test.events, [
    "reserve",
    "provider",
    `consume:${USER_ID}:${RESERVATION_ID}:1`,
  ]);
});

Deno.test("a refused reservation prevents the provider call", async () => {
  const test = harness(AppError.quotaExceeded("synthetic allowance exhausted"));
  await assertRejects(() =>
    withConsumedQuota(
      test.quota,
      {
        userId: USER_ID,
        metric: "semantic_answer",
        reservationKey: "command:synthetic:semantic_answer",
      },
      () => {
        test.events.push("provider");
        return Promise.resolve("must not run");
      },
    )
  );

  assertEquals(test.events, ["reserve"]);
});

Deno.test("an in-flight duplicate reservation does not repeat provider work", async () => {
  const test = harness(undefined, "existing_reserved");
  await assertRejects(() =>
    withConsumedQuota(
      test.quota,
      {
        userId: USER_ID,
        metric: "regeneration",
        reservationKey: "callback:synthetic:regeneration",
      },
      () => {
        test.events.push("provider");
        return Promise.resolve("must not run");
      },
    )
  );

  assertEquals(test.events, ["reserve"]);
});
