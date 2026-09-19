import { assertEquals } from "@std/assert";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import { encodeCallbackPayload } from "../../supabase/functions/_shared/schemas/callback.ts";
import { handleCallback } from "../../supabase/functions/_shared/services/callback.service.ts";
import type { CallbackActionRequest } from "../../supabase/functions/_shared/telegram/parse-update.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const OUTPUT_ID = "33333333-3333-4333-8333-333333333333";

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

function payload(kind: "save" | "shorter" | "export_md" | "export_txt"): string {
  return encodeCallbackPayload({ action: { kind }, resourceId: NOTE_ID, revision: 0 });
}

function harness(options: { sourceExists?: boolean; displayExists?: boolean } = {}) {
  const events: string[] = [];
  const documents: { filename: string; mimeType: string; content: string }[] = [];
  let providerCalls = 0;
  const { logger } = createCapturingLogger({ level: "debug" });
  const note = structuredNoteFixture();

  const deps = {
    users: {
      ensureUser: () => {
        events.push("ensure_user");
        return Promise.resolve(USER_ID);
      },
    },
    notes: {
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
            sourceText: "Synthetic source.",
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
      listLabels: () => Promise.resolve(new Map([["clean_note", "Clean Note"]])),
    },
    usage: { recordGeneration: () => Promise.resolve() },
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
      editMessageReplyMarkup: () => {
        events.push("edit_keyboard");
        return Promise.resolve(true);
      },
      editMessageText: () => Promise.resolve(true),
    },
    logger,
  };

  return { deps, events, documents, providerCalls: () => providerCalls };
}

Deno.test("a save callback is answered before the owner-scoped write", async () => {
  const test = harness();

  await handleCallback(callback(payload("save")), test.deps);

  assertEquals(test.events.slice(0, 3), ["answer", "ensure_user", "save"]);
  assertEquals(test.events.includes("edit_keyboard"), true);
});

Deno.test("regeneration becomes current only after the new output is sent", async () => {
  const test = harness();

  await handleCallback(callback(payload("shorter")), test.deps);

  assertEquals(test.events.indexOf("insert_output") < test.events.indexOf("send"), true);
  assertEquals(test.events.indexOf("send") < test.events.indexOf("set_current"), true);
  assertEquals(test.providerCalls(), 1);
});

Deno.test("a foreign or missing note is refused before a provider call", async () => {
  const test = harness({ sourceExists: false });

  await handleCallback(callback(payload("shorter")), test.deps);

  assertEquals(test.providerCalls(), 0);
  assertEquals(test.events.includes("send"), true);
  assertEquals(test.events.includes("insert_output"), false);
});

Deno.test("malformed callback data is acknowledged without resolving a user", async () => {
  const test = harness();

  await handleCallback(callback("not-a-callback"), test.deps);

  assertEquals(test.events, ["answer"]);
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
  assertEquals(text.documents[0]?.content.includes("ACTION ITEMS"), true);
});

Deno.test("an export callback cannot read or send another user's note", async () => {
  const test = harness({ displayExists: false });

  await handleCallback(callback(payload("export_md")), test.deps);

  assertEquals(test.documents.length, 0);
  assertEquals(test.providerCalls(), 0);
  assertEquals(test.events.includes("send"), true);
});
