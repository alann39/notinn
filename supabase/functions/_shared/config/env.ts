import { z } from "zod";
import { AI_PROVIDERS, type AiProvider } from "./constants.ts";
import { AppError } from "../errors/app-error.ts";
import { digestForLogging } from "../observability/redaction.ts";
import { LOG_LEVELS, type LogLevel } from "../observability/levels.ts";

/**
 * Environment validation, and the only place in the codebase a secret is read.
 *
 * Nothing else calls `Deno.env.get`. Routing every secret through this module
 * buys three things that are hard to get any other way:
 *
 *   1. Fail fast. A missing bot token stops the process at startup with one
 *      clear message, instead of surfacing an hour later as an opaque upstream
 *      401 in the middle of a user's note.
 *
 *   2. Fail safe. `Secret` wraps every credential, and its `toString`,
 *      `toJSON` and Deno inspection hook all return the string "[redacted]".
 *      A secret interpolated into a template literal, serialised into an error
 *      report or printed by an accidental `console.log` produces no credential.
 *      The value is only reachable by calling `reveal()`, which is named so that
 *      it is obvious in code review.
 *
 *   3. Refuse dangerous misconfiguration. The most common and most damaging
 *      Supabase mistake is deploying with the anon key where the service key
 *      belongs. Nothing fails loudly when that happens — row level security
 *      simply denies every write and the application looks broken for no
 *      visible reason. `assertServiceRoleKey` decodes the key and refuses to
 *      start, which converts a silent authorisation failure into a startup
 *      error that names itself.
 */

export const NOTINN_ENVIRONMENTS = ["local", "development", "staging", "production"] as const;

export type NotinnEnvironment = (typeof NOTINN_ENVIRONMENTS)[number];

/**
 * The environment variables the application recognises. Nothing else is read.
 *
 * `AI_PROVIDER`, `GEMINI_API_KEY` and the Gemini model settings joined this list in Phase 1,
 * when generation arrived and the webhook stopped being a function that only
 * acknowledged and enqueued.
 */
export const RECOGNISED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_ANON_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_WEBHOOK_URL",
  "INTERNAL_WORKER_SECRET",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_FALLBACK_MODEL",
  "NOTINN_ENV",
  "NOTINN_LOG_LEVEL",
] as const;

export type EnvKey = (typeof RECOGNISED_ENV_KEYS)[number];

/**
 * A credential that cannot be printed by accident.
 *
 * `reveal()` is deliberately the only accessor and deliberately verbose at call
 * sites. Every use of it should be a line a reviewer stops on.
 */
export class Secret {
  readonly #value: string;

  /** Character count. Safe to log; useful for spotting a truncated paste. */
  readonly length: number;

  constructor(value: string) {
    this.#value = value;
    this.length = value.length;
  }

  /** The credential itself. Every call site is a place to review. */
  reveal(): string {
    return this.#value;
  }

