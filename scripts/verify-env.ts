import {
  describeEnvironment,
  loadScriptConfig,
  loadWebhookConfig,
} from "../supabase/functions/_shared/config/env.ts";
import { AI_PROVIDERS } from "../supabase/functions/_shared/config/constants.ts";
import { toAppError } from "../supabase/functions/_shared/errors/app-error.ts";

/**
 * Verify that the environment is configured well enough to run Notinn.
 *
 * Run with `deno task verify-env`.
 *
 * This prints no secret. Everything it shows is either a public value, a
 * yes/no, a character count, or a short non-reversible fingerprint. That
 * constraint is what makes the script safe to run in a shared terminal, paste
 * into an incident channel, or attach to a bug report.
 *
 * It distinguishes two kinds of problem:
 *
 *   * FAILURES stop the exit code. These are things that will definitely break
 *     a request.
 *
 *   * WARNINGS do not. They are things that are fine right now and will bite
 *     later — most often, a webhook secret that has not been generated yet
 *     because the webhook has never been registered.
 */

type CheckStatus = "ok" | "warn" | "fail";

const failures: string[] = [];
const warnings: string[] = [];

function line(label: string, value: string, status: CheckStatus = "ok"): void {
  const marker = status === "ok" ? "  ok  " : status === "warn" ? " warn " : " FAIL ";
  console.log(`${marker} ${label.padEnd(30)} ${value}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

/** Telegram bot tokens are `<numeric id>:<35 url-safe characters>`. */
const BOT_TOKEN_PATTERN = /^\d{6,12}:[A-Za-z0-9_-]{35}$/;

async function main(): Promise<void> {
  console.log("Notinn environment verification");

  // --- What is configured, without revealing any of it ---------------------
  const report = describeEnvironment();

  section("Context");
  line("environment", report.environment);
  line("log level", report.logLevel);
  line("supabase url", report.supabaseUrl);

  section("Variables present");
  for (const [key, present] of Object.entries(report.present)) {
    line(key, present ? "set" : "not set", present ? "ok" : "warn");
    if (!present) {
      warnings.push(`${key} is not set`);
    }
  }

  // --- Credential sanity ---------------------------------------------------
  section("Credential shape");

  if (report.serviceRoleKeyRole === null) {
    line("service key role", "not a decodable JWT (accepted)", "ok");
  } else if (report.serviceRoleKeyRole === "service_role") {
    line("service key role", "service_role", "ok");
  } else {
    line("service key role", `${report.serviceRoleKeyRole} — WRONG KEY`, "fail");
    failures.push(
      `SUPABASE_SERVICE_ROLE_KEY carries the "${report.serviceRoleKeyRole}" role. ` +
        `Row level security would deny every write.`,
    );
  }

  if (report.serviceRoleKeyLength !== null) {
    line("service key length", String(report.serviceRoleKeyLength));
  }

  if (report.botTokenLength === null) {
    line("bot token", "not set", "fail");
    failures.push("TELEGRAM_BOT_TOKEN is not set; the scripts cannot call the Bot API.");
  } else if (report.botTokenLength === 0) {
    line("bot token", "empty", "fail");
  } else {
    line("bot token length", String(report.botTokenLength));
  }

  if (report.webhookSecretLength === null) {
    line("webhook secret", "not set", "warn");
    warnings.push(
      "TELEGRAM_WEBHOOK_SECRET is not set. Generate one and register it with " +
        "`deno task webhook:set`; the webhook refuses to serve without it.",
    );
  } else if (report.webhookSecretFormatValid === true) {
    line("webhook secret", `set, ${report.webhookSecretLength} chars, format valid`, "ok");
  } else {
    line("webhook secret", "set, but Telegram will reject the format", "fail");
    failures.push(
      "TELEGRAM_WEBHOOK_SECRET must match [A-Za-z0-9_-]{1,256}; Telegram rejects anything else.",
    );
  }

  // --- Generation provider -------------------------------------------------
  section("Generation provider");

  if (report.aiProvider === null) {
    line("provider", "not set", "fail");
    failures.push("AI_PROVIDER is not set; the webhook refuses to start without it.");
  } else if (!(AI_PROVIDERS as readonly string[]).includes(report.aiProvider)) {
    line("provider", `${report.aiProvider} — NOT SUPPORTED`, "fail");
    failures.push(
      `AI_PROVIDER is "${report.aiProvider}"; the only supported value is ` +
        `${AI_PROVIDERS.join(", ")}.`,
    );
  } else {
    line("provider", report.aiProvider, "ok");
  }

  if (report.geminiModel === null) {
    line("model", "not set", "fail");
    failures.push("GEMINI_MODEL is not set; name the model explicitly.");
  } else {
    line("model", report.geminiModel, "ok");
  }

  if (report.geminiFallbackModel === null) {
    line("fallback model", "not set — transient fallback disabled", "warn");
    warnings.push(
      "GEMINI_FALLBACK_MODEL is not set; 429, timeout, and Gemini 5xx failures cannot fail over.",
    );
  } else {
    line("fallback model", report.geminiFallbackModel, "ok");
  }

  if (report.geminiApiKeyLength === null) {
    line("provider key", "not set", "fail");
    failures.push("GEMINI_API_KEY is not set; notes cannot be generated without it.");
  } else {
    // Length only. The key's own shape is Google's business, and a provider key
    // that is present but wrong produces a clear 401 from the provider.
    line("provider key length", String(report.geminiApiKeyLength));
  }

  // --- Configuration loads -------------------------------------------------
  section("Configuration loads");

  let scriptConfigLoaded = false;

  try {
    const scriptConfig = await loadScriptConfig();
    scriptConfigLoaded = true;
    line("script config", "OK", "ok");

    if (scriptConfig.webhookUrl === null) {
      line("webhook url", "not set", "warn");
      warnings.push(
        "TELEGRAM_WEBHOOK_URL is not set. `webhook:set`, `webhook:info` and `smoke` need it.",
      );
    } else {
      line("webhook url", scriptConfig.webhookUrl, "ok");
    }

    // A bot token that is present but malformed is a paste error, and Telegram
    // reports it as a bare 401 that names nothing.
    const token = scriptConfig.botToken.reveal();
    if (!BOT_TOKEN_PATTERN.test(token)) {
      line("bot token format", "does not look like a Telegram token", "warn");
      warnings.push(
        "TELEGRAM_BOT_TOKEN does not match the usual <id>:<35 chars> shape. " +
          "If Bot API calls return 401, check for a truncated paste.",
      );
    } else {
      line("bot token format", "matches the expected shape", "ok");
    }
  } catch (thrown) {
    const error = toAppError(thrown);
    line("script config", error.publicMessage, "fail");
    failures.push(`script config: ${error.internalDetail ?? error.code}`);
  }

  try {
    const webhookConfig = await loadWebhookConfig();
    line("webhook config", "OK", "ok");
    line("webhook key fingerprint", webhookConfig.fingerprints.serviceRoleKey);
    if (webhookConfig.fingerprints.webhookSecret !== undefined) {
      line("secret fingerprint", webhookConfig.fingerprints.webhookSecret);
    }
  } catch (thrown) {
    const error = toAppError(thrown);

    // The webhook cannot load without a secret, which is expected before the
    // webhook has ever been registered. Only a failure that is not about the
    // missing secret is a real problem.
    if (error.internalDetail?.includes("TELEGRAM_WEBHOOK_SECRET") === true) {
      line("webhook config", "blocked on the missing webhook secret", "warn");
    } else {
      line("webhook config", error.publicMessage, "fail");
      failures.push(`webhook config: ${error.internalDetail ?? error.code}`);
    }
  }

  // --- Verdict -------------------------------------------------------------
  console.log("");

  for (const warning of warnings) {
    console.log(`warning: ${warning}`);
  }
  for (const failure of failures) {
    console.log(`FAILURE: ${failure}`);
  }

  const passed = failures.length === 0 && scriptConfigLoaded;

  console.log("");
  console.log(
    passed
      ? `Result: PASS (${warnings.length} warning${warnings.length === 1 ? "" : "s"})`
      : `Result: FAIL (${failures.length} failure${failures.length === 1 ? "" : "s"})`,
  );

  Deno.exit(passed ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
