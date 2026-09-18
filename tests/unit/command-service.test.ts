import { assertEquals } from "@std/assert";
import { handleCommand } from "../../supabase/functions/_shared/services/command.service.ts";
import type { CommandMessage } from "../../supabase/functions/_shared/telegram/parse-update.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";

function command(name: string, argumentsText: string | null): CommandMessage {
  return {
    updateId: 900_000_001,
    messageId: 1,
    command: name,
    argumentsText,
    telegramUserId: 900_000_001,
    telegramChatId: 900_000_001,
    telegramUsername: null,
    displayName: "Synthetic User",
  };
}

function harness(searchResults: Awaited<ReturnType<StubNotes["searchSavedNotes"]>> = []) {
  const sent: { text: string; options: unknown }[] = [];
  let ensured = 0;
  const searchCalls: { userId: string; query: string; limit: number }[] = [];

  const notes: StubNotes = {
    listRecentSavedNotes: () => Promise.resolve([]),
    searchSavedNotes: (userId, query, limit) => {
      searchCalls.push({ userId, query, limit });
      return Promise.resolve(searchResults);
    },
  };

  return {
    deps: {
      users: {
        ensureUser: () => {
          ensured += 1;
          return Promise.resolve(USER_ID);
        },
      },
      notes,
      telegram: {
        sendMessage: (_chatId: number, text: string, options?: unknown) => {
          sent.push({ text, options });
          return Promise.resolve({ messageId: 1 });
        },
      },
    },
    sent,
    ensured: () => ensured,
    searchCalls: () => searchCalls,
  };
}

interface StubNotes {
  listRecentSavedNotes: () => Promise<[]>;
  searchSavedNotes: (
    userId: string,
    query: string,
    limit: number,
  ) => Promise<
    Array<{
      noteId: string;
      title: string;
      language: "en";
      sourceType: "text";
      templateKey: "clean_note";
      tags: string[];
      rank: number;
      createdAt: string;
      updatedAt: string;
    }>
  >;
}

Deno.test("search without a query explains the command without reading the library", async () => {
  const test = harness();

  await handleCommand(command("search", null), test.deps);

  assertEquals(test.ensured(), 1);
  assertEquals(test.searchCalls(), []);
  assertEquals(test.sent[0]?.text.includes("/search"), true);
});

Deno.test("search returns ranked saved notes with opaque open buttons", async () => {
  const test = harness([{
    noteId: NOTE_ID,
    title: "Quarterly Risk Review",
    language: "en",
    sourceType: "text",
    templateKey: "clean_note",
    tags: ["risk", "quarterly", "controls", "ignored-fourth"],
    rank: 1.25,
    createdAt: "2026-09-17T08:00:00Z",
    updatedAt: "2026-09-18T09:00:00Z",
  }]);

  await handleCommand(command("search", "quarterly risk"), test.deps);

  assertEquals(test.searchCalls(), [{ userId: USER_ID, query: "quarterly risk", limit: 10 }]);
  assertEquals(
    test.sent[0]?.text,
    [
      "Search results:",
      "",
      "1. Quarterly Risk Review — 2026-09-18\n   #risk #quarterly #controls",
    ].join("\n"),
  );
  const options = test.sent[0]?.options as {
    inlineKeyboard: { inline_keyboard: { callback_data: string }[][] };
  };
  assertEquals(
    options.inlineKeyboard.inline_keyboard[0]?.[0]?.callback_data.includes(NOTE_ID),
    false,
  );
});

Deno.test("search reports an empty result without creating buttons", async () => {
  const test = harness();

  await handleCommand(command("search", "nothing here"), test.deps);

  assertEquals(test.searchCalls().length, 1);
  assertEquals(
    test.sent[0]?.text,
    "I could not find that in your saved notes. Try fewer or different keywords.",
  );
  assertEquals(test.sent[0]?.options, undefined);
});