  /** A short non-reversible digest, for correlating logs across processes. */
  async fingerprint(): Promise<string> {
    return await digestForLogging(this.#value);
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  /** Deno's console.log and console.dir honour this symbol. */
  [Symbol.for("Deno.customInspect")](): string {
    return "[redacted]";
  }
}

export interface BaseConfig {
  readonly environment: NotinnEnvironment;
  readonly supabaseUrl: string;
  readonly serviceRoleKey: Secret;
  readonly logLevel: LogLevel;
  /** Fingerprints of the credentials in play. Safe to log at startup. */
  readonly fingerprints: { readonly serviceRoleKey: string; readonly webhookSecret?: string };
}

/**
 * The generation provider's configuration (blueprint 12.3).
 *
 * The model identifier lives here and nowhere else. Blueprint 12.3 requires it to
 * be "read from configuration rather than repeated throughout the codebase", which
 * is why it is a string on this object and not a constant next to the adapter that
 * uses it: changing the model is an operator's edit to an environment variable, not
 * a code change and a redeploy.
 */
export interface AiConfig {
  readonly provider: AiProvider;
  readonly apiKey: Secret;
  readonly model: string;
  /** Optional same-provider fallback for transient upstream failures only. */
  readonly fallbackModel: string | null;
}

export interface WebhookConfig extends BaseConfig {
  readonly webhookSecret: Secret;
  /** Authenticates the webhook's background invocation of the queue worker. */
  readonly internalWorkerSecret: Secret;
  /**
   * The bot token, required from Phase 1 onwards.
   *
   * Phase 0's webhook did not need it, and docs/ADR/0002-phase-0-scope.md said so
   * explicitly. Phase 1 delivers notes, delivery is a Bot API call, and the
   * acknowledgement path now carries the reply — so the token is required and the
   * widening is recorded in docs/ADR/0007-phase-1-scope.md.
   */
  readonly botToken: Secret;
  readonly ai: AiConfig;
}

export interface WorkerConfig extends BaseConfig {
  readonly internalWorkerSecret: Secret;
  readonly botToken: Secret;
  readonly ai: AiConfig;
}

export interface ScriptConfig {
  readonly botToken: Secret;
  /** Absent until the webhook has been registered at least once. */
  readonly webhookSecret: Secret | null;
  /**
   * The deployed URL of the telegram-webhook function.
   *
   * Not a credential — the secret token is what authenticates a delivery — but
   * it is environment-specific, so it is configuration rather than a constant.
   */
  readonly webhookUrl: string | null;
  readonly fingerprints: { readonly webhookSecret?: string };
}

/** Full database access needed only by the synthetic end-to-end smoke test. */
export type SmokeConfig = ScriptConfig & BaseConfig;

// --- Schema -----------------------------------------------------------------

/** Telegram's own constraint on the secret token it will store and echo back. */
const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * A model identifier: a version string, not a secret, not a URL.
 *
 * Constrained because the value is interpolated into the provider's request path.
 * A model id carrying a slash or a `?` would not be a model id, it would be an
 * attempt to choose a different endpoint — and the place to refuse that is the
 * configuration boundary, where the message can say so, rather than deep inside an
 * adapter that will report it as a provider error.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const RawSchema = z.object({
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEYS: z.string().min(1).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_URL: z.url().optional(),
  INTERNAL_WORKER_SECRET: z.string().min(32).max(256).optional(),
  AI_PROVIDER: z.enum(AI_PROVIDERS).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  GEMINI_FALLBACK_MODEL: z.string().min(1).optional(),
  NOTINN_ENV: z.enum(NOTINN_ENVIRONMENTS).optional(),
  NOTINN_LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
});

type RawEnv = z.infer<typeof RawSchema>;

/**
 * Copy the recognised keys out of a source, dropping blanks.
 *
 * An environment variable that is set but empty is a configuration mistake that
 * should read as "absent", not as "present and empty". Treating it as absent
 * produces the clearer error message.
 */
function pickRecognised(source: Record<string, string | undefined>): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of RECOGNISED_ENV_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") {
      picked[key] = value;
    }
  }
  return picked;
}

function parseRaw(source: Record<string, string | undefined>): RawEnv {
  const result = RawSchema.safeParse(pickRecognised(source));

  if (!result.success) {
    // Zod issue paths are field names, never values, so this is safe to surface.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw AppError.configuration(`environment validation failed: ${problems}`);
  }

  return result.data;
}

/**
 * Resolve the server-side key from either naming scheme.
 *
 * Supabase is migrating from a single `SUPABASE_SERVICE_ROLE_KEY` to a
 * `SUPABASE_SECRET_KEYS` collection. Both are accepted, the legacy name first so
 * that an explicit service-role key always wins over a collection default.
 */
function resolveServiceRoleKey(raw: RawEnv): string | undefined {
  if (raw.SUPABASE_SERVICE_ROLE_KEY) return raw.SUPABASE_SERVICE_ROLE_KEY;

  if (raw.SUPABASE_SECRET_KEYS) {
    const collection = raw.SUPABASE_SECRET_KEYS;
    try {
      const parsed: unknown = JSON.parse(collection);
      if (typeof parsed === "string") return parsed;
      if (parsed !== null && typeof parsed === "object") {
        const candidate = (parsed as Record<string, unknown>)["default"];
        if (typeof candidate === "string" && candidate !== "") return candidate;
      }
      return undefined;
    } catch {
      // Not JSON, so the variable holds the key directly.
      return collection;
    }
  }

  return undefined;
}

/**
 * Read the `role` claim out of a Supabase JWT, without verifying it.
 *
 * This is not an authorisation check and must never be used as one — it inspects
 * a key the operator supplied to decide whether to *start*, which is a
 * diagnostic. Returns null for anything that is not a decodable JWT, which
 * includes the newer `sb_secret_…` key format.
 */
export function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;

  const payload = parts[1];
  if (payload === undefined || payload === "") return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded: unknown = JSON.parse(atob(padded));

    if (decoded === null || typeof decoded !== "object") return null;
    const role = (decoded as Record<string, unknown>)["role"];
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * Refuse to start when the configured key is not a service-role credential.
 *
 * Only enforced for legacy JWT keys, where the role is self-describing. A
 * `sb_secret_…` key carries no readable role, so it is trusted as given.
 */
