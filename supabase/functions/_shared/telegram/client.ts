import { z } from "zod";
import type { Secret } from "../config/env.ts";
import { AppError } from "../errors/app-error.ts";
import { ERROR_CODES } from "../errors/taxonomy.ts";
import { redactText } from "../observability/redaction.ts";

/**
 * The Telegram Bot API client, for the scripts and for the webhook.
 *
 * WHY THIS LIVES IN `_shared/` NOW. In Phase 0 it lived in `scripts/lib/` and the
 * application deliberately did not import it, because only the scripts called the
 * Bot API and keeping the client out of the webhook's reach made it structurally
 * hard for ingestion code to reach for it by accident. Phase 1 breaks that premise:
 * delivering a note means sending a message, and answering a button tap means
 * answering a callback query.
 *
 * That protection is gone, and no equivalent replaces it — the module has to be
 * importable now, so what it protected against is no longer avoidable. What
 * survives is the credential handling below, which was doing the load-bearing part
 * all along: the Bot API authenticates by putting the token in the request path,
 * so every request URL is a credential. The URL is never logged, never returned and
 * never thrown; a thrown error carries the method name and Telegram's description
 * only; and the token is taken as a `Secret`, whose `toString` is already redacted,
 * so an accidental interpolation upstream produces nothing. Blueprint 16.3's
 * requirement that token-bearing file download URLs never reach logs, the database,
 * the queue or a provider request is still satisfied, and still by construction
 * rather than by care.
 *
 * What is genuinely new, and not merely relocated, is that `telegram-webhook` now
 * needs `TELEGRAM_BOT_TOKEN` at all. A function that parses untrusted input holds a
 * credential it did not hold before, which widens the blast radius of a bug in it.
 * That widening is recorded in docs/ADR/0007-phase-1-scope.md rather than absorbed
 * silently — it is the cost of Phase 1 delivering anything.
 *
 * ERRORS ARE CLASSIFIED BY THE CALLER, NOT HERE. Every method throws
 * `TELEGRAM_ERROR`, which means "a Bot API call failed". Whether that is a lost
 * note or a spinner that never stopped depends on what the call carried, and only
 * the caller knows: a `sendMessage` that fails while delivering a note is
 * `DELIVERY_FAILED` — a state an operator has to reconcile — while the same call
 * failing to say "that note is already gone" loses nothing. The delivery service
 * re-classifies; this module cannot, and moving that judgement here would make the
 * taxonomy say "a call failed" about a note that exists and nobody has seen.
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
  options: { timeoutMs?: number; fileUnavailableOn400?: boolean; fetch?: typeof fetch } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Contains the bot token. Never logged, never thrown.
  const endpoint = `${TELEGRAM_API_BASE}/bot${botToken.reveal()}/${method}`;

  let envelope: TelegramEnvelope<T>;

  try {
    const response = await (options.fetch ?? fetch)(endpoint, {
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
    if (options.fileUnavailableOn400 === true && envelope.error_code === 400) {
      throw AppError.fileUnavailable("telegram getFile no longer recognises the file id");
    }
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

// --- Private file retrieval ------------------------------------------------

const TelegramFileSchema = z.object({
  file_id: z.string().min(1),
  file_unique_id: z.string().min(1),
  file_size: z.number().int().nonnegative().optional(),
  file_path: z.string().min(1).optional(),
});

/**
 * Fetch a Telegram upload into memory with a hard byte ceiling.
 *
 * The download URL embeds the bot token. It exists only in this scope and is
 * never returned, logged, stored, included in an exception or sent to Gemini.
 */
