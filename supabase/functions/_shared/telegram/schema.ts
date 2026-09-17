import { z } from "zod";

/**
 * The subset of the Telegram Update object that Notinn consumes.
 *
 * These schemas describe a payload that arrives from the public internet, so
 * they are treated as hostile input: every field is checked, and nothing is
 * trusted because Telegram "always" sends it.
 *
 * Two deliberate choices:
 *
 *   * Unknown fields are stripped, not rejected. Telegram adds fields to the
 *     Update object with some regularity — `forward_origin` replaced
 *     `forward_from`, `business_message` arrived later. A schema that rejected
 *     unknown keys would start failing webhook deliveries the day Telegram
 *     shipped a feature, which is the worst possible failure mode for the one
 *     endpoint that must never go down.
 *
 *   * Only `update_id` is required at the top level. Everything else is optional
 *     because Telegram delivers many update kinds Notinn ignores, and a
 *     malformed or unrecognised update should be classified and dropped, not
 *     turned into a 500 that makes Telegram retry it forever.
 */

export const TelegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

export const TelegramChatSchema = z.object({
  id: z.number().int(),
  /**
   * The only value Notinn processes (blueprint 16.4). `group`, `supergroup` and
   * `channel` are recognised so they can be classified and ignored by name,
   * rather than falling through as an unknown shape.
   */
  type: z.enum(["private", "group", "supergroup", "channel"]),
  username: z.string().optional(),
  title: z.string().optional(),
});

/**
 * Forward origin, Bot API 7.0 and later.
 *
 * A forwarded message is routed differently from a typed one (blueprint 6.3:
 * "Forwarded message → Short Summary"), so this has to be detected. The union is
 * permissive because the variants differ only in which fields are present, and
 * the router only needs to know that a forward happened.
 */
export const TelegramForwardOriginSchema = z.object({
  type: z.enum(["user", "hidden_user", "chat", "channel"]),
});

export const TelegramVoiceSchema = z.object({
  file_id: z.string().min(1),
  file_unique_id: z.string().min(1),
  duration: z.number().int().nonnegative().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
});

export const TelegramAudioSchema = z.object({
  file_id: z.string().min(1),
  file_unique_id: z.string().min(1),
  duration: z.number().int().nonnegative().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
  file_name: z.string().optional(),
});

/**
 * A photo arrives as a list of sizes, ordered smallest to largest. Notinn keeps
 * the largest, which is the one Telegram recommends for processing.
 */
export const TelegramPhotoSizeSchema = z.object({
  file_id: z.string().min(1),
  file_unique_id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  file_size: z.number().int().nonnegative().optional(),
});

export const TelegramDocumentSchema = z.object({
  file_id: z.string().min(1),
  file_unique_id: z.string().min(1),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
});

export const TelegramMessageSchema = z.object({
  message_id: z.number().int(),
  from: TelegramUserSchema.optional(),
  chat: TelegramChatSchema,
  date: z.number().int(),
  text: z.string().optional(),
  caption: z.string().optional(),
  voice: TelegramVoiceSchema.optional(),
  audio: TelegramAudioSchema.optional(),
  photo: z.array(TelegramPhotoSizeSchema).optional(),
  document: TelegramDocumentSchema.optional(),

  // Forwarding, in both the modern and the legacy shape.
  forward_origin: TelegramForwardOriginSchema.optional(),
  forward_from: TelegramUserSchema.optional(),
  forward_from_chat: TelegramChatSchema.optional(),
  forward_date: z.number().int().optional(),
});

export const TelegramUpdateSchema = z.object({
  /**
   * Telegram's sequential update counter. It is the deduplication key: it is
   * written to public.telegram_updates as the record that this update was seen,
   * and a second delivery carrying it creates nothing.
   *
   * Positive, not merely integral. Telegram assigns these from one upwards, so a
   * zero or negative value cannot have come from Telegram, and accepting one
   * would let a caller manufacture a ledger entry outside the sequence the rest
   * of the system reasons about.
   */
  update_id: z.number().int().positive(),

  // The only update kind Notinn processes in Phase 0. The rest are named so that
  // an update carrying one of them is classified rather than treated as
  // malformed.
  message: TelegramMessageSchema.optional(),
  edited_message: TelegramMessageSchema.optional(),
  channel_post: TelegramMessageSchema.optional(),
  edited_channel_post: TelegramMessageSchema.optional(),
  callback_query: z.object({ id: z.string() }).optional(),
  inline_query: z.object({ id: z.string() }).optional(),
  my_chat_member: z.object({ date: z.number().int() }).optional(),
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;
export type TelegramChat = z.infer<typeof TelegramChatSchema>;
export type TelegramMessage = z.infer<typeof TelegramMessageSchema>;
export type TelegramPhotoSize = z.infer<typeof TelegramPhotoSizeSchema>;
export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

/** Update kinds Notinn recognises but does not act on in Phase 0. */
export const IGNORED_UPDATE_KINDS = [
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "callback_query",
  "inline_query",
  "my_chat_member",
] as const;

export type IgnoredUpdateKind = (typeof IGNORED_UPDATE_KINDS)[number];