function assertServiceRoleKey(key: string): void {
  const role = jwtRole(key);
  if (role === null) return;

  if (role !== "service_role") {
    throw AppError.configuration(
      `SUPABASE_SERVICE_ROLE_KEY is a "${role}" key, not a service-role key. ` +
        `Row level security would silently deny every write. Use the service-role key.`,
    );
  }
}

function resolveEnvironment(raw: RawEnv): NotinnEnvironment {
  return raw.NOTINN_ENV ?? "local";
}

function resolveLogLevel(raw: RawEnv, environment: NotinnEnvironment): LogLevel {
  if (raw.NOTINN_LOG_LEVEL) return raw.NOTINN_LOG_LEVEL;
  // Local development is loud by default; every deployed environment is quiet.
  return environment === "local" ? "debug" : "info";
}

function requireSupabaseUrl(raw: RawEnv): string {
  if (raw.SUPABASE_URL === undefined) {
    throw AppError.configuration("SUPABASE_URL is not set: database access is unavailable.");
  }
  return raw.SUPABASE_URL;
}

// --- Loaders ----------------------------------------------------------------

/**
 * Resolve the generation provider's configuration.
 *
 * Every field is required, and each failure names the variable to set. The
 * alternative — defaulting the provider to `gemini`, or the model to something
 * current at the time of writing — trades a startup error for a silent change of
 * behaviour. A model that is never named cannot be rolled back, and blueprint
 * 12.3 asks for the model to be configuration precisely so that it can be.
 */
function resolveAiConfig(raw: RawEnv): AiConfig {
  const provider = raw.AI_PROVIDER;
  if (provider === undefined) {
    throw AppError.configuration(
      `AI_PROVIDER is not set: set it to one of ${AI_PROVIDERS.join(", ")}.`,
    );
  }

  const apiKey = raw.GEMINI_API_KEY;
  if (apiKey === undefined) {
    throw AppError.configuration(
      "GEMINI_API_KEY is not set: notes cannot be generated without it.",
    );
  }

  const model = raw.GEMINI_MODEL;
  if (model === undefined) {
    throw AppError.configuration(
      "GEMINI_MODEL is not set: name the model explicitly so it can be changed without a deploy.",
    );
  }
  if (!MODEL_ID_PATTERN.test(model)) {
    throw AppError.configuration(
      "GEMINI_MODEL is not a plain model identifier. Use the model name only, " +
        "such as gemini-2.5-flash — no URL, path or query string.",
    );
  }

  const fallbackModel = raw.GEMINI_FALLBACK_MODEL ?? null;
  if (fallbackModel !== null && !MODEL_ID_PATTERN.test(fallbackModel)) {
    throw AppError.configuration(
      "GEMINI_FALLBACK_MODEL is not a plain model identifier. Use the model name only, " +
        "such as gemini-2.5-flash-lite — no URL, path or query string.",
    );
  }
  if (fallbackModel === model) {
    throw AppError.configuration(
      "GEMINI_FALLBACK_MODEL must differ from GEMINI_MODEL; an identical fallback cannot improve availability.",
    );
  }

  return { provider, apiKey: new Secret(apiKey), model, fallbackModel };
}

/**
 * Configuration for the Telegram webhook Edge Function.
 *
 * The bot token is required. Phase 0 did not require it, deliberately, and
 * docs/ADR/0002-phase-0-scope.md argued that carrying a credential the function
 * never uses widens the blast radius of a compromise for no benefit. That argument
 * was conditional on the webhook making no outbound call, and Phase 1 ends that
 * condition: the webhook now delivers notes and answers callbacks. The blast radius
 * is genuinely wider than in Phase 0, and docs/ADR/0007-phase-1-scope.md records
 * it as an accepted cost rather than a discovered one.
 *
 * The same reasoning is why the generation provider's key is *not* added to
 * `ScriptConfig`. The scripts never generate, so requiring `GEMINI_API_KEY` of them
 * would be the Phase 0 mistake in reverse.
 */
