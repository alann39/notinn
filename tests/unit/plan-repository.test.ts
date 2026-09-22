import { assertEquals, assertRejects } from "@std/assert";
import { PlanRepository } from "../../supabase/functions/_shared/repositories/plan.repository.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";

const PRO_UUID = "550e8400-e29b-41d4-a716-446655440001";

function harness(rpcData: unknown = null, rpcError: unknown = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];

  const client = {
    rpc: (
      fn: string,
      args: Record<string, unknown> = {},
    ) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpcData, error: rpcError });
    },
  } as never;

  const repo = new PlanRepository(client);
  return { repo, calls };
}

function dbError() {
  return { code: "42P01", message: "relation does not exist" };
}

// --- getCatalogue tests -----------------------------------------------------

Deno.test("getCatalogue returns parsed plan list", async () => {
  const { repo, calls } = harness([
    {
      plan_key: "free",
      display_name: "Free",
      price_monthly_usd: null,
      features: ["50 new notes/month"],
      display_order: 0,
    },
    {
      plan_key: "pro",
      display_name: "Pro",
      price_monthly_usd: 9.99,
      features: ["1,000 new notes/month", "Priority processing"],
      display_order: 1,
    },
  ]);

  const catalogue = await repo.getCatalogue();

  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.fn, "get_plan_catalogue");
  assertEquals(catalogue.length, 2);
  assertEquals(catalogue[0]!.planKey, "free");
  assertEquals(catalogue[0]!.priceMonthlyUsd, null);
  assertEquals(catalogue[0]!.features.length, 1);
  assertEquals(catalogue[1]!.planKey, "pro");
  assertEquals(catalogue[1]!.priceMonthlyUsd, 9.99);
  assertEquals(catalogue[1]!.features.length, 2);
});

Deno.test("getCatalogue returns empty array for no plans", async () => {
  const { repo } = harness([]);

  const catalogue = await repo.getCatalogue();

  assertEquals(catalogue.length, 0);
});

Deno.test("getCatalogue throws on database error", async () => {
  const { repo } = harness(null, dbError());

  await assertRejects(() => repo.getCatalogue(), AppError);
});

// --- changePlan tests -------------------------------------------------------

Deno.test("changePlan returns changed on success", async () => {
  const { repo } = harness("changed");

  const outcome = await repo.changePlan(PRO_UUID, "pro", "operator", "test upgrade");

  assertEquals(outcome, "changed");
});

Deno.test("changePlan returns already_on_plan when unchanged", async () => {
  const { repo } = harness("already_on_plan");

  const outcome = await repo.changePlan(PRO_UUID, "free", "operator");

  assertEquals(outcome, "already_on_plan");
});

Deno.test("changePlan returns not_found for missing user", async () => {
  const { repo } = harness("not_found");

  const outcome = await repo.changePlan(PRO_UUID, "pro", "operator");

  assertEquals(outcome, "not_found");
});

Deno.test("changePlan returns plan_not_found for invalid plan", async () => {
  const { repo } = harness("plan_not_found");

  const outcome = await repo.changePlan(PRO_UUID, "nonexistent", "operator");

  assertEquals(outcome, "plan_not_found");
});

Deno.test("changePlan returns plan_inactive for inactive plan", async () => {
  const { repo } = harness("plan_inactive");

  const outcome = await repo.changePlan(PRO_UUID, "old_plan", "operator");

  assertEquals(outcome, "plan_inactive");
});

Deno.test("changePlan throws on database error", async () => {
  const { repo } = harness(null, dbError());

  await assertRejects(
    () => repo.changePlan(PRO_UUID, "pro", "operator"),
    AppError,
  );
});
