/**
 * Synthetic Telegram updates for the tests.
 *
 * Every value here is invented. No real Telegram account, chat, file or message
 * appears in this repository, and no fixture is derived from production traffic.
 * Identifiers are drawn from a reserved range so that a fixture which escaped
 * into a real environment could be recognised as synthetic on sight.
 *
 * These are builders rather than static JSON because the interesting cases are
 * variations — a group instead of a private chat, a bot instead of a person —
 * and expressing those as overrides keeps each test's intent visible at the
 * point of use.
 */

/** Telegram ids in this range are reserved for synthetic traffic. */
export const SYNTHETIC_ID_BASE = 900_000_000;

/** A plausible `date` field. Fixed so fixtures are deterministic. */
const FIXED_UNIX_TIME = 1_760_000_000;

export interface TextUpdateOptions {
  readonly updateId?: number;
  readonly userId?: number;
  readonly chatId?: number;
  readonly chatType?: "private" | "group" | "supergroup" | "channel";
  readonly isBot?: boolean;
  readonly text?: string;
  readonly forwarded?: boolean;
  readonly messageId?: number;
}

function sender(userId: number, isBot: boolean) {
  return {
    id: userId,
    is_bot: isBot,
    first_name: isBot ? "Synthetic Bot" : "Synthetic User",
    language_code: "en",
  };
}

function base(updateId: number, userId: number, chatId: number, chatType: string, isBot: boolean) {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      from: sender(userId, isBot),
      chat: { id: chatId, type: chatType },
      date: FIXED_UNIX_TIME,
    },
  };
}

/**
 * A text message, private unless `chatType` says otherwise.
 *
 * This is the base for every text fixture; the named helpers below are presets
 * over it. A test needing an unusual combination sets the fields directly rather
 * than growing another builder.
 */
export function textUpdate(options: TextUpdateOptions = {}): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 1;
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 1;
  const update = base(
    updateId,
    userId,
    options.chatId ?? userId,
    options.chatType ?? "private",
    options.isBot ?? false,
  );

  const message = update.message as Record<string, unknown>;
  message["message_id"] = options.messageId ?? 1;
  message["text"] = options.text ?? "Synthetic note body.";

  if (options.forwarded === true) {
    message["forward_origin"] = { type: "user", date: FIXED_UNIX_TIME };
  }

  return update;
}

/** A text message in a group, supergroup or channel. */
export function groupTextUpdate(
  chatType: "group" | "supergroup" | "channel" = "group",
  options: TextUpdateOptions = {},
): Record<string, unknown> {
  return textUpdate({
    ...options,
    chatType,
    chatId: options.chatId ?? SYNTHETIC_ID_BASE + 500,
  });
}

/** A private message whose sender is another bot. */
export function botTextUpdate(options: TextUpdateOptions = {}): Record<string, unknown> {
  return textUpdate({ ...options, isBot: true });
}

/** A voice note in a private chat. */
export function voiceUpdate(options: {
  updateId?: number;
  userId?: number;
  duration?: number;
  fileSize?: number;
} = {}): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 10;
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 10;
  const update = base(updateId, userId, userId, "private", false);

  const message = update.message as Record<string, unknown>;
  message["voice"] = {
    file_id: "synthetic-voice-file-id",
    file_unique_id: "synthetic-voice-unique-id",
    duration: options.duration ?? 42,
    mime_type: "audio/ogg",
    file_size: options.fileSize ?? 12_345,
  };

  return update;
}

/** An audio file in a private chat. */
export function audioUpdate(
  options: { updateId?: number; userId?: number } = {},
): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 11;
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 11;
  const update = base(updateId, userId, userId, "private", false);

  const message = update.message as Record<string, unknown>;
  message["audio"] = {
    file_id: "synthetic-audio-file-id",
    file_unique_id: "synthetic-audio-unique-id",
    duration: 180,
    mime_type: "audio/mpeg",
    file_size: 2_000_000,
    file_name: "synthetic-recording.mp3",
  };

  return update;
}

/**
 * A photo, sent the way Telegram sends one: several rescaled copies ascending
 * in size. The largest is the one Notinn should keep.
 */
