import { loadScriptConfig } from "../supabase/functions/_shared/config/env.ts";
import { toAppError } from "../supabase/functions/_shared/errors/app-error.ts";
import { deleteWebhook, getMe, getWebhookInfo } from "./lib/telegram-api.ts";
import { requireConfirmation } from "./lib/prompt.ts";

/**
 * Remove the Telegram webhook.
 *
 * Run with `deno task webhook:delete`. Add `--yes` to skip the confirmation.
 *
 * Telegram stops delivering updates the moment this succeeds, and any update
 * already queued is discarded only if `--drop-pending` is passed. The safe
 * default is to leave the queue alone: an update waiting in Telegram's queue may
 * be a real person's note, and dropping it loses their message with no error
 * anywhere.
 *
 * After this runs, messages sent to the bot go nowhere. That is the point — it
 * is how a developer stops the deployed function from competing with a local
 * one — but it is worth being deliberate about.
 */

const DROP_PENDING_FLAG = "--drop-pending";

async function main(): Promise<void> {
  const config = await loadScriptConfig();
  const dropPendingUpdates = Deno.args.includes(DROP_PENDING_FLAG);

  const identity = await getMe(config.botToken);
  const before = await getWebhookInfo(config.botToken);

  console.log(`Bot:     @${identity.username ?? "(no username)"}`);

  if (before.url === "") {
    console.log("No webhook is currently registered. Nothing to do.");
    return;
  }

  console.log(`Current: ${before.url}`);
  console.log(`Queued:  ${before.pending_update_count} update(s) awaiting delivery`);

  if (dropPendingUpdates && before.pending_update_count > 0) {
    console.log(`\n${DROP_PENDING_FLAG} is set: those queued updates will be discarded.`);
  }

  await requireConfirmation(Deno.args, "\nRemove this webhook?");

  await deleteWebhook(config.botToken, { dropPendingUpdates });

  const after = await getWebhookInfo(config.botToken);

  if (after.url !== "") {
    console.error(`\nVerification failed: Telegram still reports a webhook at "${after.url}".`);
    Deno.exit(1);
  }

  console.log("\nWebhook removed and verified. The bot will no longer receive updates.");
}

if (import.meta.main) {
  try {
    await main();
  } catch (thrown) {
    const error = toAppError(thrown);
    console.error(`\nwebhook:delete failed — ${error.publicMessage}`);
    if (error.internalDetail !== undefined) console.error(error.internalDetail);
    Deno.exit(1);
  }
}
