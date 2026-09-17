import { type InputType, MAX_SOURCE_TEXT_LENGTH } from "../config/constants.ts";
import type { SystemTemplateKey } from "../config/constants.ts";
import { documentInputType, routeInput, type RoutingReason } from "../services/input-routing.ts";
import type { TelegramMessage, TelegramUpdate } from "./schema.ts";

/**
 * Classify an incoming Telegram update.
 *
 * This module decides whether an update is something Notinn will act on, and if
 * so what kind of input it is and which template it routes to. It performs no
 * I/O and touches no database, which is what makes the whole ingestion contract
 * testable without a running Supabase.
 *
 * Every rejection is named. An update that is dropped is dropped for a reason
 * that appears in the logs, because "the bot ignored my message" is otherwise an
 * unanswerable support question. Blueprint 16.4 requires private chats only and
 * no bot senders; blueprint 6.3 supplies the routing. The gaps between those two
 * sections, and how Phase 0 resolves them, are recorded in
 * docs/ADR/0003-ingestion-contract.md.
 */

/** Why an update was not acted on. Every value is a safe, fixed string. */
export type IgnoreReason =
  | "non_private_chat"
  | "from_bot"
  | "no_sender"
  | "no_message"
  | "unsupported_update_kind"
  | "empty_message"
  | "unsupported_content"
  | "unsupported_document_type"
  | "source_text_too_long";

/** A message Notinn will turn into a job. */
export interface AcceptedMessage {
  readonly updateId: number;

  // --- Sender --------------------------------------------------------------
  readonly telegramUserId: number;
  readonly telegramChatId: number;
  readonly telegramUsername: string | null;
  readonly displayName: string | null;

  // --- Message -------------------------------------------------------------
  readonly messageId: number;

  // --- Routing -------------------------------------------------------------
  readonly inputType: InputType;
  readonly templateKey: SystemTemplateKey;
  readonly routingReason: RoutingReason;
  readonly forwarded: boolean;

  // --- Payload -------------------------------------------------------------
  /** The message body, for text input only. Never logged. */
  readonly sourceText: string | null;
  /** Telegram's file handle. A capability: never logged. */
  readonly telegramFileId: string | null;
  /** A stable identifier for the same file. Used only as a dedup hint. */
  readonly telegramFileUniqueId: string | null;
  /** Sender-chosen and therefore sensitive. Never logged. */
  readonly originalFilename: string | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly durationSeconds: number | null;
}

export type UpdateClassification =
  | { readonly kind: "accepted"; readonly message: AcceptedMessage }
  | {
    readonly kind: "ignored";
    readonly reason: IgnoreReason;
    /** Fixed, safe context for the log line. Never user content. */
    readonly detail: string;
    readonly updateId: number | null;
  };

/** The content kinds Notinn recognises, in the precedence order it prefers. */
type ContentKind = "document" | "photo" | "voice" | "audio" | "text";

/**
 * Which content a message carries.
 *
 * Telegram does not send more than one of these at once — a photo carries a
 * caption, not `text` — so a message matching several is malformed. The order
 * below resolves that deterministically, richest payload first: a message
 * containing both a document and text is far more likely to be a document with
 * something odd attached than the reverse.
 */
function contentKindOf(message: TelegramMessage): ContentKind | null {
  if (message.document !== undefined) return "document";
  if (message.photo !== undefined && message.photo.length > 0) return "photo";
  if (message.voice !== undefined) return "voice";
  if (message.audio !== undefined) return "audio";
  if (message.text !== undefined) return "text";
  return null;
}

/**
 * Whether a message was forwarded.
 *
 * `forward_origin` is the Bot API 7.0 shape; `forward_from`, `forward_from_chat`
 * and `forward_date` are the older ones. Both are checked because a bot that has
 * existed for a while receives a mix. Blueprint 6.3 routes forwarded messages to
 * a different default.
 */
function isForwarded(message: TelegramMessage): boolean {
  return message.forward_origin !== undefined ||
    message.forward_from !== undefined ||
    message.forward_from_chat !== undefined ||
    message.forward_date !== undefined;
}

/** Best-effort human name for the sender, for the user's own records. */
function displayNameOf(message: TelegramMessage): string | null {
  const from = message.from;
  if (from === undefined) return null;

  const parts = [from.first_name, from.last_name].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );

  const name = parts.join(" ").trim();
  return name === "" ? null : name;
}

/**
 * The largest size of a photo.
 *
 * Telegram sends an array of rescaled copies and recommends using the last, but
 * the ordering guarantee is not worth relying on when the dimensions are right
 * there. Largest by area is what the user actually sent.
 */
function largestPhoto(message: TelegramMessage) {
  const photos = message.photo;
  if (photos === undefined || photos.length === 0) return null;

  return photos.reduce((largest, candidate) =>
    candidate.width * candidate.height > largest.width * largest.height ? candidate : largest
  );
}

function ignored(
  reason: IgnoreReason,
  detail: string,
  updateId: number | null,
): UpdateClassification {
  return { kind: "ignored", reason, detail, updateId };
}

/**
 * Classify a parsed update.
 *
 * The order of the checks is deliberate. Chat type is checked before anything
 * about the sender, because a message in a group must be ignored as a group
 * message regardless of who sent it — and must be ignored *silently*, so that
 * Notinn never announces its presence in someone's group chat.
 */
