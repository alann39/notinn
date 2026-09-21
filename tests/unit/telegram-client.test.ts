import { assertEquals, assertRejects } from "@std/assert";
import { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import {
  editMessageReplyMarkup,
  editMessageText,
} from "../../supabase/functions/_shared/telegram/client.ts";

function telegramFailure(description: string, errorCode = 400): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ ok: false, error_code: errorCode, description }),
        { headers: { "content-type": "application/json" } },
      ),
    );
}

Deno.test("identical Telegram message edits are accepted as idempotent success", async () => {
  const fetch = telegramFailure(
    "Bad Request: message is not modified: specified new message content and reply markup are exactly the same",
  );
  const token = new Secret("synthetic-token");

  assertEquals(await editMessageText(token, 42, 7, "unchanged", { fetch }), true);
  assertEquals(
    await editMessageReplyMarkup(token, 42, 7, { inline_keyboard: [] }, { fetch }),
    true,
  );
});

Deno.test("other Telegram edit failures are not suppressed", async () => {
  const token = new Secret("synthetic-token");

  await assertRejects(
    () =>
      editMessageText(token, 42, 7, "invalid", {
        fetch: telegramFailure("Bad Request: message to edit not found"),
      }),
    AppError,
  );
});
