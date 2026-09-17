import { assert, assertEquals } from "@std/assert";
import { TELEGRAM_SECRET_HEADER } from "../../supabase/functions/_shared/config/constants.ts";
import { textUpdate } from "../fixtures/telegram/builders.ts";

/**
 * The deployed endpoint, over HTTP.
 *
 * Everything else in the suite tests the code. This tests the deployment: that
 * the function is reachable, that its environment is configured, that the
 * platform has not stripped a header it relies on, and that `verify_jwt = false`
 * took effect — a setting that lives in `supabase/config.toml` and is invisible
 * to every other kind of test.
 *
 * The case it exists for is narrow and real: a deployment where the secret token
 * was never registered. Telegram would then echo no header, every delivery would
 * be refused with a 401, and the only symptom would be a bot that never replies
 * while the logs look like hostile traffic.
 *
 * Ignored unless NOTINN_TEST_WEBHOOK_URL and NOTINN_TEST_WEBHOOK_SECRET are set.
 * The secret is the one configured on the deployment, and this suite is the only
 * place a working secret is used outside the deployment itself.
 */

const WEBHOOK_URL = Deno.env.get("NOTINN_TEST_WEBHOOK_URL")?.trim() ?? "";
const WEBHOOK_SECRET = Deno.env.get("NOTINN_TEST_WEBHOOK_SECRET")?.trim() ?? "";

const ENABLED = WEBHOOK_URL !== "" && WEBHOOK_SECRET !== "";

Deno.test({
  name: "no production environment is targeted",
  fn: () => {
    // Asserted unconditionally, so that a misconfigured run stops before the
    // first request is sent rather than after.
    assert(
      Deno.env.get("NOTINN_ENV") !== "production" || !ENABLED,
      "NOTINN_ENV=production is set with a webhook target configured. Refusing to run.",
    );
  },
});

/** POST one update to the deployed function. */
async function post(body: unknown, secret: string | null): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set(TELEGRAM_SECRET_HEADER, secret);

  return await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test({
  name: "the deployment is reachable and accepts a signed delivery",
  ignore: !ENABLED,
  fn: async () => {
    // A unique update id per run, in the reserved synthetic range, so the
    // deployment's database sees a genuine first delivery every time.
    const updateId = 4_000_000_000_000 + (Date.now() % 1_000_000_000);

    const response = await post(textUpdate({ updateId, userId: updateId }), WEBHOOK_SECRET);

    assertEquals(response.status, 200, `the deployment answered ${response.status}`);
    assertEquals(await response.json(), { ok: true });
  },
});

Deno.test({
  name: "the deployment refuses a delivery with no secret",
  ignore: !ENABLED,
  fn: async () => {
    // The check that proves the registration carried a secret_token. A 401 here
    // is the deployment working.
    const response = await post(textUpdate(), null);

    assertEquals(response.status, 401);
    assertEquals(await response.text(), "");
  },
});

Deno.test({
  name: "the deployment refuses a delivery with a wrong secret",
  ignore: !ENABLED,
  fn: async () => {
    const response = await post(textUpdate(), `${WEBHOOK_SECRET}_wrong`);

    assertEquals(response.status, 401);
    assertEquals(await response.text(), "");
  },
});

Deno.test({
  name: "the deployment does not require a Supabase JWT",
  ignore: !ENABLED,
  fn: async () => {
    // `verify_jwt = false` in supabase/config.toml. If it were re-enabled, every
    // request above would be refused by the platform with a 401 before the
    // function ran — and the failure would look identical to a wrong secret.
    // This test passes only because the request above reached the function.
    const response = await post(textUpdate(), WEBHOOK_SECRET);

    assert(
      response.status !== 401 || response.headers.get("content-type") !== null,
      "the platform refused the request before the function ran",
    );
    assertEquals(response.status, 200);
  },
});

Deno.test({
  name: "the deployment acknowledges a redelivery without reporting a failure",
  ignore: !ENABLED,
  fn: async () => {
    // Telegram's redelivery, over the wire. The second delivery is a duplicate at
    // the database and must still be acknowledged, or Telegram would redeliver
    // forever.
    const updateId = 4_000_000_000_000 + (Date.now() % 1_000_000_000) + 500_000;

    const first = await post(textUpdate({ updateId, userId: updateId }), WEBHOOK_SECRET);
    const second = await post(textUpdate({ updateId, userId: updateId }), WEBHOOK_SECRET);

    assertEquals(first.status, 200);
    assertEquals(second.status, 200);
    assertEquals(await first.text(), await second.text());
  },
});

Deno.test({
  name: "the deployment acknowledges a group message without acting on it",
  ignore: !ENABLED,
  fn: async () => {
    const update = textUpdate({ chatType: "group", chatId: 900_000_500 });
    const response = await post(update, WEBHOOK_SECRET);

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { ok: true });
  },
});

Deno.test({
  name: "the deployment never returns a stack trace or an internal name",
  ignore: !ENABLED,
  fn: async () => {
    // Three ways to provoke a failure, and none of them may describe the system.
    const bodies = [
      "{ not json",
      JSON.stringify({ not: "an update" }),
      JSON.stringify({ update_id: "wrong type" }),
    ];

    for (const body of bodies) {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          [TELEGRAM_SECRET_HEADER]: WEBHOOK_SECRET,
        }),
        body,
      });

      const text = await response.text();
      for (
        const fragment of [
          "at ",
          ".ts:",
          "Error",
          "supabase",
          "postgres",
          "deno",
          "stack",
        ]
      ) {
        assertEquals(
          text.includes(fragment),
          false,
          `a failure response exposed ${fragment}: ${text}`,
        );
      }
    }
  },
});
