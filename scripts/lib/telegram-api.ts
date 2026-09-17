import type { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { ERROR_CODES } from "../../supabase/functions/_shared/errors/taxonomy.ts";
import { redactText } from "../../supabase/functions/_shared/observability/redaction.ts";

/**
 * A minimal Telegram Bot API client for the operational scripts.
 *
 * The Bot API authenticates by putting the token in the request path:
 *
 *     https://api.telegram.org/bot<TOKEN>/setWebhook
 *
 * That makes every request URL a credential, which shapes this module in two
 * ways. The URL is never logged, never embedded in an error message, and never
 * returned to a caller — a thrown error carries the method name and Telegram's
 * description, never the endpoint. And the token is taken as a `Secret`, whose
 * `toString` is already redacted, so an accidental interpolation upstream
 * produces nothing.
 *
 * The application itself never imports this file. Only the scripts under
 * `scripts/` do, because only the scripts call the Bot API. Blueprint 16.3
 * requires that file download URLs, which contain the token, never reach logs,
 * the database, the queue or a provider request; keeping the client out of
 * `_shared/` makes it structurally hard for Phase 1 code to reach for it by
 * accident.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

const DEFAULT_TIMEOUT_MS = 15_000;

/** The envelope every Bot API method returns. */
interface TelegramEnvelope<T> {
  readonly ok: boolean;
  readonly result?: T;
  readonly description?: string;
  readonly error_code?: number;
}

export interface TelegramWebhookInfo {
  readonly url: string;
  readonly has_custom_certificate: boolean;
  readonly pending_update_count: number;
  readonly last_error_date?: number;
  readonly last_error_message?: string;
  readonly max_connections?: number;
  readonly allowed_updates?: readonly string[];
}

export interface TelegramBotIdentity {
  readonly id: number;
  readonly is_bot: boolean;
  readonly first_name: string;
  readonly username?: string;
}

/**
 * Call a Bot API method.
 *
 * Throws `AppError` with the TELEGRAM_ERROR code when Telegram refuses. The
 * description Telegram supplies is safe to show an operator and useless to an
 * attacker, so it is kept; the request URL is not, so it is dropped.
 */
export async function callTelegram<T>(
  botToken: Secret,
  method: string,
  payload: Record<string, unknown> = {},
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Contains the bot token. Never logged, never thrown.
  const endpoint = `${TELEGRAM_API_BASE}/bot${botToken.reveal()}/${method}`;

  let envelope: TelegramEnvelope<T>;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    envelope = (await response.json()) as TelegramEnvelope<T>;
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.name : "unknown error";
    throw new AppError(ERROR_CODES.TELEGRAM_ERROR, {
      internalDetail: `telegram ${method} could not be reached: ${reason}`,
      cause: thrown,
    });
  }

  if (!envelope.ok) {
    throw new AppError(ERROR_CODES.TELEGRAM_ERROR, {
      internalDetail: `telegram ${method} refused: ${
        redactText(envelope.description ?? "(no description)")
      } (code ${envelope.error_code ?? "unknown"})`,
    });
  }

  return envelope.result as T;
}

/** Identify the bot the token belongs to. */
export function getMe(botToken: Secret): Promise<TelegramBotIdentity> {
  return callTelegram<TelegramBotIdentity>(botToken, "getMe");
}

/** Read the currently registered webhook, if any. */
export function getWebhookInfo(botToken: Secret): Promise<TelegramWebhookInfo> {
  return callTelegram<TelegramWebhookInfo>(botToken, "getWebhookInfo");
}

export interface SetWebhookOptions {
  readonly url: string;
  readonly secretToken: Secret;
  /** Restrict deliveries to the update kinds Notinn handles. */
  readonly allowedUpdates?: readonly string[];
  /**
   * Discard updates Telegram queued before this registration.
   *
   * Off by default: an update already queued for a real user is a real note, and
   * dropping it silently loses the user's message. It is exposed because a
   * developer switching between local and deployed webhooks will otherwise have
   * a backlog delivered to the wrong place.
   */
  readonly dropPendingUpdates?: boolean;
}

/** Register the webhook. */
export function setWebhook(botToken: Secret, options: SetWebhookOptions): Promise<boolean> {
  return callTelegram<boolean>(botToken, "setWebhook", {
    url: options.url,
    secret_token: options.secretToken.reveal(),
    ...(options.allowedUpdates === undefined
      ? {}
      : { allowed_updates: [...options.allowedUpdates] }),
    drop_pending_updates: options.dropPendingUpdates ?? false,
  });
}

/** Remove the webhook so Telegram stops delivering updates. */
export function deleteWebhook(
  botToken: Secret,
  options: { dropPendingUpdates?: boolean } = {},
): Promise<boolean> {
  return callTelegram<boolean>(botToken, "deleteWebhook", {
    drop_pending_updates: options.dropPendingUpdates ?? false,
  });
}

/**
 * The update kinds the application consumes.
 *
 * Restricting delivery is a privacy measure as much as a performance one: with
 * this list set, Telegram never sends Notinn the group messages, reactions and
 * inline queries the bot would otherwise have to receive and discard.
 */
export const SUBSCRIBED_UPDATE_KINDS = ["message"] as const;
