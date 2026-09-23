import { assertEquals } from "@std/assert";
import { AuthLinkRepository } from "../../supabase/functions/_shared/repositories/auth-link.repository.ts";
import type { ServiceClient } from "../../supabase/functions/_shared/db/client.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

Deno.test("AuthLinkRepository.createToken calls create_auth_link_token RPC", async () => {
  const calls: { rpc: string; args: unknown }[] = [];
  const fakeClient = {
    rpc: (name: string, args: unknown) => {
      calls.push({ rpc: name, args });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as ServiceClient;

  const repo = new AuthLinkRepository(fakeClient);
  const expiresAt = new Date("2026-09-22T21:00:00Z");
  await repo.createToken(USER_ID, "test-nonce", expiresAt);

  assertEquals(calls.length, 1);
  assertEquals(calls[0]?.rpc, "create_auth_link_token");
  assertEquals(calls[0]?.args, {
    p_user_id: USER_ID,
    p_nonce: "test-nonce",
    p_expires_at: "2026-09-22T21:00:00.000Z",
  });
});
