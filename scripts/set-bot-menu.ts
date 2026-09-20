import { loadScriptConfig } from "../supabase/functions/_shared/config/env.ts";
import { toAppError } from "../supabase/functions/_shared/errors/app-error.ts";
import {
  getMe,
  getMyCommands,
  setDefaultCommandMenuButton,
  setMyCommands,
  type TelegramBotCommand,
} from "../supabase/functions/_shared/telegram/client.ts";
import { requireConfirmation } from "./lib/prompt.ts";

export const NOTINN_BOT_COMMANDS: readonly TelegramBotCommand[] = [
  { command: "start", description: "Start or reopen Notinn" },
  { command: "menu", description: "Open the main menu" },
  { command: "recent", description: "View recent saved notes" },
  { command: "search", description: "Search your saved notes" },
  { command: "ask", description: "Ask a question about your notes" },
  { command: "templates", description: "View and manage note templates" },
  { command: "settings", description: "Change your Notinn preferences" },
  { command: "help", description: "Open help and privacy guidance" },
];

async function main(): Promise<void> {
  const config = await loadScriptConfig();
  const identity = await getMe(config.botToken);

  console.log(`Bot: @${identity.username ?? "(no username)"} (${identity.first_name})`);
  console.log("Commands:");
  for (const item of NOTINN_BOT_COMMANDS) console.log(`  /${item.command} — ${item.description}`);

  await requireConfirmation(Deno.args, "\nSet this private-chat command menu?");

  await setMyCommands(config.botToken, NOTINN_BOT_COMMANDS);
  await setDefaultCommandMenuButton(config.botToken);

  const stored = await getMyCommands(config.botToken);
  if (JSON.stringify(stored) !== JSON.stringify(NOTINN_BOT_COMMANDS)) {
    console.error("\nVerification failed: Telegram returned a different command list.");
    Deno.exit(1);
  }

  console.log("\nCommand menu configured and verified.");
}

if (import.meta.main) {
  try {
    await main();
  } catch (thrown) {
    const error = toAppError(thrown);
    console.error(`\nbot-menu:set failed — ${error.publicMessage}`);
    if (error.internalDetail !== undefined) console.error(error.internalDetail);
    Deno.exit(1);
  }
}
