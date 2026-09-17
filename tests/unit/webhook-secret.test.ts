import { assert, assertEquals, assertRejects } from "@std/assert";
import { TELEGRAM_SECRET_HEADER } from "../../supabase/functions/_shared/config/constants.ts";
import { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { ERROR_CODES } from "../../supabase/functions/_shared/errors/taxonomy.ts";
import { sha256Hex } from "../../supabase/functions/_shared/security/hashing.ts";
import {
  assertWebhookSecret,
  checkWebhookSecret,
  constantTimeEquals,
} from "../../supabase/functions/_shared/security/webhook-secret.ts";

/**
 * Webhook authentication.
 *
 * The secret token is the only thing that distinguishes a genuine Telegram
 * delivery from anyone who has learned the function URL. The endpoint is public
 * — it has to be, because Telegram calls it — so this check is the entire
 * authentication story for the ingress path, and it is asserted here in both
 * directions: the right secret is accepted, and everything else is refused.
 *
 * What is deliberately NOT asserted is the timing behaviour. Proving a function
 * runs in constant time requires statistical timing measurement, which is
 * unreliable in a test runner and would produce a flaky test that fails to
 * detect the thing it claims to check. The mechanism is asserted structurally
 * instead: both inputs are hashed before any comparison happens, so the loop
 * always runs over exactly 32 bytes.
 */

const SECRET_VALUE = "synthetic_webhook_secret_value";
const WRONG_VALUE = "synthetic_webhook_secret_value_but_wrong";

function deliveryWith(secret: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set(TELEGRAM_SECRET_HEADER, secret);

  return new Request("https://synthetic.supabase.co/functions/v1/telegram-webhook", {
    method: "POST",
    headers,
    body: JSON.stringify({ update_id: 900_000_001 }),
  });
}

// --- constantTimeEquals ----------------------------------------------------

Deno.test("equal strings compare equal", async () => {
  assertEquals(await constantTimeEquals("", ""), true);
  assertEquals(await constantTimeEquals("a", "a"), true);
  assertEquals(await constantTimeEquals(SECRET_VALUE, SECRET_VALUE), true);
});

Deno.test("different strings compare unequal", async () => {
  assertEquals(await constantTimeEquals("a", "b"), false);
  assertEquals(await constantTimeEquals(SECRET_VALUE, WRONG_VALUE), false);
});

Deno.test("a string that is a prefix of another does not compare equal", async () => {
  // The case a naive comparison leaks most obviously: it returns after the
  // matching prefix, so the time reveals how much was right.
  assertEquals(await constantTimeEquals("synthetic", "synthetic_webhook"), false);
  assertEquals(await constantTimeEquals("synthetic_webhook", "synthetic"), false);
});

Deno.test("a difference in the last character is detected", async () => {
  assertEquals(await constantTimeEquals("synthetic_secret_a", "synthetic_secret_b"), false);
});

Deno.test("comparison is case-sensitive and byte-exact", async () => {
  assertEquals(await constantTimeEquals("SECRET", "secret"), false);
  assertEquals(await constantTimeEquals("secret ", "secret"), false);
  assertEquals(await constantTimeEquals("secret\n", "secret"), false);
});

Deno.test("strings differing only in length do not compare equal", async () => {
  // A byte-wise loop over unequal lengths would leak the length. Hashing first
  // is what closes that: both sides become 32 bytes before anything is compared.
  assertEquals(await constantTimeEquals("a", "a".repeat(1000)), false);
});

Deno.test("arbitrary values do not collide", async () => {
  // SHA-256 is collision-resistant, so two inputs producing the same digest are
  // the same input for any practical purpose.
  const values = ["", "a", "0", "false", "null", "undefined", " "];

  for (const left of values) {
    for (const right of values) {
      assertEquals(
        await constantTimeEquals(left, right),
        left === right,
        `"${left}" vs "${right}"`,
      );
    }
  }
});

// --- checkWebhookSecret ----------------------------------------------------

Deno.test("the correct secret is accepted", async () => {
  const result = await checkWebhookSecret(deliveryWith(SECRET_VALUE), new Secret(SECRET_VALUE));

  assertEquals(result.ok, true);
  assertEquals(result.reason, "ok");
});

Deno.test("a missing header is refused", async () => {
  // This is what a misconfigured registration looks like: the webhook was
  // registered without a secret_token, so Telegram echoes nothing back.
  const result = await checkWebhookSecret(deliveryWith(null), new Secret(SECRET_VALUE));

  assertEquals(result.ok, false);
  assertEquals(result.reason, "missing_header");
});

Deno.test("an empty header is refused", async () => {
  // Headers can be present and empty, which is a different mistake from absent
  // and must not be treated as a match against an empty expectation.
  const result = await checkWebhookSecret(deliveryWith(""), new Secret(SECRET_VALUE));

  assertEquals(result.ok, false);
  assertEquals(result.reason, "missing_header");
});

Deno.test("a wrong secret is refused", async () => {
  // This is what a hostile caller looks like: they have the URL and guessed.
  const result = await checkWebhookSecret(deliveryWith(WRONG_VALUE), new Secret(SECRET_VALUE));

  assertEquals(result.ok, false);
  assertEquals(result.reason, "mismatch");
});

Deno.test("a secret that is a prefix of the real one is refused", async () => {
  const result = await checkWebhookSecret(
    deliveryWith("synthetic_webhook"),
    new Secret(SECRET_VALUE),
  );

  assertEquals(result.ok, false);
  assertEquals(result.reason, "mismatch");
});

Deno.test("a mismatched secret is not echoed back in the reason", async () => {
  // The result is logged. A reason carrying the presented value would write an
  // attacker's guess into the log — and a lucky guess into the log as a secret.
  const result = await checkWebhookSecret(deliveryWith(WRONG_VALUE), new Secret(SECRET_VALUE));

  assertEquals(JSON.stringify(result).includes(WRONG_VALUE), false);
  assertEquals(JSON.stringify(result).includes(SECRET_VALUE), false);
});

// --- assertWebhookSecret ---------------------------------------------------

Deno.test("a valid delivery passes the assertion", async () => {
  // The assertion returns nothing on success, so the assertion is that this
  // does not throw.
  await assertWebhookSecret(deliveryWith(SECRET_VALUE), new Secret(SECRET_VALUE));
});

Deno.test("an invalid delivery throws a classified, non-retryable error", async () => {
  // Retryability matters here: the HTTP layer answers 401 rather than 5xx, so
  // Telegram does not redeliver a request that will never authenticate.
  const error = await assertRejects(
    () => assertWebhookSecret(deliveryWith(WRONG_VALUE), new Secret(SECRET_VALUE)),
    AppError,
  );

  assertEquals(error.code, ERROR_CODES.UNAUTHORIZED);
  assertEquals(error.retryable, false);
  assertEquals(error.httpStatus, 401);
});

Deno.test("the thrown error distinguishes the two failure modes for operators", async () => {
  const missing = await assertRejects(
    () => assertWebhookSecret(deliveryWith(null), new Secret(SECRET_VALUE)),
    AppError,
  );
  const mismatch = await assertRejects(
    () => assertWebhookSecret(deliveryWith(WRONG_VALUE), new Secret(SECRET_VALUE)),
    AppError,
  );

  assert((missing.internalDetail ?? "").includes("missing_header"));
  assert((mismatch.internalDetail ?? "").includes("mismatch"));
});

Deno.test("the thrown error carries no part of either secret", async () => {
  const error = await assertRejects(
    () => assertWebhookSecret(deliveryWith(WRONG_VALUE), new Secret(SECRET_VALUE)),
    AppError,
  );

  assert(!JSON.stringify(error).includes(WRONG_VALUE));
  assert(!JSON.stringify(error).includes(SECRET_VALUE));
  assert(!error.message.includes("synthetic"));
});

// --- Hashing ---------------------------------------------------------------

Deno.test("the digest is a stable, well-formed SHA-256 hex string", async () => {
  const digest = await sha256Hex("synthetic input");

  assertEquals(digest.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(digest), true);
  assertEquals(digest, await sha256Hex("synthetic input"));
  assert(digest !== await sha256Hex("synthetic input "));
});

Deno.test("the digest of an empty string is the SHA-256 of nothing", async () => {
  // A known vector, so a change to the encoding is caught rather than silently
  // altering every fingerprint the system records.
  assertEquals(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});