export async function loadWebhookConfig(
  source: Record<string, string | undefined> = Deno.env.toObject(),
): Promise<WebhookConfig> {
  const raw = parseRaw(source);
  const environment = resolveEnvironment(raw);

  const serviceRoleKey = resolveServiceRoleKey(raw);
  if (serviceRoleKey === undefined) {
    throw AppError.configuration(
      "no server-side key found: set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEYS).",
    );
  }
  assertServiceRoleKey(serviceRoleKey);

  const webhookSecret = raw.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret === undefined) {
    // Without a secret the webhook cannot distinguish Telegram from an
    // arbitrary caller, so it refuses to serve rather than accepting everything.
    throw AppError.configuration(
      "TELEGRAM_WEBHOOK_SECRET is not set: the webhook would accept unsigned requests.",
    );
  }
  if (!TELEGRAM_SECRET_PATTERN.test(webhookSecret)) {
    throw AppError.configuration(
      "TELEGRAM_WEBHOOK_SECRET contains characters Telegram will not store. " +
        "Use only A-Z, a-z, 0-9, underscore and hyphen, up to 256 characters.",
    );
  }

  // Ordered after the webhook secret on purpose: a fresh checkout has no secret
  // yet, and that single missing variable should be the thing the operator is told
  // about rather than one item in a list of everything that is not configured.
  const botToken = raw.TELEGRAM_BOT_TOKEN;
  if (botToken === undefined) {
    throw AppError.configuration(
      "TELEGRAM_BOT_TOKEN is not set: the webhook cannot deliver a note without it.",
    );
  }

  const internalWorkerSecret = raw.INTERNAL_WORKER_SECRET;
  if (internalWorkerSecret === undefined) {
    throw AppError.configuration(
      "INTERNAL_WORKER_SECRET is not set: the webhook cannot trigger the queue worker.",
    );
  }

  const ai = resolveAiConfig(raw);

  const serviceSecret = new Secret(serviceRoleKey);
  const webhookSecretValue = new Secret(webhookSecret);

  return {
    environment,
    supabaseUrl: requireSupabaseUrl(raw),
    serviceRoleKey: serviceSecret,
    webhookSecret: webhookSecretValue,
    internalWorkerSecret: new Secret(internalWorkerSecret),
    botToken: new Secret(botToken),
    ai,
    logLevel: resolveLogLevel(raw, environment),
    fingerprints: {
      serviceRoleKey: await serviceSecret.fingerprint(),
      webhookSecret: await webhookSecretValue.fingerprint(),
    },
  };
}

/** Configuration for the authenticated queue consumer Edge Function. */
export async function loadWorkerConfig(
  source: Record<string, string | undefined> = Deno.env.toObject(),
): Promise<WorkerConfig> {
  const raw = parseRaw(source);
  const environment = resolveEnvironment(raw);

  const serviceRoleKey = resolveServiceRoleKey(raw);
  if (serviceRoleKey === undefined) {
    throw AppError.configuration(
      "no server-side key found: set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEYS).",
    );
  }
  assertServiceRoleKey(serviceRoleKey);

  const internalWorkerSecret = raw.INTERNAL_WORKER_SECRET;
  if (internalWorkerSecret === undefined) {
    throw AppError.configuration(
      "INTERNAL_WORKER_SECRET is not set: the queue worker would be unauthenticated.",
    );
  }

  const botToken = raw.TELEGRAM_BOT_TOKEN;
  if (botToken === undefined) {
    throw AppError.configuration(
      "TELEGRAM_BOT_TOKEN is not set: the worker cannot retrieve or deliver files.",
    );
  }

  const serviceSecret = new Secret(serviceRoleKey);
  const workerSecret = new Secret(internalWorkerSecret);

  return {
    environment,
    supabaseUrl: requireSupabaseUrl(raw),
    serviceRoleKey: serviceSecret,
    internalWorkerSecret: workerSecret,
    botToken: new Secret(botToken),
    ai: resolveAiConfig(raw),
    logLevel: resolveLogLevel(raw, environment),
    fingerprints: {
      serviceRoleKey: await serviceSecret.fingerprint(),
    },
  };
}

/**
 * Configuration for the operational scripts.
 *
 * These run on an operator's machine, not inside Supabase, so they need only the
 * bot token to call the Bot API. Deliberately do not load a Supabase service-role
 * key: webhook registration cannot use it, so carrying it only widens the blast
 * radius of the operator command. The webhook secret is optional because the
 * read-only inspection and deletion commands do not need it.
 */
export async function loadScriptConfig(
  source: Record<string, string | undefined> = Deno.env.toObject(),
): Promise<ScriptConfig> {
  const raw = parseRaw(source);

  const botToken = raw.TELEGRAM_BOT_TOKEN;
  if (botToken === undefined) {
    throw AppError.configuration(
      "TELEGRAM_BOT_TOKEN is not set: scripts cannot call the Telegram Bot API.",
    );
  }

  const botTokenSecret = new Secret(botToken);

  const webhookSecretRaw = raw.TELEGRAM_WEBHOOK_SECRET;
  let webhookSecret: Secret | null = null;
  if (webhookSecretRaw !== undefined) {
    if (!TELEGRAM_SECRET_PATTERN.test(webhookSecretRaw)) {
      throw AppError.configuration(
        "TELEGRAM_WEBHOOK_SECRET contains characters Telegram will not store.",
      );
    }
    webhookSecret = new Secret(webhookSecretRaw);
  }

  return {
    botToken: botTokenSecret,
    webhookSecret,
    webhookUrl: raw.TELEGRAM_WEBHOOK_URL ?? null,
    fingerprints: {
      ...(webhookSecret === null ? {} : { webhookSecret: await webhookSecret.fingerprint() }),
    },
  };
}

