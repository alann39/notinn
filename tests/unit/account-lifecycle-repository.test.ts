import { assertEquals, assertRejects } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { AccountLifecycleRepository } from "../../supabase/functions/_shared/repositories/account-lifecycle.repository.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

Deno.test("account lifecycle rows are validated and mapped", async () => {
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      assertEquals(fn, "get_account_lifecycle");
      assertEquals(args, { p_user_id: USER_ID });
      return Promise.resolve({
        data: [{
          account_status: "deletion_pending",
          deletion_requested_at: "2026-09-21T12:00:00Z",
          deletion_scheduled_at: "2026-09-28T12:00:00Z",
          deleted_at: null,
        }],
        error: null,
      });
    },
  };

  const repository = new AccountLifecycleRepository(client as never);
  assertEquals(await repository.get(USER_ID), {
    status: "deletion_pending",
    deletionRequestedAt: "2026-09-21T12:00:00Z",
    deletionScheduledAt: "2026-09-28T12:00:00Z",
    deletedAt: null,
  });
});

Deno.test("deletion request and cancellation use owner-scoped RPCs", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "request_account_deletion") {
        return Promise.resolve({
          data: [{
            outcome: "scheduled",
            deletion_scheduled_at: "2026-09-28T12:00:00Z",
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: "cancelled", error: null });
    },
  };

  const repository = new AccountLifecycleRepository(client as never);
  assertEquals(await repository.requestDeletion(USER_ID), {
    outcome: "scheduled",
    deletionScheduledAt: "2026-09-28T12:00:00Z",
  });
  assertEquals(await repository.cancelDeletion(USER_ID), "cancelled");
  assertEquals(calls, [
    { fn: "request_account_deletion", args: { p_user_id: USER_ID } },
    { fn: "cancel_account_deletion", args: { p_user_id: USER_ID } },
  ]);
});

Deno.test("unexpected lifecycle results fail closed", async () => {
  const client = {
    rpc() {
      return Promise.resolve({ data: [{ account_status: "unknown" }], error: null });
    },
  };
  const repository = new AccountLifecycleRepository(client as never);
  await assertRejects(
    () => repository.get(USER_ID),
    AppError,
  );
});
