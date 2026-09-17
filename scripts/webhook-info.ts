import { loadScriptConfig } from "../supabase/functions/_shared/config/env.ts";
import { toAppError } from "../supabase/functions/_shared/errors/app-error.ts";
import { getMe, getWebhookInfo } from "../supabase/functions/_shared/telegram/client.ts";

/**
 * Inspect the Telegram webhook, without changing anything.
 *
 * Run with `deno task webhook:info`.
 *
 * This is the read-only counterpart to `webhook:set` and `webhook:delete`, and
 * it is the first thing to run when the bot appears to be doing nothing. A
 * silent bot has several distinct causes that look identical from the outside —
 * no webhook registered, a webhook pointing at a stale deployment, or a webhook
 * that is registered and failing on every delivery. Telegram reports all three
 * separately, so the diagnosis is usually immediate.
 */

async function main(): Promise<void> {
  const config = await loadScriptConfig();

  const identity = await getMe(config.botToken);
  const info = await getWebhookInfo(config.botToken);

  console.log("Telegram webhook status");
  console.log("=======================");
  console.log(
    `bot                  @${identity.username ?? "(no username)"} (${identity.first_name})`,
  );
  console.log(`bot id               ${identity.id}`);
  console.log("");

  if (info.url === "") {
    console.log("webhook              NOT REGISTERED");
    console.log("");
    console.log("Telegram is not delivering anything to Notinn. Messages sent to the bot");
    console.log("are being queued, not processed.");
    console.log("");
    console.log("Register it with:  deno task webhook:set");
    return;
  }

  console.log(`webhook url          ${info.url}`);
  console.log(`pending updates      ${info.pending_update_count}`);
  console.log(`custom certificate   ${info.has_custom_certificate}`);
  console.log(`max connections      ${info.max_connections ?? "(default)"}`);
  console.log(
    `allowed updates      ${
      info.allowed_updates === undefined || info.allowed_updates.length === 0
        ? "(all)"
        : info.allowed_updates.join(", ")
    }`,
  );

  // --- Delivery health -----------------------------------------------------
  if (info.last_error_message !== undefined) {
    const when = info.last_error_date === undefined
      ? "(time unknown)"
      : new Date(info.last_error_date * 1000).toISOString();

    console.log("");
    console.log(`LAST DELIVERY ERROR  ${when}`);
    console.log(`                     ${info.last_error_message}`);
    console.log("");
    console.log("Telegram retries a failed delivery for a while, then gives up. A persistent");
    console.log("error here means updates are being lost. Check the function logs in the");
    console.log("Supabase dashboard for the matching request.");
  } else {
    console.log("");
    console.log("last error           none reported");
  }

  if (info.pending_update_count > 0) {
    console.log("");
    console.log(
      `warning: ${info.pending_update_count} update(s) are queued and undelivered. If this ` +
        `number is growing, deliveries are failing faster than Telegram can retry them.`,
    );
  }

  // --- Configuration drift -------------------------------------------------
  if (config.webhookUrl !== null && config.webhookUrl !== info.url) {
    console.log("");
    console.log("warning: the registered webhook does not match TELEGRAM_WEBHOOK_URL.");
    console.log(`  registered  ${info.url}`);
    console.log(`  configured  ${config.webhookUrl}`);
    console.log("  Updates are going somewhere other than where this environment expects.");
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (thrown) {
    const error = toAppError(thrown);
    console.error(`\nwebhook:info failed — ${error.publicMessage}`);
    if (error.internalDetail !== undefined) console.error(error.internalDetail);
    Deno.exit(1);
  }
}
