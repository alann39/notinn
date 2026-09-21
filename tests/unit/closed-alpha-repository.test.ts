import { assertEquals } from "@std/assert";
import {
  ClosedAlphaRepository,
  normaliseInviteCode,
} from "../../supabase/functions/_shared/repositories/closed-alpha.repository.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

Deno.test("invite codes normalize without weakening their character boundary", () => {
  assertEquals(normaliseInviteCode("  ntn_abcd1234  "), "NTN_ABCD1234");
  assertEquals(normaliseInviteCode("short"), null);
  assertEquals(normaliseInviteCode("NTN space 123"), null);
});

Deno.test("invite redemption sends only a SHA-256 digest to Postgres", async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve({ data: "activated", error: null });
    },
  };
  const repository = new ClosedAlphaRepository(client as never);

  assertEquals(await repository.redeemInvite(USER_ID, "ntn_abcd1234"), "activated");
  assertEquals(calls[0]?.fn, "redeem_closed_alpha_invite");
  assertEquals(calls[0]?.args.p_user_id, USER_ID);
  const digest = calls[0]?.args.p_code_sha256;
  assertEquals(typeof digest, "string");
  assertEquals((digest as string).length, 64);
  assertEquals(JSON.stringify(calls).includes("NTN_ABCD1234"), false);
});

Deno.test("closed-alpha access rows are validated at the repository boundary", async () => {
  const client = {
    rpc() {
      return Promise.resolve({
        data: [{
          access_status: "active",
          activated_at: "2026-09-21T00:00:00Z",
          suspended_at: null,
        }],
        error: null,
      });
    },
  };
  const repository = new ClosedAlphaRepository(client as never);
  assertEquals(await repository.getAccess(USER_ID), {
    status: "active",
    activatedAt: "2026-09-21T00:00:00Z",
    suspendedAt: null,
  });
});
