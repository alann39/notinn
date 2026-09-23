import { loadOperatorConfig } from "../supabase/functions/_shared/config/env.ts";
import { createServiceClient } from "../supabase/functions/_shared/db/client.ts";
import { requireConfirmation } from "./lib/prompt.ts";

function usage(): never {
  console.error([
    "Usage:",
    "  deno task admin list",
    "  deno task admin add <telegram-user-id>",
    "  deno task admin remove <telegram-user-id>",
    "",
    "Add --yes for non-interactive execution.",
  ].join("\n"));
  Deno.exit(1);
}

function positiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = Deno.args.filter((arg) => arg !== "--yes");
  const action = args[0];
  if (action === undefined) usage();

  const config = await loadOperatorConfig();
  if (config.environment === "production") {
    throw new Error("Admin operator commands are disabled for NOTINN_ENV=production.");
  }
  const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);

  if (action === "list") {
    const { data, error } = await client
      .from("admin_users")
      .select("user_id, created_at, created_by, users:user_id (telegram_user_id, status, plan_key)")
      .order("created_at", { ascending: false });

    if (error !== null) {
      throw new Error(`Failed to list admin users: ${error.message}`);
    }

    console.log("Notinn Admin Users:");
    console.log("─".repeat(60));
    for (
      const row of (data ?? []) as Array<{
        user_id: string;
        created_at: string;
        created_by: string;
        users: { telegram_user_id?: number; status?: string; plan_key?: string } | null;
      }>
    ) {
      const u = row.users ?? {};
      console.log(`User ID:      ${row.user_id}`);
      console.log(`Telegram ID:  ${u.telegram_user_id ?? "unknown"}`);
      console.log(`Plan:         ${u.plan_key ?? "unknown"} | Status: ${u.status ?? "unknown"}`);
      console.log(`Created:      ${row.created_at} (${row.created_by})`);
      console.log("─".repeat(60));
    }
    return;
  }

  if (action === "add") {
    const tid = positiveInteger(args[1], "telegram-user-id");
    await requireConfirmation(Deno.args, `Grant admin access to Telegram user ${tid}?`);

    const { data: userData, error: userError } = await client
      .from("users")
      .select("id")
      .eq("telegram_user_id", tid)
      .maybeSingle();

    if (userError !== null || !userData) {
      throw new Error(`User with Telegram ID ${tid} not found.`);
    }

    const { error } = await client
      .from("admin_users")
      .insert({ user_id: userData.id, created_by: "cli" });

    if (error !== null) {
      if (error.code === "23505") {
        console.log(`User ${tid} is already an admin.`);
        return;
      }
      throw new Error(`Failed to add admin: ${error.message}`);
    }

    console.log(`Successfully added Telegram user ${tid} as admin.`);
    return;
  }

  if (action === "remove") {
    const tid = positiveInteger(args[1], "telegram-user-id");
    await requireConfirmation(Deno.args, `Revoke admin access from Telegram user ${tid}?`);

    const { data: userData, error: userError } = await client
      .from("users")
      .select("id")
      .eq("telegram_user_id", tid)
      .maybeSingle();

    if (userError !== null || !userData) {
      throw new Error(`User with Telegram ID ${tid} not found.`);
    }

    const { error } = await client
      .from("admin_users")
      .delete()
      .eq("user_id", userData.id);

    if (error !== null) {
      throw new Error(`Failed to remove admin: ${error.message}`);
    }

    console.log(`Successfully removed Telegram user ${tid} from admin.`);
    return;
  }

  usage();
}

if (import.meta.main) {
  await main();
}
