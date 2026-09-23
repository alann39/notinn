import { assertEquals, assertNotEquals } from "@std/assert";
import {
  createMagicToken,
  verifyMagicToken,
} from "../../supabase/functions/_shared/security/magic-token.ts";

const TEST_SECRET = "super-secret-key-that-is-long-enough-32bytes";
const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

Deno.test("createMagicToken creates a valid token and verifyMagicToken decodes it", async () => {
  const { token, nonce, expiresAt } = await createMagicToken(TEST_USER_ID, TEST_SECRET, 60_000);

  assertEquals(typeof token, "string");
  assertEquals(typeof nonce, "string");
  assertNotEquals(nonce, "");
  assertEquals(expiresAt instanceof Date, true);

  const verified = await verifyMagicToken(token, TEST_SECRET);
  assertNotEquals(verified, null);
  assertEquals(verified?.user_id, TEST_USER_ID);
  assertEquals(verified?.nonce, nonce);
});

Deno.test("verifyMagicToken rejects a tampered payload", async () => {
  const { token } = await createMagicToken(TEST_USER_ID, TEST_SECRET, 60_000);
  const parts = token.split(".");
  const tamperedPayload = btoa(JSON.stringify({
    user_id: "22222222-2222-4222-8222-222222222222",
    nonce: "fake-nonce",
    exp: Date.now() + 60_000,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const tamperedToken = `${tamperedPayload}.${parts[1] ?? ""}`;
  const verified = await verifyMagicToken(tamperedToken, TEST_SECRET);
  assertEquals(verified, null);
});

Deno.test("verifyMagicToken rejects a tampered signature", async () => {
  const { token } = await createMagicToken(TEST_USER_ID, TEST_SECRET, 60_000);
  const parts = token.split(".");
  const sig = parts[1] ?? "";
  const tamperedSig = sig.slice(0, -2) + "00";
  const tamperedToken = `${parts[0] ?? ""}.${tamperedSig}`;

  const verified = await verifyMagicToken(tamperedToken, TEST_SECRET);
  assertEquals(verified, null);
});

Deno.test("verifyMagicToken rejects an expired token", async () => {
  const { token } = await createMagicToken(TEST_USER_ID, TEST_SECRET, -1000);
  const verified = await verifyMagicToken(token, TEST_SECRET);
  assertEquals(verified, null);
});

Deno.test("verifyMagicToken rejects a different secret", async () => {
  const { token } = await createMagicToken(TEST_USER_ID, TEST_SECRET, 60_000);
  const verified = await verifyMagicToken(token, "different-secret-key-32bytes-long");
  assertEquals(verified, null);
});

Deno.test("verifyMagicToken rejects invalid token formats", async () => {
  assertEquals(await verifyMagicToken("invalid-token", TEST_SECRET), null);
  assertEquals(await verifyMagicToken("", TEST_SECRET), null);
  assertEquals(await verifyMagicToken("abc.def", TEST_SECRET), null);
});
