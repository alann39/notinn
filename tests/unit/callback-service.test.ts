import { assertEquals } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import { encodeCallbackPayload } from "../../supabase/functions/_shared/schemas/callback.ts";
import { encodeNavigationCallback } from "../../supabase/functions/_shared/schemas/navigation-callback.ts";
import { handleCallback } from "../../supabase/functions/_shared/services/callback.service.ts";
import type { CallbackActionRequest } from "../../supabase/functions/_shared/telegram/parse-update.ts";
import type {
  InlineKeyboardMarkup,
  SendMessageOptions,
} from "../../supabase/functions/_shared/telegram/client.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const OUTPUT_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_ID = "55555555-5555-4555-8555-555555555555";

function callback(data: string): CallbackActionRequest {
  return {
    updateId: 900_000_001,
    callbackQueryId: "synthetic-callback-id",
    messageId: 17,
    data,
    telegramUserId: 900_000_001,
    telegramChatId: 900_000_001,
    telegramUsername: null,
    displayName: "Synthetic User",
  };
}

function payload(
  kind:
    | "save"
    | "edit"
    | "edit_format"
    | "edit_export"
    | "edit_back"
    | "shorter"
    | "delete_confirm"
    | "export_md"
    | "export_txt"
    | "export_pdf",
): string {
  return encodeCallbackPayload({ action: { kind }, resourceId: NOTE_ID, revision: 0 });
}

function draftPayload(
  kind: "draft_before" | "draft_after" | "draft_apply" | "draft_discard",
): string {
  return encodeCallbackPayload({ action: { kind }, resourceId: DRAFT_ID, revision: 0 });
}

