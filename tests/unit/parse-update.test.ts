import { assertEquals } from "@std/assert";
import { MAX_PASTED_TEXT_CHARS } from "../../supabase/functions/_shared/config/constants.ts";
import { classifyUpdate } from "../../supabase/functions/_shared/telegram/parse-update.ts";
import { TelegramUpdateSchema } from "../../supabase/functions/_shared/telegram/schema.ts";
import {
  actionableCallbackQueryUpdate,
  audioUpdate,
  botTextUpdate,
  callbackQueryUpdate,
  channelPostUpdate,
  documentUpdate,
  groupTextUpdate,
  oversizedTextUpdate,
  photoUpdate,
  SYNTHETIC_ID_BASE,
  textUpdate,
  unsupportedContentUpdate,
  voiceUpdate,
} from "../fixtures/telegram/builders.ts";

/**
 * The ingestion contract, stated as tests.
 *
 * Blueprint 16.4 requires that only private chats are accepted and that no bot
 * is ever processed. That rule is enforced here rather than in the database or
 * the network layer, so these tests are the thing standing between a rule in a
 * document and a rule in the product.
 *
 * Every case asserts the FULL classification, not just the accepted input type.
 * A test that only checks `inputType === "image"` would pass even if the message
 * had been routed to the wrong template, which is the half of the decision that
 * actually reaches the user.
 */