export function photoUpdate(
  options: { updateId?: number; userId?: number } = {},
): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 20;
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 20;
  const update = base(updateId, userId, userId, "private", false);

  const message = update.message as Record<string, unknown>;
  message["photo"] = [
    {
      file_id: "synthetic-photo-small",
      file_unique_id: "synthetic-photo-small-u",
      width: 90,
      height: 60,
    },
    {
      file_id: "synthetic-photo-medium",
      file_unique_id: "synthetic-photo-medium-u",
      width: 320,
      height: 213,
    },
    {
      file_id: "synthetic-photo-large",
      file_unique_id: "synthetic-photo-large-u",
      width: 1280,
      height: 853,
      file_size: 250_000,
    },
  ];

  return update;
}

/** A document in a private chat. */
export function documentUpdate(options: {
  updateId?: number;
  userId?: number;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number;
} = {}): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 30;
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 30;
  const update = base(updateId, userId, userId, "private", false);

  const document: Record<string, unknown> = {
    file_id: "synthetic-document-file-id",
    file_unique_id: "synthetic-document-unique-id",
    file_size: options.fileSize ?? 400_000,
  };

  const mimeType = options.mimeType === undefined ? "application/pdf" : options.mimeType;
  const fileName = options.fileName === undefined ? "synthetic-document.pdf" : options.fileName;

  if (mimeType !== null) document["mime_type"] = mimeType;
  if (fileName !== null) document["file_name"] = fileName;

  (update.message as Record<string, unknown>)["document"] = document;

  return update;
}

/** An update carrying content Notinn does not handle. */
export function unsupportedContentUpdate(
  options: { updateId?: number; userId?: number } = {},
): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 40;
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 40;
  const update = base(updateId, userId, userId, "private", false);

  (update.message as Record<string, unknown>)["sticker"] = {
    file_id: "synthetic-sticker",
    file_unique_id: "synthetic-sticker-u",
    type: "regular",
    width: 512,
    height: 512,
    is_animated: false,
    is_video: false,
  };

  return update;
}

/** An update kind Notinn recognises but does not act on. */
export function callbackQueryUpdate(
  options: { updateId?: number; userId?: number } = {},
): Record<string, unknown> {
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 50;
  return {
    update_id: options.updateId ?? SYNTHETIC_ID_BASE + 50,
    callback_query: {
      id: "synthetic-callback-id",
      from: sender(userId, false),
      chat_instance: "synthetic-chat-instance",
      data: "synthetic:callback",
    },
  };
}

/** A callback attached to a bot message in a private chat. */
export function actionableCallbackQueryUpdate(
  options: { updateId?: number; userId?: number; data?: string } = {},
): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 51;
  const userId = options.userId ?? SYNTHETIC_ID_BASE + 51;
  const update = base(updateId, userId, userId, "private", true);
  const message = update.message as Record<string, unknown>;
  delete message["text"];

  return {
    update_id: updateId,
    callback_query: {
      id: "synthetic-actionable-callback-id",
      from: sender(userId, false),
      message,
      chat_instance: "synthetic-chat-instance",
      data: options.data ?? "synthetic:callback",
    },
  };
}

/** A channel post, which is neither private nor a message Notinn accepts. */
export function channelPostUpdate(options: { updateId?: number } = {}): Record<string, unknown> {
  const updateId = options.updateId ?? SYNTHETIC_ID_BASE + 60;
  const userId = SYNTHETIC_ID_BASE + 60;

  return {
    update_id: updateId,
    channel_post: {
      message_id: 7,
      chat: { id: userId, type: "channel", title: "Synthetic Channel" },
      date: FIXED_UNIX_TIME,
      text: "Synthetic channel post.",
    },
  };
}

/** An update with a text body longer than the accepted maximum. */
export function oversizedTextUpdate(
  options: { updateId?: number; length: number },
): Record<string, unknown> {
  return textUpdate({
    updateId: options.updateId ?? SYNTHETIC_ID_BASE + 70,
    text: "x".repeat(options.length),
  });
}
