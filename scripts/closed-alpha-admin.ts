import { loadOperatorConfig } from "../supabase/functions/_shared/config/env.ts";
import { createServiceClient } from "../supabase/functions/_shared/db/client.ts";
import { sha256Hex } from "../supabase/functions/_shared/security/hashing.ts";
import { requireConfirmation } from "./lib/prompt.ts";

function usage(): never {
  console.error([
    "Usage:",
    "  deno task alpha-admin create-invite <max-redemptions> <valid-days>",
    "  deno task alpha-admin revoke-invite <invite-code>",
    "  deno task alpha-admin activate <telegram-user-id>",
    "  deno task alpha-admin suspend <telegram-user-id>",
    "  deno task alpha-admin pending <telegram-user-id>",
    "",
    "Add --yes for non-interactive execution.",
  ].join("\n"));
  Deno.exit(1);
}

function positiveInteger(value: string | undefined, label: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

function telegramId(value: string | undefined): number {
  return positiveInteger(value, "telegram-user-id", Number.MAX_SAFE_INTEGER);
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `NTN_${
    [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()
  }`;
}

async function main(): Promise<void> {
  const args = Deno.args.filter((arg) => arg !== "--yes");
  const action = args[0];
  if (action === undefined) usage();
  const config = await loadOperatorConfig();
  if (config.environment === "production") {
    throw new Error("Closed-alpha operator commands are disabled for NOTINN_ENV=production.");
  }
  const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);

  if (action === "create-invite") {
    const maxRedemptions = positiveInteger(args[1], "max-redemptions", 10_000);
    const validDays = positiveInteger(args[2], "valid-days", 365);
    await requireConfirmation(
      Deno.args,
      `Create an invite for ${maxRedemptions} redemption(s), valid for ${validDays} day(s)?`,
    );
    const code = generateCode();
    const expiresAt = new Date(Date.now() + validDays * 86_400_000).toISOString();
    const { error } = await client.rpc("create_closed_alpha_invite", {
      p_code_sha256: await sha256Hex(code),
      p_max_redemptions: maxRedemptions,
      p_expires_at: expiresAt,
    });
    if (error !== null) {
      throw new Error(`Invite creation failed: ${error.code ?? "database_error"}`);
    }
    console.log("Invite created. Store this code securely; it cannot be recovered:");
    console.log(code);
    console.log(`Telegram activation command: /start ${code}`);
    return;
  }

  if (action === "revoke-invite") {
    const code = args[1]?.trim().toUpperCase();
    if (code === undefined || !/^[A-Z0-9_-]{8,64}$/.test(code)) {
      throw new Error("invite-code is not valid.");
    }
    await requireConfirmation(Deno.args, "Revoke this closed-alpha invite?");
    const { data, error } = await client.rpc("revoke_closed_alpha_invite", {
      p_code_sha256: await sha256Hex(code),
    });
    if (error !== null) {
      throw new Error(`Invite revocation failed: ${error.code ?? "database_error"}`);
    }
    if (data !== true) throw new Error("No invite matched that code.");
    console.log("Closed-alpha invite revoked.");
    return;
  }

  if (action !== "activate" && action !== "suspend" && action !== "pending") usage();
  const id = telegramId(args[1]);
  await requireConfirmation(Deno.args, `Set Telegram user ${id} to ${action}?`);
  const status = action === "activate" ? "active" : action === "suspend" ? "suspended" : "pending";
  const { data, error } = await client.rpc("set_closed_alpha_access", {
    p_telegram_user_id: id,
    p_access_status: status,
  });
  if (error !== null) throw new Error(`Access update failed: ${error.code ?? "database_error"}`);
  if (data !== true) throw new Error("No eligible Telegram user matched that id.");
  console.log(`Closed-alpha access updated to ${status}.`);
}

if (import.meta.main) await main();