function harness(
  options: {
    sourceExists?: boolean;
    sourceText?: string | null;
    displayExists?: boolean;
    quotaError?: AppError;
    draftBusy?: boolean;
    deliveries?: readonly {
      deliveryId: string;
      noteId: string;
      chatId: number;
      messageIds: readonly number[];
    }[];
  } = {},
) {
  const events: string[] = [];
  const documents: { filename: string; mimeType: string; content: string }[] = [];
  const keyboards: string[][][] = [];
  const editedTexts: string[] = [];
  const editedMessageIds: number[] = [];
  const deletedMessageIds: number[][] = [];
  let providerCalls = 0;
  const { logger } = createCapturingLogger({ level: "debug" });
  const note = structuredNoteFixture();
  const beforeNote = structuredNoteFixture({ title: "Before synthetic note" });
  const afterNote = structuredNoteFixture({ title: "After synthetic note" });

  const deps = {
    users: {
      ensureUser: () => {
        events.push("ensure_user");
        return Promise.resolve(USER_ID);
      },
    },
    notes: {
      listRecentSavedNotes: () => Promise.resolve([]),
      setNoteSaved: () => {
        events.push("save");
        return Promise.resolve({ outcome: "updated" as const, noteId: NOTE_ID, isSaved: true });
      },
      findNoteForDisplay: () =>
        Promise.resolve(
          options.displayExists === false ? null : {
            noteId: NOTE_ID,
            renderedText: "<b>Synthetic weekly sync</b>",
            contentJson: note,
            templateKey: "clean_note",
            isSaved: true,
            sourceType: "text" as const,
          },
        ),
      findNoteForRegeneration: () =>
        Promise.resolve(
          options.sourceExists === false ? null : {
            noteId: NOTE_ID,
            language: "en",
            sourceType: "text" as const,
            sourceText: options.sourceText === undefined ? "Synthetic source." : options.sourceText,
            templateKey: "clean_note",
          },
        ),
      regenerateNoteOutput: () => {
        events.push("insert_output");
        return Promise.resolve({
          outcome: "created" as const,
          noteId: NOTE_ID,
          outputId: OUTPUT_ID,
        });
      },
      setCurrentOutput: () => {
        events.push("set_current");
        return Promise.resolve({
          outcome: "updated" as const,
          noteId: NOTE_ID,
          outputId: OUTPUT_ID,
        });
      },
      deleteNote: () => Promise.resolve({ outcome: "deleted" as const, noteId: NOTE_ID }),
    },
    workflow: {
      registerDelivery: () =>
        Promise.resolve({ outcome: "created" as const, deliveryId: DRAFT_ID }),
      findDelivery: () => Promise.resolve(null),
      listDeliveries: () => Promise.resolve(options.deliveries ?? []),
      replaceDeliveryMessages: () => Promise.resolve("updated" as const),
      beginDraft: () => {
        events.push("begin_draft");
        return options.draftBusy
          ? Promise.resolve({ outcome: "busy" as const, draftId: null })
          : Promise.resolve({ outcome: "created" as const, draftId: DRAFT_ID });
      },
      completeDraft: () => {
        events.push("complete_draft");
        return Promise.resolve("ready" as const);
      },
      getDraft: () =>
        Promise.resolve({
          draftId: DRAFT_ID,
          noteId: NOTE_ID,
          baseOutputId: "66666666-6666-4666-8666-666666666666",
          draftOutputId: OUTPUT_ID,
          baseContentJson: beforeNote,
          draftContentJson: afterNote,
          isSaved: true,
        }),
      applyDraft: () => {
        events.push("apply_draft");
        return Promise.resolve({
          outcome: "applied" as const,
          noteId: NOTE_ID,
          outputId: OUTPUT_ID,
          isSaved: true,
        });
      },
      discardDraft: () => {
        events.push("discard_draft");
        return Promise.resolve({
          outcome: "discarded" as const,
          noteId: NOTE_ID,
          isSaved: true,
        });
      },
      failDraft: () => Promise.resolve(),
    },
    templates: {
      findForGeneration: () =>
        Promise.resolve({
          key: "clean_note" as const,
          name: "Clean Note",
          instruction: "Correct and structure.",
          contract: "structured_note",
          schemaVersion: 1,
          responseJsonSchema: {},
        }),
      listLabels: () =>
        Promise.resolve(
          new Map([
            ["clean_note", "Clean Note"],
            ["short_summary", "Short Summary"],
          ]),
        ),
    },
    preferences: {
      get: () =>
        Promise.resolve({
          outputLanguage: "mirror" as const,
          defaultTextTemplate: null,
          defaultVoiceTemplate: null,
          defaultDocumentTemplate: null,
          privacyMode: "balanced" as const,
        }),
      update: () =>
        Promise.resolve({
          outputLanguage: "id" as const,
          defaultTextTemplate: null,
          defaultVoiceTemplate: null,
          defaultDocumentTemplate: null,
          privacyMode: "balanced" as const,
        }),
    },
    usage: { recordGeneration: () => Promise.resolve() },
    quota: {
      reserve: () => {
        events.push("quota_reserve");
        if (options.quotaError !== undefined) return Promise.reject(options.quotaError);
        return Promise.resolve({
          reservationId: "44444444-4444-4444-8444-444444444444",
          outcome: "reserved" as const,
        });
      },
      consume: () => {
        events.push("quota_consume");
        return Promise.resolve();
      },
      getSummary: () => Promise.resolve([]),
    },
    provider: {
      generateText: () => {
        providerCalls += 1;
        return Promise.resolve({
          note,
          provider: "gemini",
          model: "gemini-synthetic-flash",
          providerRequestId: "synthetic-request",
          inputTokens: 10,
          outputTokens: 20,
        });
      },
    },
    telegram: {
      answerCallbackQuery: () => {
        events.push("answer");
        return Promise.resolve(true);
      },
      sendMessage: () => {
        events.push("send");
        return Promise.resolve({ messageId: 18 });
      },
      sendDocument: (
        _chatId: number,
        bytes: Uint8Array,
        filename: string,
        mimeType: string,
      ) => {
        events.push("send_document");
        documents.push({
          filename,
          mimeType,
          content: new TextDecoder().decode(bytes.slice()),
        });
        return Promise.resolve({ messageId: 19 });
      },
      editMessageReplyMarkup: (
        _chatId: number,
        _messageId: number,
        markup: InlineKeyboardMarkup,
      ) => {
        events.push("edit_keyboard");
        keyboards.push(markup.inline_keyboard.map((row) => row.map((item) => item.text)));
        return Promise.resolve(true);
      },
      editMessageText: (
        _chatId: number,
        _messageId: number,
        text: string,
        sendOptions?: SendMessageOptions,
      ) => {
        events.push("edit_text");
        editedMessageIds.push(_messageId);
        editedTexts.push(text);
        if (sendOptions?.inlineKeyboard !== undefined) {
          keyboards.push(
            sendOptions.inlineKeyboard.inline_keyboard.map((row) => row.map((item) => item.text)),
          );
        }
        return Promise.resolve(true);
      },
      deleteMessages: (_chatId: number, messageIds: readonly number[]) => {
        deletedMessageIds.push([...messageIds]);
        return Promise.resolve(true);
      },
    },
    logger,
  };

  return {
    deps,
    events,
    documents,
    keyboards,
    editedTexts,
    editedMessageIds,
    deletedMessageIds,
    providerCalls: () => providerCalls,
  };
}