/** Configuration for the synthetic smoke test, which also inspects database rows. */
export async function loadSmokeConfig(
  source: Record<string, string | undefined> = Deno.env.toObject(),
): Promise<SmokeConfig> {
  const raw = parseRaw(source);
  const environment = resolveEnvironment(raw);
  const serviceRoleKey = resolveServiceRoleKey(raw);

  if (serviceRoleKey === undefined) {
    throw AppError.configuration(
      "no server-side key found: set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEYS).",
    );
  }
  assertServiceRoleKey(serviceRoleKey);

  const script = await loadScriptConfig(source);
  const serviceSecret = new Secret(serviceRoleKey);

  return {
    ...script,
    environment,
    supabaseUrl: requireSupabaseUrl(raw),
    serviceRoleKey: serviceSecret,
    logLevel: resolveLogLevel(raw, environment),
    fingerprints: {
      serviceRoleKey: await serviceSecret.fingerprint(),
      ...script.fingerprints,
    },
  };
}

/**
 * A report of what is configured, safe to print or log.
 *
 * Contains presence and fingerprints only. This is what `verify-env` shows an
 * operator, and what makes "is the deployed function using the same secret I
 * think it is?" answerable without revealing either value.
 */
export interface EnvironmentReport {
  readonly environment: NotinnEnvironment;
  readonly logLevel: LogLevel;
  readonly supabaseUrl: string;
  readonly present: Readonly<Record<EnvKey, boolean>>;
  readonly serviceRoleKeyRole: string | null;
  readonly serviceRoleKeyLength: number | null;
  readonly botTokenLength: number | null;
  readonly webhookSecretLength: number | null;
  readonly webhookSecretFormatValid: boolean | null;
  /** As configured, or null when unset. Both are public values, not secrets. */
  readonly aiProvider: string | null;
  readonly geminiModel: string | null;
  readonly geminiFallbackModel: string | null;
  readonly geminiApiKeyLength: number | null;
  readonly internalWorkerSecretLength: number | null;
}

export function describeEnvironment(
  source: Record<string, string | undefined> = Deno.env.toObject(),
): EnvironmentReport {
  const picked = pickRecognised(source);

  const present = Object.fromEntries(
    RECOGNISED_ENV_KEYS.map((key) => [key, picked[key] !== undefined]),
  ) as Record<EnvKey, boolean>;

  const serviceRoleKey = picked["SUPABASE_SERVICE_ROLE_KEY"] ?? null;
  const botToken = picked["TELEGRAM_BOT_TOKEN"] ?? null;
  const webhookSecret = picked["TELEGRAM_WEBHOOK_SECRET"] ?? null;
  const geminiApiKey = picked["GEMINI_API_KEY"] ?? null;
  const internalWorkerSecret = picked["INTERNAL_WORKER_SECRET"] ?? null;

  return {
    environment: (picked["NOTINN_ENV"] as NotinnEnvironment | undefined) ?? "local",
    logLevel: (picked["NOTINN_LOG_LEVEL"] as LogLevel | undefined) ?? "info",
    // A Supabase URL is not a secret; it is public in every client bundle.
    supabaseUrl: picked["SUPABASE_URL"] ?? "(unset)",
    present,
    serviceRoleKeyRole: serviceRoleKey === null ? null : jwtRole(serviceRoleKey),
    serviceRoleKeyLength: serviceRoleKey?.length ?? null,
    botTokenLength: botToken?.length ?? null,
    webhookSecretLength: webhookSecret?.length ?? null,
    webhookSecretFormatValid: webhookSecret === null
      ? null
      : TELEGRAM_SECRET_PATTERN.test(webhookSecret),
    // Neither the provider name nor the model id is a credential — both are in
    // the blueprint. The key is reported by length only.
    aiProvider: picked["AI_PROVIDER"] ?? null,
    geminiModel: picked["GEMINI_MODEL"] ?? null,
    geminiFallbackModel: picked["GEMINI_FALLBACK_MODEL"] ?? null,
    geminiApiKeyLength: geminiApiKey?.length ?? null,
    internalWorkerSecretLength: internalWorkerSecret?.length ?? null,
  };
}
