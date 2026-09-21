import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  describeEnvironment,
  jwtRole,
  loadOperatorConfig,
  loadScriptConfig,
  loadSmokeConfig,
  loadWebhookConfig,
  loadWorkerConfig,
  RECOGNISED_ENV_KEYS,
  Secret,
} from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { ERROR_CODES } from "../../supabase/functions/_shared/errors/taxonomy.ts";

/**
 * Environment validation and the `Secret` wrapper.
 *
 * This module is the only place in the codebase that reads a credential, which
 * makes it the only place where a credential can be leaked by a mistake. Two
 * properties are asserted here: a secret cannot be printed by accident, and a
 * dangerous misconfiguration stops the process instead of failing quietly later.
 *
 * Every value below is synthetic and none is a working credential.
 */

const SUPABASE_URL = "https://synthetic.supabase.co";
const WEBHOOK_SECRET = "synthetic_webhook_secret_value";
const BOT_TOKEN = "123456789:AAFakeTokenValueThatIsLongEnoughToMatch";
const GEMINI_API_KEY = "synthetic-gemini-api-key-value";
const GEMINI_MODEL = "gemini-synthetic-flash";
const GEMINI_FALLBACK_MODEL = "gemini-synthetic-flash-lite";
const OPENROUTER_API_KEY = "synthetic-openrouter-api-key-value";
const INTERNAL_WORKER_SECRET = "synthetic-internal-worker-secret-value";