Deno.test("a save callback is answered before the owner-scoped write", async () => {
  const test = harness();

  await handleCallback(callback(payload("save")), test.deps);

  assertEquals(test.events.slice(0, 3), ["answer", "ensure_user", "save"]);
  assertEquals(test.events.includes("edit_keyboard"), true);
});

Deno.test("a suspended user cannot reuse an old note callback", async () => {
  const test = harness();

  await handleCallback(callback(payload("shorter")), {
    ...test.deps,
    access: {
      getAccess: () =>
        Promise.resolve({ status: "suspended" as const, activatedAt: null, suspendedAt: null }),
    },
  });

  assertEquals(test.providerCalls(), 0);
  assertEquals(test.events.includes("quota_reserve"), false);
  assertEquals(test.events.at(-1), "send");
});

Deno.test("regeneration stages a preview without changing the current output", async () => {
  const test = harness();

  await handleCallback(callback(payload("shorter")), test.deps);

  assertEquals(test.events.indexOf("begin_draft") < test.events.indexOf("quota_reserve"), true);
  assertEquals(test.events.indexOf("insert_output") < test.events.indexOf("complete_draft"), true);
  assertEquals(test.events.includes("set_current"), false);
  assertEquals(test.editedTexts.at(-1)?.includes("Synthetic weekly sync"), true);
  assertEquals(test.providerCalls(), 1);
});

Deno.test("a foreign or missing note is refused before a provider call", async () => {
  const test = harness({ sourceExists: false });

  await handleCallback(callback(payload("shorter")), test.deps);

  assertEquals(test.providerCalls(), 0);
  assertEquals(test.events.includes("send"), true);
  assertEquals(test.events.includes("insert_output"), false);
});

Deno.test("regeneration quota exhaustion is reported before a provider call", async () => {
  const test = harness({ quotaError: AppError.quotaExceeded("synthetic") });

  await handleCallback(callback(payload("shorter")), test.deps);

  assertEquals(test.providerCalls(), 0);
  assertEquals(test.events.includes("quota_consume"), false);
  assertEquals(test.events.at(-1), "send");
});

Deno.test("a duplicate regeneration click stops before quota and provider work", async () => {
  const test = harness({ draftBusy: true });

  await handleCallback(callback(payload("shorter")), test.deps);

  assertEquals(test.providerCalls(), 0);
  assertEquals(test.events.includes("quota_reserve"), false);
  assertEquals(test.keyboards.at(-1), [["⏳ Edit already in progress…"]]);
});

Deno.test("minimal privacy keeps AI edits visibly disabled", async () => {
  const test = harness({ sourceText: null });

  await handleCallback(callback(payload("edit")), test.deps);

  assertEquals(test.keyboards.at(-1), [
    ["🔒 AI edits unavailable — Minimal privacy"],
    ["📤 Export"],
    ["⬅️ Back"],
  ]);
  assertEquals(test.providerCalls(), 0);
});

Deno.test("Before and After toggle by editing the same Telegram bubble", async () => {
  const test = harness();

  await handleCallback(callback(draftPayload("draft_before")), test.deps);
  await handleCallback(callback(draftPayload("draft_after")), test.deps);

  assertEquals(test.editedMessageIds, [17, 17]);
  assertEquals(test.editedTexts[0]?.includes("Before synthetic note"), true);
  assertEquals(test.editedTexts[1]?.includes("After synthetic note"), true);
  assertEquals(test.keyboards.at(-1), [
    ["◀️ Before", "After ✓ ▶️"],
    ["✅ Apply change", "↩️ Cancel"],
  ]);
});

Deno.test("Apply commits the staged output and restores the compact note controls", async () => {
  const test = harness();

  await handleCallback(callback(draftPayload("draft_apply")), test.deps);

  assertEquals(test.events.includes("apply_draft"), true);
  assertEquals(test.editedTexts.at(-1)?.includes("After synthetic note"), true);
  assertEquals(test.keyboards[0], [["⏳ Applying change…"]]);
  assertEquals(test.keyboards.at(-1), [["📤 Unsave", "⚙️ Options", "🗑️ Delete"]]);
});