export function classifyUpdate(update: TelegramUpdate): UpdateClassification {
  const updateId = update.update_id;

  const message = update.message;
  if (message === undefined) {
    // Name the kind when it is one we recognise, so the log distinguishes
    // "Telegram sent something new" from "Telegram sent something malformed".
    const recognised = (
      [
        "edited_message",
        "channel_post",
        "edited_channel_post",
        "callback_query",
        "inline_query",
        "my_chat_member",
      ] as const
    ).find((key) => update[key] !== undefined);

    return recognised === undefined
      ? ignored("no_message", "no recognised update kind", updateId)
      : ignored("unsupported_update_kind", recognised, updateId);
  }

  // --- Private chats only (blueprint 16.4) ---------------------------------
  if (message.chat.type !== "private") {
    return ignored("non_private_chat", message.chat.type, updateId);
  }

  // --- No bots (blueprint 16.4) --------------------------------------------
  const from = message.from;
  if (from === undefined) {
    return ignored("no_sender", "message carried no sender", updateId);
  }
  if (from.is_bot) {
    return ignored("from_bot", "sender is a bot", updateId);
  }

  const forwarded = isForwarded(message);
  const kind = contentKindOf(message);

  if (kind === null) {
    return ignored("unsupported_content", "message carried no supported content", updateId);
  }

  const sender = {
    telegramUserId: from.id,
    telegramChatId: message.chat.id,
    telegramUsername: from.username ?? null,
    displayName: displayNameOf(message),
    messageId: message.message_id,
  };

  // --- Text ----------------------------------------------------------------
  if (kind === "text") {
    const text = message.text ?? "";
    if (text.trim() === "") {
      return ignored("empty_message", "text was empty or whitespace", updateId);
    }
    if (text.length > MAX_SOURCE_TEXT_LENGTH) {
      return ignored(
        "source_text_too_long",
        `text length ${text.length} exceeds ${MAX_SOURCE_TEXT_LENGTH}`,
        updateId,
      );
    }

    const decision = routeInput("text", forwarded);

    return {
      kind: "accepted",
      message: {
        updateId,
        ...sender,
        inputType: decision.inputType,
        templateKey: decision.templateKey,
        routingReason: decision.reason,
        forwarded,
        sourceText: text,
        telegramFileId: null,
        telegramFileUniqueId: null,
        originalFilename: null,
        mimeType: null,
        sizeBytes: null,
        durationSeconds: null,
      },
    };
  }

  // --- Document ------------------------------------------------------------
  if (kind === "document") {
    const document = message.document;
    // contentKindOf only reports "document" when this is present.
    if (document === undefined) {
      return ignored("unsupported_content", "document content missing", updateId);
    }

    const inputType = documentInputType(document.mime_type, document.file_name);
    if (inputType === null) {
      return ignored(
        "unsupported_document_type",
        `document mime ${document.mime_type ?? "(absent)"} is not supported`,
        updateId,
      );
    }

    const decision = routeInput(inputType, forwarded);

    return {
      kind: "accepted",
      message: {
        updateId,
        ...sender,
        inputType: decision.inputType,
        templateKey: decision.templateKey,
        routingReason: decision.reason,
        forwarded,
        sourceText: null,
        telegramFileId: document.file_id,
        telegramFileUniqueId: document.file_unique_id,
        originalFilename: document.file_name ?? null,
        mimeType: document.mime_type ?? null,
        sizeBytes: document.file_size ?? null,
        durationSeconds: null,
      },
    };
  }

  // --- Photo ---------------------------------------------------------------
  if (kind === "photo") {
    const photo = largestPhoto(message);
    if (photo === null) {
      return ignored("unsupported_content", "photo list was empty", updateId);
    }

    const decision = routeInput("image", forwarded);

    return {
      kind: "accepted",
      message: {
        updateId,
        ...sender,
        inputType: decision.inputType,
        templateKey: decision.templateKey,
        routingReason: decision.reason,
        forwarded,
        sourceText: null,
        telegramFileId: photo.file_id,
        telegramFileUniqueId: photo.file_unique_id,
        originalFilename: null,
        mimeType: "image/jpeg",
        sizeBytes: photo.file_size ?? null,
        durationSeconds: null,
      },
    };
  }

  // --- Voice and audio -----------------------------------------------------
  const isVoice = kind === "voice";
  const recording = isVoice ? message.voice : message.audio;

  if (recording === undefined) {
    return ignored("unsupported_content", `${kind} content missing`, updateId);
  }

  const inputType: InputType = isVoice ? "voice" : "audio";
  const decision = routeInput(inputType, forwarded);

  return {
    kind: "accepted",
    message: {
      updateId,
      ...sender,
      inputType: decision.inputType,
      templateKey: decision.templateKey,
      routingReason: decision.reason,
      forwarded,
      sourceText: null,
      telegramFileId: recording.file_id,
      telegramFileUniqueId: recording.file_unique_id,
      originalFilename: null,
      mimeType: recording.mime_type ?? null,
      sizeBytes: recording.file_size ?? null,
      durationSeconds: recording.duration ?? null,
    },
  };
}
