import { loadScriptConfig } from "../supabase/functions/_shared/config/env.ts";
import { toAppError } from "../supabase/functions/_shared/errors/app-error.ts";
import {
  getMe,
  getWebhookInfo,
  setWebhook,
  SUBSCRIBED_UPDATE_KINDS,
} from "../supabase/functions/_shared/telegram/client.ts";
import { requireConfirmation } from "./lib/prompt.ts";

/**
 * Register the Telegram webhook.
 *
 * Run with `deno task webhook:set`. Add `--yes` to skip the confirmation.
 *
 * The script does four things in order, and the order matters:
 *
 *   1. It calls `getMe` before touching the webhook. A wrong bot token would
 *      otherwise surface as an opaque refusal halfway through, leaving the
 *      operator unsure whether anything changed. `getMe` proves the token works
 *      and names the bot it belongs to, before any mutation happens.
 *
 *   2. It registers the webhook.
 *
 *   3. It reads the webhook back and verifies what Telegram actually stored.
 *      `setWebhook` returning true means Telegram accepted the call, not that
 *      the resulting state is what was intended; only a read-back proves that.
 *
 *   4. It checks the read-back's `allowed_updates` against what was requested.
 *
 * Nothing it prints contains the bot token or the webhook secret.
 */

async function main(): Promise<void> {
  const config = await loadScriptConfig();

  if (config.webhookUrl === null) {
    console.error(
      "TELEGRAM_WEBHOOK_URL is not set.\n\n" +
        "Set it to the deployed function URL, which looks like:\n" +
        "  https://<project-ref>.supabase.co/functions/v1/telegram-webhook\n\n" +
        "Deploy the function first with:\n" +
        "  supabase functions deploy telegram-webhook --no-verify-jwt",
    );
    Deno.exit(1);
  }

  if (config.webhookSecret === null) {
    console.error(
      "TELEGRAM_WEBHOOK_SECRET is not set.\n\n" +
        "Generate one, store it as a Supabase secret, and put the same value in .env:\n" +
        "  openssl rand -hex 32\n" +
        "  supabase secrets set TELEGRAM_WEBHOOK_SECRET=<value>",
    );
    Deno.exit(1);
  }

  // --- 1. Prove the token works -------------------------------------------
  const identity = await getMe(config.botToken);
  console.log(`Bot:        @${identity.username ?? "(no username)"} (${identity.first_name})`);

  const existing = await getWebhookInfo(config.botToken);
  console.log(`Current:    ${existing.url === "" ? "(no webhook registered)" : existing.url}`);
  console.log(`Target:     ${config.webhookUrl}`);
  console.log(`Updates:    ${SUBSCRIBED_UPDATE_KINDS.join(", ")}`);

  if (existing.url === config.webhookUrl) {
    console.log("\nThe webhook is already registered at this URL. Re-registering refreshes it.");
  }

  await requireConfirmation(Deno.args, "\nRegister this webhook?");

  // --- 2. Register ---------------------------------------------------------
  await setWebhook(config.botToken, {
    url: config.webhookUrl,
    secretToken: config.webhookSecret,
    allowedUpdates: SUBSCRIBED_UPDATE_KINDS,
  });

  // --- 3. Verify what Telegram actually stored ----------------------------
  const after = await getWebhookInfo(config.botToken);

  if (after.url !== config.webhookUrl) {
    console.error(
      `\nVerification failed: Telegram reports the webhook URL as ` +
        `"${after.url || "(empty)"}" rather than the requested value.`,
    );
    Deno.exit(1);
  }

  const allowed = after.allowed_updates ?? [];
  const allowedMatches = SUBSCRIBED_UPDATE_KINDS.every((kind) => allowed.includes(kind));

  console.log("\nRegistered and verified.");
  console.log(`  url                  ${after.url}`);
  console.log(`  pending updates      ${after.pending_update_count}`);
  console.log(`  allowed updates      ${allowed.length === 0 ? "(all)" : allowed.join(", ")}`);
  console.log(`  custom certificate   ${after.has_custom_certificate}`);

  if (!allowedMatches) {
    console.warn(
      "\nWarning: allowed_updates does not include every kind Notinn expects. " +
        "Telegram may be withholding deliveries.",
    );
  }

  if (after.last_error_message !== undefined) {
    const when = after.last_error_date === undefined
      ? ""
      : ` at ${new Date(after.last_error_date * 1000).toISOString()}`;
    console.warn(`\nTelegram reports a recent delivery error${when}:`);
    console.warn(`  ${after.last_error_message}`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (thrown) {
    const error = toAppError(thrown);
    console.error(`\nwebhook:set failed — ${error.publicMessage}`);
    if (error.internalDetail !== undefined) console.error(error.internalDetail);
    Deno.exit(1);
  }
}