export async function downloadFile(
  botToken: Secret,
  fileId: string,
  maxBytes: number,
  options: { timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<Uint8Array> {
  const rawFile = await callTelegram<unknown>(botToken, "getFile", { file_id: fileId }, {
    timeoutMs: options.timeoutMs,
    fileUnavailableOn400: true,
    fetch: options.fetch,
  });
  const file = TelegramFileSchema.safeParse(rawFile);
  if (!file.success || file.data.file_path === undefined) {
    throw AppError.fileUnavailable("telegram getFile returned no downloadable path");
  }
  if (file.data.file_size !== undefined && file.data.file_size > maxBytes) {
    throw AppError.inputTooLarge("telegram file metadata exceeded the download limit");
  }

  // Credential-bearing URL. It must never cross this function boundary.
  const endpoint = `${TELEGRAM_API_BASE}/file/bot${botToken.reveal()}/${file.data.file_path}`;
  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (thrown) {
    if (thrown instanceof DOMException && thrown.name === "TimeoutError") {
      throw AppError.telegramError("telegram file download timed out", thrown);
    }
    throw AppError.telegramError("telegram file download was unreachable", thrown);
  }

  if (response.status === 404) {
    throw AppError.fileUnavailable("telegram file download returned 404");
  }
  if (!response.ok || response.body === null) {
    throw AppError.telegramError(`telegram file download returned ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body.cancel();
    throw AppError.inputTooLarge("telegram download content-length exceeded the limit");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw AppError.inputTooLarge("telegram download exceeded the streamed byte limit");
      }
      chunks.push(value);
    }
  } catch (thrown) {
    if (thrown instanceof AppError) throw thrown;
    throw AppError.telegramError("telegram file stream failed", thrown);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// --- Sending ---------------------------------------------------------------

/**
 * The update kinds the application consumes.
 *
 * Restricting delivery is a privacy measure as much as a performance one: with
 * this list set, Telegram never sends Notinn the group messages, reactions and
 * inline queries the bot would otherwise have to receive and discard.
 *
 * `callback_query` was added in Phase 1, when the delivered note grew buttons.
 * A webhook registered before that change will not receive button taps until it is
 * registered again — the constant is what the registration script sends, so
 * re-running `deno task set-webhook` is the whole of the fix. Recorded in
 * docs/ADR/0007-phase-1-scope.md because nothing in the code can detect it:
 * `getWebhookInfo` reports the list Telegram holds, and comparing it against this
 * one is the check.
 */
export const SUBSCRIBED_UPDATE_KINDS = ["message", "callback_query"] as const;

/** One button on an inline keyboard. */
export interface InlineKeyboardButton {
  readonly text: string;
  /**
   * The payload, from `schemas/callback.ts`. Never user content: blueprint 17.4
   * requires opaque ids, and Telegram echoes this value back verbatim.
   */
  readonly callback_data: string;
}

export interface InlineKeyboardMarkup {
  readonly inline_keyboard: readonly (readonly InlineKeyboardButton[])[];
}

export interface SendMessageOptions {
  /**
   * Buttons to attach. Omitted means a message with no actions, which is what a
   * failure notice is.
   */
  readonly inlineKeyboard?: InlineKeyboardMarkup;
  /**
   * Whether Telegram should render a card for a URL in the text. Off by default.
   *
   * A note is text the user wrote, not a link to preview: a source message
   * containing a URL would otherwise sprout a card inside a generated summary, and
   * the card is fetched by the recipient's client from a server that then learns
   * they looked at it. Blueprint 16.3's posture is that Notinn does not leak
   * content outward, and this is the same posture applied to a link the user
   * quoted rather than one they asked to share.
   */
  readonly allowLinkPreview?: boolean;
  /**
   * The markup Telegram should interpret in `text`. Absent means `text` is text.
   *
   * THIS IS AN OPT-IN, AND THE DEFAULT IS THE POINT. Blueprint 16.2 requires
   * Telegram-safe HTML, and `_shared/services/note-rendering.ts` produces exactly
   * that: it escapes every piece of user and model text and is arranged so an
   * entity cannot be split across messages. A caller that has done that work opts
   * in here. A caller that has not — a failure notice, a toast, anything
   * interpolating a value nobody escaped — leaves it absent, and a `<` in that
   * value stays a `<`.
   *
   * The default is what makes this safe rather than merely conventional: setting
   * `parse_mode` globally was the alternative, and it would have made every future
   * message a place where forgetting to escape is a rendering bug the author
   * cannot see. Here, forgetting is a message that displays its own markup — ugly,
   * obvious, and caught the first time anyone looks.
   */
  readonly parseMode?: "HTML";
}

/**
 * Just enough of the sent message to be able to edit it later.
 *
 * Phase 2's status-message editing needs `message_id`; nothing else about the
 * reply is used, so nothing else is modelled. The shape is validated because the
 * id is the only thing keeping a later edit pointed at Notinn's own message.
 */
const SentMessageSchema = z.object({
  message_id: z.number().int(),
});

export interface TelegramSentMessage {
  readonly messageId: number;
}

/**
 * Send a text message.
 *
 * WHO ESCAPES. `parseMode: "HTML"` is the caller's promise that every value
 * already interpolated into `text` went through `escapeHtml`, because Telegram
 * will interpret what it is given rather than display it. The only Phase 1 caller
 * that passes it is note delivery, and the only thing it passes is the output of
 * `renderNoteOutput`, which escapes last — after splitting — precisely so that
 * promise holds across a page boundary.
 *
 * A malformed entity is not silently tolerated: Telegram rejects the call, this
 * throws `TELEGRAM_ERROR`, and the note is recorded as undelivered rather than
 * delivered wrong. That is the failure direction to want, and it is why the
 * escaping guarantee lives in a module with its own tests rather than in a habit.
 */
export async function sendMessage(
  botToken: Secret,
  chatId: number,
  text: string,
  options: SendMessageOptions = {},
): Promise<TelegramSentMessage> {
  const result = await callTelegram<unknown>(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: options.allowLinkPreview !== true },
    ...(options.parseMode === undefined ? {} : { parse_mode: options.parseMode }),
    ...(options.inlineKeyboard === undefined ? {} : { reply_markup: options.inlineKeyboard }),
  });

  const parsed = SentMessageSchema.safeParse(result);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.TELEGRAM_ERROR, {
      internalDetail: "telegram sendMessage returned no message id",
    });
  }

  return { messageId: parsed.data.message_id };
}

/** Upload one bounded in-memory document without persisting it outside Telegram. */
export async function sendDocument(
  botToken: Secret,
  chatId: number,
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  options: { caption?: string; timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<TelegramSentMessage> {
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(filename)) {
    throw AppError.validation("outbound document filename is invalid");
  }

  const endpoint = `${TELEGRAM_API_BASE}/bot${botToken.reveal()}/sendDocument`;
  const body = new FormData();
  body.append("chat_id", String(chatId));
  if (options.caption !== undefined) body.append("caption", options.caption);
  const uploadBytes = new Uint8Array(bytes.byteLength);
  uploadBytes.set(bytes);
  body.append("document", new Blob([uploadBytes.buffer], { type: mimeType }), filename);

  let envelope: TelegramEnvelope<unknown>;
  try {
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    envelope = (await response.json()) as TelegramEnvelope<unknown>;
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.name : "unknown error";
    throw new AppError(ERROR_CODES.TELEGRAM_ERROR, {
      internalDetail: `telegram sendDocument could not be reached: ${reason}`,
      cause: thrown,
    });
  } finally {
    uploadBytes.fill(0);
  }

  if (!envelope.ok) {
    throw new AppError(ERROR_CODES.TELEGRAM_ERROR, {
      internalDetail: `telegram sendDocument refused: ${
        redactText(envelope.description ?? "(no description)")
      } (code ${envelope.error_code ?? "unknown"})`,
    });
  }

  const parsed = SentMessageSchema.safeParse(envelope.result);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.TELEGRAM_ERROR, {
      internalDetail: "telegram sendDocument returned no message id",
    });
  }
  return { messageId: parsed.data.message_id };
}

/**
 * Answer a callback query, which is what stops the button's progress indicator.
 *
 * Telegram requires an answer within about ten seconds or the client shows the
 * user a failure, so the caller answers even when the action failed — see
 * blueprint 17.4's fourth step. That is why the optional `text` exists: it is the
 * only way to say "that note is gone" without sending a second message.
 *
 * A `show_alert` is reserved for a refusal the user must acknowledge. A toast is
 * quieter and is the right default for an acknowledgement.
 */
export function answerCallbackQuery(
  botToken: Secret,
  callbackQueryId: string,
  options: { text?: string; showAlert?: boolean } = {},
): Promise<boolean> {
  return callTelegram<boolean>(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(options.text === undefined ? {} : { text: options.text }),
    ...(options.showAlert === undefined ? {} : { show_alert: options.showAlert }),
  });
}

/** Replace the buttons beneath an existing bot message. */
export function editMessageReplyMarkup(
  botToken: Secret,
  chatId: number,
  messageId: number,
  inlineKeyboard: InlineKeyboardMarkup,
): Promise<unknown> {
  return callTelegram<unknown>(botToken, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: inlineKeyboard,
  });
}

/** Replace a bot message and, optionally, its keyboard. */
export function editMessageText(
  botToken: Secret,
  chatId: number,
  messageId: number,
  text: string,
  options: SendMessageOptions = {},
): Promise<unknown> {
  return callTelegram<unknown>(botToken, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    link_preview_options: { is_disabled: options.allowLinkPreview !== true },
    ...(options.parseMode === undefined ? {} : { parse_mode: options.parseMode }),
    ...(options.inlineKeyboard === undefined ? {} : { reply_markup: options.inlineKeyboard }),
  });
}

/** Injectable transport used by services and backed by the Bot API in production. */
export interface TelegramGateway {
  sendMessage(
    chatId: number,
    text: string,
    options?: SendMessageOptions,
  ): Promise<TelegramSentMessage>;
  sendDocument(
    chatId: number,
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
    options?: { caption?: string },
  ): Promise<TelegramSentMessage>;
  answerCallbackQuery(
    callbackQueryId: string,
    options?: { text?: string; showAlert?: boolean },
  ): Promise<boolean>;
  editMessageReplyMarkup(
    chatId: number,
    messageId: number,
    inlineKeyboard: InlineKeyboardMarkup,
  ): Promise<unknown>;
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options?: SendMessageOptions,
  ): Promise<unknown>;
  downloadFile(fileId: string, maxBytes: number): Promise<Uint8Array>;
}

export function createTelegramGateway(botToken: Secret): TelegramGateway {
  return {
    sendMessage: (chatId, text, options) => sendMessage(botToken, chatId, text, options),
    sendDocument: (chatId, bytes, filename, mimeType, options) =>
      sendDocument(botToken, chatId, bytes, filename, mimeType, options),
    answerCallbackQuery: (callbackQueryId, options) =>
      answerCallbackQuery(botToken, callbackQueryId, options),
    editMessageReplyMarkup: (chatId, messageId, keyboard) =>
      editMessageReplyMarkup(botToken, chatId, messageId, keyboard),
    editMessageText: (chatId, messageId, text, options) =>
      editMessageText(botToken, chatId, messageId, text, options),
    downloadFile: (fileId, maxBytes) => downloadFile(botToken, fileId, maxBytes),
  };
}