/** Parse a synthetic update the way the handler does, failing loudly if it does not fit. */
function parse(raw: Record<string, unknown>) {
  const parsed = TelegramUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `fixture did not match the update schema: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

function classify(raw: Record<string, unknown>) {
  return classifyUpdate(parse(raw));
}

// --- Happy path ------------------------------------------------------------

Deno.test("a private text message is accepted and routed to Clean Note", () => {
  const result = classify(textUpdate({ text: "Buy milk on the way home." }));

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.inputType, "text");
  assertEquals(result.message.templateKey, "clean_note");
  assertEquals(result.message.routingReason, "text");
  assertEquals(result.message.sourceText, "Buy milk on the way home.");
  assertEquals(result.message.forwarded, false);
  assertEquals(result.message.telegramFileId, null);
});

Deno.test("a forwarded message is routed to Short Summary instead of Clean Note", () => {
  // Blueprint 6.3 routes by how a message arrived as well as by what it is.
  const result = classify(textUpdate({ forwarded: true }));

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.inputType, "text");
  assertEquals(result.message.templateKey, "short_summary");
  assertEquals(result.message.routingReason, "forwarded_text");
  assertEquals(result.message.forwarded, true);
});

Deno.test("the legacy forward fields are recognised as a forward", () => {
  // `forward_origin` replaced `forward_from`, but Telegram still sends the old
  // shape in some cases. Missing it would route a forwarded message as typed.
  const raw = textUpdate();
  (raw["message"] as Record<string, unknown>)["forward_from"] = {
    id: SYNTHETIC_ID_BASE + 999,
    is_bot: false,
    first_name: "Synthetic Origin",
  };

  const result = classify(raw);
  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.templateKey, "short_summary");
  assertEquals(result.message.forwarded, true);
});

Deno.test("a voice note is accepted and routed to Clean Note", () => {
  // Blueprint 6.3 says "Meeting Notes if meeting-like, otherwise Clean Note".
  // Nothing has been transcribed in Phase 0, so the meeting-like judgement
  // cannot be made and the table's own fallback applies.
  const result = classify(voiceUpdate());

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.inputType, "voice");
  assertEquals(result.message.templateKey, "clean_note");
  assertEquals(result.message.durationSeconds, 42);
  assertEquals(result.message.mimeType, "audio/ogg");
  assertEquals(result.message.sourceText, null);
});

Deno.test("an audio file is accepted and routed to Clean Note", () => {
  const result = classify(audioUpdate());

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.inputType, "audio");
  assertEquals(result.message.templateKey, "clean_note");
});

Deno.test("a photo is routed to Extract & Summarize", () => {
  const result = classify(photoUpdate());

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.inputType, "image");
  assertEquals(result.message.templateKey, "extract_and_summarize");
});

Deno.test("the largest size of a photo is the one kept", () => {
  // Telegram sends ascending copies, but the recommendation is to use the
  // largest, and relying on ordering rather than dimensions is a needless risk.
  const result = classify(photoUpdate());

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.telegramFileId, "synthetic-photo-large");
  assertEquals(result.message.telegramFileUniqueId, "synthetic-photo-large-u");
  assertEquals(result.message.sizeBytes, 250_000);
});

// --- Document routing ------------------------------------------------------

for (
  const [mimeType, fileName, expected] of [
    ["application/pdf", "report.pdf", "pdf"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "report.docx",
      "docx",
    ],
    ["text/plain", "notes.txt", "txt"],
    ["text/markdown", "notes.md", "md"],
    ["text/plain; charset=utf-8", "notes.txt", "txt"],
  ] as const
) {
  Deno.test(`a ${expected} document is accepted and routed to its default template`, () => {
    const result = classify(documentUpdate({ mimeType, fileName }));

    assertEquals(result.kind, "accepted");
    if (result.kind !== "accepted") return;

    assertEquals(result.message.inputType, expected);
    assertEquals(
      result.message.templateKey,
      expected === "pdf" || expected === "docx" ? "detailed_summary" : "clean_note",
    );
    assertEquals(result.message.originalFilename, fileName);
  });
}

Deno.test("a document with no MIME type falls back to its extension", () => {
  const result = classify(documentUpdate({ mimeType: null, fileName: "notes.md" }));

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.inputType, "md");
});

Deno.test("a document of an unsupported type is ignored, not errored", () => {
  const result = classify(documentUpdate({ mimeType: "application/zip", fileName: "archive.zip" }));

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "unsupported_document_type");
});

Deno.test("a document with neither MIME type nor a known extension is ignored", () => {
  const result = classify(documentUpdate({ mimeType: null, fileName: "mystery" }));

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "unsupported_document_type");
});

// --- Blueprint 16.4: private chats only ------------------------------------

for (const chatType of ["group", "supergroup", "channel"] as const) {
  Deno.test(`a message in a ${chatType} is rejected for the once-per-chat reply`, () => {
    const result = classify(groupTextUpdate(chatType));

    assertEquals(result.kind, "rejected");
    if (result.kind !== "rejected") return;

    assertEquals(result.chat.chatType, chatType);
  });
}

Deno.test("chat type is checked before the sender, so a group is never processed", () => {
  // A message from a bot in a group must be rejected as a group message. If the
  // sender check ran first the reason recorded would be wrong, and more
  // importantly a future change to the bot rule could accidentally re-enable
  // group processing.
  const result = classify(groupTextUpdate("group", { isBot: true }));

  assertEquals(result.kind, "rejected");
  if (result.kind !== "rejected") return;

  assertEquals(result.chat.chatType, "group");
});

Deno.test("a message from another bot is ignored", () => {
  const result = classify(botTextUpdate());

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "from_bot");
});

// --- Ignored update kinds --------------------------------------------------

Deno.test("a callback query is ignored by name", () => {
  const result = classify(callbackQueryUpdate());

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "unsupported_update_kind");
  assertEquals(result.detail, "inline callback_query");
});

Deno.test("a callback attached to a private bot message is classified as an action", () => {
  const result = classify(actionableCallbackQueryUpdate({ data: "v1:save:opaque:0" }));

  assertEquals(result.kind, "callback");
  if (result.kind !== "callback") return;

  assertEquals(result.callback.callbackQueryId, "synthetic-actionable-callback-id");
  assertEquals(result.callback.data, "v1:save:opaque:0");
});

Deno.test("a slash command is not ingested as note text", () => {
  const result = classify(textUpdate({ text: "/recent@NotinnBot" }));

  assertEquals(result.kind, "command");
  if (result.kind !== "command") return;

  assertEquals(result.message.command, "recent");
  assertEquals(result.message.argumentsText, null);
});

Deno.test("a search command preserves normalized arguments without ingesting them", () => {
  const result = classify(textUpdate({ text: "/search@NotinnBot   quarterly risk   " }));

  assertEquals(result.kind, "command");
  if (result.kind !== "command") return;

  assertEquals(result.message.command, "search");
  assertEquals(result.message.argumentsText, "quarterly risk");
});

Deno.test("a channel post is ignored by name", () => {
  const result = classify(channelPostUpdate());

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "unsupported_update_kind");
  assertEquals(result.detail, "channel_post");
});

Deno.test("an update carrying only update_id is ignored, not rejected", () => {
  const result = classify({ update_id: SYNTHETIC_ID_BASE + 80 });

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "no_message");
});

Deno.test("a sticker is ignored as unsupported content", () => {
  const result = classify(unsupportedContentUpdate());

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "unsupported_content");
});

// --- Text limits -----------------------------------------------------------

Deno.test("whitespace-only text is ignored", () => {
  const result = classify(textUpdate({ text: "   \n\t  " }));

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "empty_message");
});

Deno.test("text at the product limit is accepted", () => {
  // The limit here is blueprint 5.1's pasted-text limit rather than the structural
  // bound on `source_text`, because blueprint 10.2 puts the product limit at the
  // point of ingestion. The two are ordered, and `text-normalisation.test.ts`
  // asserts the ordering.
  const result = classify(oversizedTextUpdate({ length: MAX_PASTED_TEXT_CHARS }));
  assertEquals(result.kind, "accepted");
});

Deno.test("text one character over the product limit is ignored", () => {
  const result = classify(oversizedTextUpdate({ length: MAX_PASTED_TEXT_CHARS + 1 }));

  assertEquals(result.kind, "ignored");
  if (result.kind !== "ignored") return;

  assertEquals(result.reason, "source_text_too_long");
});

Deno.test("the text that is accepted is the normalised text, not the raw body", () => {
  // The classifier hands on what will be stored. A caller that received the raw
  // body here would store a value this module had already declared canonical, and
  // the note's digest would be taken over the wrong string.
  const result = classify(textUpdate({ text: "  First line.\r\n\r\nSecond line.  " }));

  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.sourceText, "First line.\n\nSecond line.");
});

// --- Schema tolerance ------------------------------------------------------

Deno.test("unknown fields on an update do not make it unparseable", () => {
  // Telegram adds fields to the Update object regularly. A schema that rejected
  // unknown keys would start failing every delivery the day that happened.
  const raw = textUpdate();
  raw["some_future_telegram_field"] = { nested: true };
  (raw["message"] as Record<string, unknown>)["another_new_field"] = 42;

  const result = classify(raw);
  assertEquals(result.kind, "accepted");
});

Deno.test("an update with no update_id does not parse", () => {
  const raw = textUpdate();
  delete raw["update_id"];

  assertEquals(TelegramUpdateSchema.safeParse(raw).success, false);
});

Deno.test("a zero or negative update_id does not parse", () => {
  // Telegram numbers updates from one upwards. A zero or negative value did not
  // come from Telegram, and it is the dedup key, so it is refused at the
  // boundary rather than written to the ledger.
  assertEquals(TelegramUpdateSchema.safeParse(textUpdate({ updateId: 0 })).success, false);
  assertEquals(TelegramUpdateSchema.safeParse(textUpdate({ updateId: -1 })).success, false);
});

// --- Sender details --------------------------------------------------------

Deno.test("the sender's display name is joined from the available parts", () => {
  const raw = textUpdate();
  (raw["message"] as Record<string, unknown>)["from"] = {
    id: SYNTHETIC_ID_BASE + 1,
    is_bot: false,
    first_name: "Synthetic",
    last_name: "User",
    username: "synthetic_user",
    language_code: "en",
  };

  const result = classify(raw);
  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.displayName, "Synthetic User");
  assertEquals(result.message.telegramUsername, "synthetic_user");
});

Deno.test("a sender with no name at all yields a null display name", () => {
  const raw = textUpdate();
  (raw["message"] as Record<string, unknown>)["from"] = {
    id: SYNTHETIC_ID_BASE + 2,
    is_bot: false,
  };

  const result = classify(raw);
  assertEquals(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  assertEquals(result.message.displayName, null);
});