/** Build a JWT-shaped string with the given payload. Unsigned and unusable. */
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.${"s".repeat(32)}`;
}

const SERVICE_ROLE_JWT = fakeJwt({ role: "service_role", iss: "supabase" });
const ANON_JWT = fakeJwt({ role: "anon", iss: "supabase" });

/** A source that satisfies every requirement the webhook loader has. */
function validSource(): Record<string, string> {
  return {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_JWT,
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL,
    INTERNAL_WORKER_SECRET,
  };
}

/**
 * The valid source with named variables deleted, as an operator would leave them.
 *
 * Deleting rather than assigning `undefined` is not cosmetic: the loader reads a
 * `Record<string, string | undefined>`, and an explicitly-undefined key is the
 * shape the tests should exercise — it is what `Deno.env.toObject()` produces for
 * a variable that is not set.
 */
function sourceWithout(...keys: readonly string[]): Record<string, string> {
  const source = validSource();
  for (const key of keys) delete source[key];
  return source;
}

// --- Secret ----------------------------------------------------------------

Deno.test("a secret does not print itself", () => {
  const secret = new Secret(SERVICE_ROLE_JWT);

  assertEquals(secret.toString(), "[redacted]");
  assertEquals(String(secret), "[redacted]");
  assertEquals(`${secret}`, "[redacted]");
  assertEquals("value: " + secret, "value: [redacted]");
  assertEquals(secret.toJSON(), "[redacted]");
});

Deno.test("a secret does not serialise itself", () => {
  // The realistic accident: a config object logged or written to a report whole.
  const config = { url: SUPABASE_URL, key: new Secret(SERVICE_ROLE_JWT) };
  const serialised = JSON.stringify(config);

  assertEquals(serialised, `{"url":"${SUPABASE_URL}","key":"[redacted]"}`);
  assert(!serialised.includes(SERVICE_ROLE_JWT));
});

Deno.test("a secret does not inspect itself", () => {
  // Deno's console.log and console.dir honour this hook, so an accidental
  // console.log(config) prints no credential.
  const secret = new Secret(SERVICE_ROLE_JWT);
  const inspectors = secret as unknown as Record<symbol, (this: Secret) => string>;
  const inspect = inspectors[Symbol.for("Deno.customInspect")];

  assert(typeof inspect === "function", "the secret exposes no inspection hook");
  assertEquals(inspect.call(secret), "[redacted]");
});

Deno.test("the value is reachable only by asking for it", () => {
  const secret = new Secret(SERVICE_ROLE_JWT);

  assertEquals(secret.reveal(), SERVICE_ROLE_JWT);
  assertEquals(secret.length, SERVICE_ROLE_JWT.length);
});

Deno.test("a fingerprint identifies a secret without revealing it", async () => {
  // This is what makes "is the deployed function using the same secret I think
  // it is?" answerable by comparing two log lines.
  const secret = new Secret(SERVICE_ROLE_JWT);
  const fingerprint = await secret.fingerprint();

  assertEquals(fingerprint.length, 12);
  assertEquals(fingerprint, await new Secret(SERVICE_ROLE_JWT).fingerprint());
  assert(!SERVICE_ROLE_JWT.includes(fingerprint));
  assert(!fingerprint.includes("service_role"));
});

// --- jwtRole ---------------------------------------------------------------

Deno.test("a JWT's role is readable without verifying the signature", () => {
  // A diagnostic, not an authorisation check. It inspects a key the operator
  // supplied in order to decide whether to start.
  assertEquals(jwtRole(SERVICE_ROLE_JWT), "service_role");
  assertEquals(jwtRole(ANON_JWT), "anon");
});

Deno.test("anything that is not a three-part JWT has no readable role", () => {
  // Includes the newer `sb_secret_…` format, which carries no readable role and
  // is therefore trusted as given.
  assertEquals(jwtRole("sb_secret_abcdefghijklmnop"), null);
  assertEquals(jwtRole("not-a-jwt"), null);
  assertEquals(jwtRole(""), null);
  assertEquals(jwtRole("a.b"), null);
  assertEquals(jwtRole("a..c"), null);
  assertEquals(jwtRole("a.!!!not-base64!!!.c"), null);
});

Deno.test("a JWT whose payload is not an object has no readable role", () => {
  const encode = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  assertEquals(jwtRole(`h.${encode("just a string")}.s`), null);
  assertEquals(jwtRole(`h.${encode(null)}.s`), null);
  assertEquals(jwtRole(`h.${encode(["role", "service_role"])}.s`), null);
  assertEquals(jwtRole(`h.${encode({})}.s`), null);
});

// --- loadWebhookConfig -----------------------------------------------------

Deno.test("a valid environment produces a usable config", async () => {
  const config = await loadWebhookConfig(validSource());

  assertEquals(config.supabaseUrl, SUPABASE_URL);
  assertEquals(config.serviceRoleKey.reveal(), SERVICE_ROLE_JWT);
  assertEquals(config.webhookSecret.reveal(), WEBHOOK_SECRET);
  assertEquals(config.environment, "local");
});

Deno.test("the webhook carries the bot token, because Phase 1 delivers notes", async () => {
  // Phase 0 asserted the opposite: the webhook acknowledged and enqueued, never
  // called the Bot API, and carrying a credential it did not use would have
  // widened the blast radius of a compromise for no benefit. Phase 1 ends that
  // condition — delivery is a Bot API call — so the token is required and carried.
  // The widening is recorded in docs/ADR/0007-phase-1-scope.md.
  const config = await loadWebhookConfig(validSource());
  assertEquals(config.botToken.reveal(), BOT_TOKEN);

  // Carried is not the same as printable. The property Phase 0 was really
  // protecting — that the credential cannot leak through the config object — still
  // holds, and is asserted here rather than assumed.
  assert(!JSON.stringify(config).includes("AAFake"));
  assert(!`${config.botToken}`.includes("AAFake"));
});

Deno.test("a missing bot token is refused, because delivery would fail later instead", async () => {
  const source = validSource();
  delete source["TELEGRAM_BOT_TOKEN"];

  const error = await assertRejects(() => loadWebhookConfig(source), AppError);
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
  assert((error.internalDetail ?? "").includes("TELEGRAM_BOT_TOKEN"));
});

Deno.test("the generation provider is required, and its key is not printable", async () => {
  // A model that is never named cannot be rolled back, and blueprint 12.3 asks for
  // the model to be configuration precisely so that it can be.
  const config = await loadWebhookConfig(validSource());
  assertEquals(config.ai.provider, "gemini");
  assertEquals(config.ai.model, GEMINI_MODEL);
  assertEquals(config.ai.fallbackModel, GEMINI_FALLBACK_MODEL);
  assertEquals(config.ai.apiKey.reveal(), GEMINI_API_KEY);

  assert(!JSON.stringify(config).includes(GEMINI_API_KEY));

  for (const key of ["AI_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL"]) {
    const source = validSource();
    delete source[key];

    const error = await assertRejects(() => loadWebhookConfig(source), AppError);
    assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR, `${key} was not required`);
    assert((error.internalDetail ?? "").includes(key), `${key} is not named in the error`);
  }
});

Deno.test("an unsupported provider is refused rather than silently defaulted", async () => {
  const error = await assertRejects(
    () => loadWebhookConfig({ ...validSource(), AI_PROVIDER: "openai" }),
    AppError,
  );
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
});

Deno.test("a model identifier that is not an identifier is refused", async () => {
  // The value is interpolated into the provider's request path, so the place to
  // refuse a path is here, where the message can say why.
  for (const model of ["../other-model", "gemini/x?key=y", "  ", "gemini flash"]) {
    const error = await assertRejects(
      () => loadWebhookConfig({ ...validSource(), GEMINI_MODEL: model }),
      AppError,
    );
    assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR, `${model} was accepted`);
  }
});

Deno.test("the Gemini fallback is optional but must be distinct and well formed", async () => {
  const withoutFallback = validSource();
  delete withoutFallback["GEMINI_FALLBACK_MODEL"];
  assertEquals((await loadWebhookConfig(withoutFallback)).ai.fallbackModel, null);

  for (const fallbackModel of [GEMINI_MODEL, "../other-model", "gemini flash"]) {
    const error = await assertRejects(
      () => loadWebhookConfig({ ...validSource(), GEMINI_FALLBACK_MODEL: fallbackModel }),
      AppError,
    );
    assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR, `${fallbackModel} was accepted`);
  }
});

Deno.test("the OpenRouter fallback is optional and defaults to openrouter/free", async () => {
  const disabled = await loadWebhookConfig(validSource());
  assertEquals(disabled.ai.openRouter, null);

  const enabled = await loadWebhookConfig({
    ...validSource(),
    OPENROUTER_API_KEY,
  });
  assertEquals(enabled.ai.openRouter?.model, "openrouter/free");
  assertEquals(enabled.ai.openRouter?.apiKey.reveal(), OPENROUTER_API_KEY);
  assert(!JSON.stringify(enabled).includes(OPENROUTER_API_KEY));
});

Deno.test("an invalid or keyless OpenRouter fallback is refused", async () => {
  for (
    const source of [
      { ...validSource(), OPENROUTER_API_KEY, OPENROUTER_FALLBACK_MODEL: "no-slash" },
      { ...validSource(), OPENROUTER_FALLBACK_MODEL: "openrouter/free" },
    ]
  ) {
    const error = await assertRejects(() => loadWebhookConfig(source), AppError);
    assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
    assert((error.internalDetail ?? "").includes("OPENROUTER"));
  }
});

// --- loadWorkerConfig ------------------------------------------------------

Deno.test("the worker has one private trigger secret and the shared Gemini config", async () => {
  const config = await loadWorkerConfig(validSource());

  assertEquals(config.internalWorkerSecret.reveal(), INTERNAL_WORKER_SECRET);
  assertEquals(config.botToken.reveal(), BOT_TOKEN);
  assertEquals(config.ai.provider, "gemini");
  assertEquals(config.ai.model, GEMINI_MODEL);
  assertEquals(config.ai.fallbackModel, GEMINI_FALLBACK_MODEL);
  assert(!JSON.stringify(config).includes(INTERNAL_WORKER_SECRET));
});

Deno.test("the worker refuses to start without a sufficiently strong trigger secret", async () => {
  for (const secret of [undefined, "too-short"]) {
    const source = validSource();
    if (secret === undefined) delete source["INTERNAL_WORKER_SECRET"];
    else source["INTERNAL_WORKER_SECRET"] = secret;

    const error = await assertRejects(() => loadWorkerConfig(source), AppError);
    assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
    assert((error.internalDetail ?? "").includes("INTERNAL_WORKER_SECRET"));
    assert(!(error.internalDetail ?? "").includes("too-short"));
  }
});

Deno.test("a config that is missing its URL is refused", async () => {
  const source = validSource();
  delete source["SUPABASE_URL"];

  const error = await assertRejects(() => loadWebhookConfig(source), AppError);
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
});

Deno.test("a URL that is not a URL is refused", async () => {
  const error = await assertRejects(
    () => loadWebhookConfig({ ...validSource(), SUPABASE_URL: "not-a-url" }),
    AppError,
  );
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
});

Deno.test("a config with no server-side key is refused", async () => {
  const source = validSource();
  delete source["SUPABASE_SERVICE_ROLE_KEY"];

  const error = await assertRejects(() => loadWebhookConfig(source), AppError);
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
  assert((error.internalDetail ?? "").includes("no server-side key"));
});

Deno.test("an anon key is refused, because RLS would silently deny every write", async () => {
  // The commonest and most damaging Supabase mistake. Nothing fails loudly when
  // it happens — row level security simply denies every write and the
  // application looks broken for no visible reason.
  const error = await assertRejects(
    () => loadWebhookConfig({ ...validSource(), SUPABASE_SERVICE_ROLE_KEY: ANON_JWT }),
    AppError,
  );

  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
  assert((error.internalDetail ?? "").includes("anon"));
  // And the refusal must not have echoed the key itself.
  assert(!(error.internalDetail ?? "").includes(ANON_JWT));
});

Deno.test("a missing webhook secret is refused rather than accepted", async () => {
  // Without a secret the webhook cannot distinguish Telegram from an arbitrary
  // caller, so it refuses to serve rather than accepting everything.
  const source = validSource();
  delete source["TELEGRAM_WEBHOOK_SECRET"];

  const error = await assertRejects(() => loadWebhookConfig(source), AppError);
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
  assert((error.internalDetail ?? "").includes("TELEGRAM_WEBHOOK_SECRET"));
});

Deno.test("a webhook secret Telegram would not store is refused", async () => {
  // Telegram enforces A-Z, a-z, 0-9, underscore and hyphen. Registering with
  // anything else fails at Telegram's end, after the operator has moved on.
  const error = await assertRejects(
    () =>
      loadWebhookConfig({ ...validSource(), TELEGRAM_WEBHOOK_SECRET: "has spaces and $ymbols" }),
    AppError,
  );

  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
});

Deno.test("an empty environment variable reads as absent, not as empty", async () => {
  // Setting a variable to an empty string is a configuration mistake, and
  // "absent" produces the clearer error message.
  const error = await assertRejects(
    () => loadWebhookConfig({ ...validSource(), TELEGRAM_WEBHOOK_SECRET: "   " }),
    AppError,
  );
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
});

Deno.test("the log level follows the environment, and can be overridden", async () => {
  assertEquals((await loadWebhookConfig(validSource())).logLevel, "debug");
  assertEquals(
    (await loadWebhookConfig({ ...validSource(), NOTINN_ENV: "production" })).logLevel,
    "info",
  );
  assertEquals(
    (await loadWebhookConfig({
      ...validSource(),
      NOTINN_ENV: "production",
      NOTINN_LOG_LEVEL: "warn",
    }))
      .logLevel,
    "warn",
  );
});

Deno.test("an unrecognised environment name is refused", async () => {
  const error = await assertRejects(
    () => loadWebhookConfig({ ...validSource(), NOTINN_ENV: "prod" }),
    AppError,
  );
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
});

Deno.test("a configuration error never carries the credential in its message", async () => {
  const error = await assertRejects(
    () => loadWebhookConfig({ ...validSource(), SUPABASE_SERVICE_ROLE_KEY: ANON_JWT }),
    AppError,
  );

  assert(!error.message.includes(ANON_JWT));
  assert(!JSON.stringify(error).includes(ANON_JWT));
});

// --- The alternate key naming scheme ---------------------------------------

Deno.test("the service-role key is found under either naming scheme", async () => {
  // Supabase is migrating from a single SUPABASE_SERVICE_ROLE_KEY to a
  // SUPABASE_SECRET_KEYS collection. Both are accepted.
  const fromCollection = await loadWebhookConfig({
    ...sourceWithout("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SERVICE_ROLE_JWT }),
  });
  assertEquals(fromCollection.serviceRoleKey.reveal(), SERVICE_ROLE_JWT);

  const fromJsonString = await loadWebhookConfig({
    ...sourceWithout("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_SECRET_KEYS: JSON.stringify(SERVICE_ROLE_JWT),
  });
  assertEquals(fromJsonString.serviceRoleKey.reveal(), SERVICE_ROLE_JWT);

  const fromRawValue = await loadWebhookConfig({
    ...sourceWithout("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_SECRET_KEYS: SERVICE_ROLE_JWT,
  });
  assertEquals(fromRawValue.serviceRoleKey.reveal(), SERVICE_ROLE_JWT);
});

Deno.test("the explicit service-role key wins over the collection", async () => {
  const config = await loadWebhookConfig({
    ...validSource(),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: ANON_JWT }),
  });

  assertEquals(config.serviceRoleKey.reveal(), SERVICE_ROLE_JWT);
});

Deno.test("a collection with no usable default is refused", async () => {
  const error = await assertRejects(
    () =>
      loadWebhookConfig({
        ...sourceWithout("SUPABASE_SERVICE_ROLE_KEY"),
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 42 }),
      }),
    AppError,
  );
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
});

// --- loadScriptConfig ------------------------------------------------------

Deno.test("the scripts require a bot token", async () => {
  const source = validSource();
  delete source["TELEGRAM_BOT_TOKEN"];

  const error = await assertRejects(
    () => loadScriptConfig(source),
    AppError,
  );
  assertEquals(error.code, ERROR_CODES.CONFIGURATION_ERROR);
  assert((error.internalDetail ?? "").includes("TELEGRAM_BOT_TOKEN"));
});

Deno.test("the scripts do not require the generation provider's key", async () => {
  // The scripts never generate, so requiring GEMINI_API_KEY of them would be the
  // Phase 0 blast-radius mistake in reverse. A script that carries a credential it
  // cannot use is a credential that can leak from an operator's machine.
  const source = validSource();
  delete source["GEMINI_API_KEY"];
  delete source["AI_PROVIDER"];
  delete source["GEMINI_MODEL"];
  delete source["GEMINI_FALLBACK_MODEL"];
  delete source["SUPABASE_URL"];
  delete source["SUPABASE_SERVICE_ROLE_KEY"];

  const config = await loadScriptConfig(source);
  assertEquals(config.botToken.reveal(), BOT_TOKEN);
  assertEquals(Object.keys(config).includes("ai"), false);
  assertEquals(Object.keys(config).includes("serviceRoleKey"), false);
});

Deno.test("database operator configs carry only validated server credentials", async () => {
  const config = await loadSmokeConfig(validSource());
  const operator = await loadOperatorConfig(validSource());

  assertEquals(config.supabaseUrl, SUPABASE_URL);
  assertEquals(config.serviceRoleKey.reveal(), SERVICE_ROLE_JWT);
  assertEquals(operator.supabaseUrl, SUPABASE_URL);
  assertEquals(operator.serviceRoleKey.reveal(), SERVICE_ROLE_JWT);
  assertEquals(Object.keys(operator).includes("botToken"), false);
  assertEquals(Object.keys(operator).includes("ai"), false);
});

Deno.test("the scripts tolerate a missing webhook secret, which only exists after registration", async () => {
  // The operator's first run is `webhook:set`, which is what creates the
  // secret. Requiring it beforehand would make the tool that sets it unusable
  // until it had already been run.
  const source: Record<string, string> = {
    ...validSource(),
    TELEGRAM_BOT_TOKEN: "123456789:AAFakeTokenValueThatIsLongEnoughToMatch",
  };
  delete source["TELEGRAM_WEBHOOK_SECRET"];

  const config = await loadScriptConfig(source);

  assertEquals(config.webhookSecret, null);
  assertEquals(config.webhookUrl, null);
  assertEquals(config.fingerprints.webhookSecret, undefined);
});

Deno.test("the scripts read the bot token and the webhook URL", async () => {
  const config = await loadScriptConfig({
    ...validSource(),
    TELEGRAM_BOT_TOKEN: "123456789:AAFakeTokenValueThatIsLongEnoughToMatch",
    TELEGRAM_WEBHOOK_URL: "https://synthetic.supabase.co/functions/v1/telegram-webhook",
  });

  assertEquals(config.botToken.reveal(), "123456789:AAFakeTokenValueThatIsLongEnoughToMatch");
  assertEquals(config.webhookUrl, "https://synthetic.supabase.co/functions/v1/telegram-webhook");
  assertEquals(config.webhookSecret?.reveal(), WEBHOOK_SECRET);
  assertEquals(typeof config.fingerprints.webhookSecret, "string");
});

// --- describeEnvironment ---------------------------------------------------

Deno.test("the environment report reveals no secret", () => {
  // This is what `verify-env` shows an operator. It must be safe to paste into
  // a ticket, which is exactly what people do with it.
  const report = describeEnvironment({
    ...validSource(),
    TELEGRAM_BOT_TOKEN: "123456789:AAFakeTokenValueThatIsLongEnoughToMatch",
  });

  const serialised = JSON.stringify(report);
  assert(!serialised.includes(SERVICE_ROLE_JWT));
  assert(!serialised.includes(WEBHOOK_SECRET));
  assert(!serialised.includes("AAFakeTokenValueThatIsLongEnoughToMatch"));

  // Presence, lengths and the role are what make it useful.
  assertEquals(report.present.SUPABASE_SERVICE_ROLE_KEY, true);
  assertEquals(report.present.TELEGRAM_WEBHOOK_SECRET, true);
  assertEquals(report.serviceRoleKeyRole, "service_role");
  assertEquals(report.serviceRoleKeyLength, SERVICE_ROLE_JWT.length);
  assertEquals(report.webhookSecretFormatValid, true);
});

Deno.test("an empty environment reports everything absent rather than throwing", () => {
  // A diagnostic that throws on the broken environment it exists to diagnose is
  // useless.
  const report = describeEnvironment({});

  assertEquals(report.supabaseUrl, "(unset)");
  assertEquals(report.serviceRoleKeyRole, null);
  assertEquals(report.serviceRoleKeyLength, null);
  assertEquals(report.webhookSecretFormatValid, null);
  assertEquals(Object.values(report.present).some(Boolean), false);
});

Deno.test("the report covers every recognised key", () => {
  // A key that appears in neither the report nor the schema is one an operator
  // can set with no effect and no warning.
  const report = describeEnvironment({});
  assertEquals(Object.keys(report.present).sort(), [...RECOGNISED_ENV_KEYS].sort());
});