Deno.test("Cancel discards the candidate and restores the original note", async () => {
  const test = harness();

  await handleCallback(callback(draftPayload("draft_discard")), test.deps);

  assertEquals(test.events.includes("discard_draft"), true);
  assertEquals(test.editedTexts.at(-1)?.includes("Before synthetic note"), true);
  assertEquals(test.keyboards[0], [["⏳ Restoring original…"]]);
});

Deno.test("delete keeps one tombstone and removes every other registered note message", async () => {
  const test = harness({
    deliveries: [
      {
        deliveryId: DRAFT_ID,
        noteId: NOTE_ID,
        chatId: 900_000_001,
        messageIds: [15, 16, 17],
      },
    ],
  });

  await handleCallback(callback(payload("delete_confirm")), test.deps);

  assertEquals(test.editedTexts.at(-1), "Note deleted.");
  assertEquals(test.deletedMessageIds, [[15, 16]]);
  assertEquals(test.keyboards[0], [["⏳ Deleting note…"]]);
});

Deno.test("malformed callback data is acknowledged without resolving a user", async () => {
  const test = harness();

  await handleCallback(callback("not-a-callback"), test.deps);

  assertEquals(test.events, ["answer"]);
});

Deno.test("navigation callbacks open settings without resolving a fake note", async () => {
  const test = harness();
  const data = encodeNavigationCallback({ action: "settings", value: null });

  await handleCallback(callback(data), test.deps);

  assertEquals(test.events.slice(0, 3), ["answer", "ensure_user", "edit_text"]);
  assertEquals(test.editedTexts[0]?.startsWith("⚙️ Settings"), true);
  assertEquals(test.editedTexts[0]?.includes("Output language: Mirror input"), true);
});

Deno.test("Options reveals each submenu only when requested", async () => {
  const test = harness();

  await handleCallback(callback(payload("edit")), test.deps);
  assertEquals(test.keyboards.at(-1), [
    ["✂️ Shorter", "📝 More detail"],
    ["🎨 Change format", "📤 Export"],
    ["⬅️ Back"],
  ]);

  await handleCallback(callback(payload("edit_export")), test.deps);
  assertEquals(test.keyboards.at(-1), [
    ["📝 Markdown", "📄 Text", "📕 PDF"],
    ["⬅️ Back to options"],
  ]);

  await handleCallback(callback(payload("edit_format")), test.deps);
  assertEquals(test.keyboards.at(-1), [["⚡ Short Summary"], ["⬅️ Back to options"]]);

  await handleCallback(callback(payload("edit_back")), test.deps);
  assertEquals(test.keyboards.at(-1), [["📤 Unsave", "⚙️ Options", "🗑️ Delete"]]);
  assertEquals(test.providerCalls(), 0);
});

Deno.test("export callbacks send the owned current note without another model call", async () => {
  const markdown = harness();
  await handleCallback(callback(payload("export_md")), markdown.deps);

  assertEquals(markdown.providerCalls(), 0);
  assertEquals(markdown.documents[0]?.filename, "synthetic-weekly-sync.md");
  assertEquals(markdown.documents[0]?.mimeType, "text/markdown;charset=utf-8");
  assertEquals(markdown.documents[0]?.content.includes("# Synthetic weekly sync"), true);

  const text = harness();
  await handleCallback(callback(payload("export_txt")), text.deps);
  assertEquals(text.documents[0]?.filename, "synthetic-weekly-sync.txt");
  assertEquals(text.documents[0]?.content.includes("Action items\n------------"), true);

  const pdf = harness();
  await handleCallback(callback(payload("export_pdf")), pdf.deps);
  assertEquals(pdf.documents[0]?.filename, "synthetic-weekly-sync.pdf");
  assertEquals(pdf.documents[0]?.mimeType, "application/pdf");
  assertEquals(pdf.documents[0]?.content.startsWith("%PDF-"), true);
});

Deno.test("an export callback cannot read or send another user's note", async () => {
  const test = harness({ displayExists: false });

  await handleCallback(callback(payload("export_md")), test.deps);

  assertEquals(test.documents.length, 0);
  assertEquals(test.providerCalls(), 0);
  assertEquals(test.events.includes("send"), true);
});
