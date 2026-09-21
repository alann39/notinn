import { assertEquals } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
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
    listSavedNotesForEmbedding: () => Promise.resolve([]),
    upsertNoteEmbedding: () => Promise.resolve(true),
    matchSavedNoteEmbeddings: () => Promise.resolve([]),
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
  listSavedNotesForEmbedding: () => Promise<[]>;
  upsertNoteEmbedding: () => Promise<boolean>;
  matchSavedNoteEmbeddings: () => Promise<[]>;
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

Deno.test("pending closed-alpha user sees invite onboarding before any feature access", async () => {
  const test = harness();

  await handleCommand(command("start", null), {
    ...test.deps,
    access: {
      getAccess: () =>
        Promise.resolve({ status: "pending" as const, activatedAt: null, suspendedAt: null }),
      redeemInvite: () => Promise.reject(new Error("invite redemption must not run")),
    },
  });

  assertEquals(test.sent.length, 1);
  assertEquals(test.sent[0]?.text.includes("invite-only"), true);
  assertEquals(test.searchCalls(), []);
});

Deno.test("a valid start invite activates the user and opens onboarding", async () => {
  const test = harness();
  let redeemed = "";

  await handleCommand(command("start", "ntn_example1"), {
    ...test.deps,
    access: {
      getAccess: () =>
        Promise.resolve({ status: "pending" as const, activatedAt: null, suspendedAt: null }),
      redeemInvite: (_userId: string, code: string) => {
        redeemed = code;
        return Promise.resolve("activated" as const);
      },
    },
  });

  assertEquals(redeemed, "ntn_example1");
  assertEquals(test.sent[0]?.text.includes("Invite accepted"), true);
  assertEquals(test.sent[1]?.text.includes("Welcome to Notinn"), true);
});

Deno.test("suspended closed-alpha user cannot run a library command", async () => {
  const test = harness();

  await handleCommand(command("search", "quarterly"), {
    ...test.deps,
    access: {
      getAccess: () =>
        Promise.resolve({ status: "suspended" as const, activatedAt: null, suspendedAt: null }),
      redeemInvite: () => Promise.reject(new Error("invite redemption must not run")),
    },
  });

  assertEquals(test.searchCalls(), []);
  assertEquals(test.sent[0]?.text.includes("Access paused"), true);
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
      "🔎 Search results",
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
    "🔎 No results\n\nI could not find that in your saved notes. Try fewer or different keywords.",
  );
  assertEquals(test.sent[0]?.options === undefined, false);
});

Deno.test("ask lazily indexes saved notes, answers from matches, and cites an openable source", async () => {
  const sent: { text: string; options: unknown }[] = [];
  const calls: string[] = [];
  const embedding = Array.from({ length: 768 }, () => 0.01);

  await handleCommand(command("ask", "When is the launch?"), {
    users: { ensureUser: () => Promise.resolve(USER_ID) },
    notes: {
      listRecentSavedNotes: () => Promise.resolve([]),
      searchSavedNotes: () => Promise.resolve([]),
      listSavedNotesForEmbedding: () =>
        Promise.resolve([{
          noteId: NOTE_ID,
          outputId: "33333333-3333-4333-8333-333333333333",
          title: "Launch plan",
          contentJson: { summary: "Launch is Friday." },
          contentSha256: "a".repeat(64),
        }]),
      upsertNoteEmbedding: () => {
        calls.push("upsert");
        return Promise.resolve(true);
      },
      matchSavedNoteEmbeddings: () =>
        Promise.resolve([{
          noteId: NOTE_ID,
          title: "Launch plan",
          contentJson: { summary: "Launch is Friday." },
          updatedAt: "2026-09-18T10:00:00Z",
          similarity: 0.91,
        }]),
    },
    embeddings: {
      model: "gemini-embedding-001",
      embedDocuments: () => {
        calls.push("embed_documents");
        return Promise.resolve({
          vectors: [embedding],
          provider: "gemini",
          model: "gemini-embedding-001",
        });
      },
      embedQuestion: () => {
        calls.push("embed_question");
        return Promise.resolve({
          vectors: [embedding],
          provider: "gemini",
          model: "gemini-embedding-001",
        });
      },
    },
    answers: {
      answerFromEvidence: () =>
        Promise.resolve({
          answer: "The launch is Friday [1].",
          citationIndexes: [1],
          sufficient: true,
          provider: "gemini",
          model: "gemini-synthetic-flash",
          providerRequestId: "request-answer",
          inputTokens: 20,
          outputTokens: 10,
        }),
    },
    usage: {
      recordEmbedding: () => Promise.resolve(),
      recordGeneration: () => Promise.resolve(),
    },
    quota: {
      reserve: () =>
        Promise.resolve({
          reservationId: "44444444-4444-4444-8444-444444444444",
          outcome: "reserved" as const,
        }),
      consume: () => Promise.resolve(),
      release: () => Promise.resolve(),
      getSummary: () => Promise.resolve([]),
    },
    telegram: {
      sendMessage: (_chatId, text, options) => {
        sent.push({ text, options });
        return Promise.resolve({ messageId: 1 });
      },
    },
  });

  assertEquals(calls, ["embed_documents", "upsert", "embed_question"]);
  assertEquals(sent[0]?.text.includes("The launch is Friday"), true);
  assertEquals(sent[0]?.text.includes("[1] Launch plan"), true);
  const options = sent[0]?.options as {
    inlineKeyboard: { inline_keyboard: { callback_data: string }[][] };
  };
  assertEquals(
    options.inlineKeyboard.inline_keyboard[0]?.[0]?.callback_data.includes(NOTE_ID),
    false,
  );
});

Deno.test("ask remains safely unavailable until the embedding model is configured", async () => {
  const sent: string[] = [];
  const test = harness();
  await handleCommand(command("ask", "What changed?"), {
    ...test.deps,
    telegram: {
      sendMessage: (_chatId, text) => {
        sent.push(text);
        return Promise.resolve({ messageId: 1 });
      },
    },
  });
  assertEquals(sent[0]?.includes("not enabled"), true);
});

Deno.test("ask stops before every provider when the monthly quota is exhausted", async () => {
  const test = harness();
  let providerCalls = 0;
  await handleCommand(command("ask", "What changed?"), {
    ...test.deps,
    embeddings: {
      model: "gemini-embedding-001",
      embedDocuments: () => {
        providerCalls += 1;
        return Promise.resolve({ vectors: [], provider: "gemini", model: "unused" });
      },
      embedQuestion: () => {
        providerCalls += 1;
        return Promise.resolve({ vectors: [], provider: "gemini", model: "unused" });
      },
    },
    answers: {
      answerFromEvidence: () => {
        providerCalls += 1;
        throw new Error("answer provider must not run");
      },
    },
    usage: {
      recordEmbedding: () => Promise.resolve(),
      recordGeneration: () => Promise.resolve(),
    },
    quota: {
      reserve: () => Promise.reject(AppError.quotaExceeded("synthetic")),
      consume: () => Promise.resolve(),
      release: () => Promise.resolve(),
      getSummary: () => Promise.resolve([]),
    },
  });

  assertEquals(providerCalls, 0);
  assertEquals(test.sent[0]?.text, "You've reached your plan's limit for this month.");
});

Deno.test("usage shows the active plan and each monthly allowance", async () => {
  const test = harness();
  await handleCommand(command("usage", null), {
    ...test.deps,
    quota: {
      reserve: () => Promise.reject(new Error("reserve must not run")),
      consume: () => Promise.reject(new Error("consume must not run")),
      release: () => Promise.reject(new Error("release must not run")),
      getSummary: () =>
        Promise.resolve([
          {
            planKey: "free",
            planName: "Free",
            metric: "note_generation" as const,
            monthlyLimit: 50,
            usedUnits: 7,
            reservedUnits: 1,
            remainingUnits: 22,
            periodStart: "2026-09-01",
            periodEnd: "2026-10-01",
            dailyLimit: 50,
            dailyUsedUnits: 2,
            dailyReservedUnits: 0,
            dailyRemainingUnits: 48,
            usageDate: "2026-09-21",
          },
          {
            planKey: "free",
            planName: "Free",
            metric: "regeneration" as const,
            monthlyLimit: 50,
            usedUnits: 2,
            reservedUnits: 0,
            remainingUnits: 8,
            periodStart: "2026-09-01",
            periodEnd: "2026-10-01",
            dailyLimit: 50,
            dailyUsedUnits: 4,
            dailyReservedUnits: 1,
            dailyRemainingUnits: 45,
            usageDate: "2026-09-21",
          },
          {
            planKey: "free",
            planName: "Free",
            metric: "semantic_answer" as const,
            monthlyLimit: 50,
            usedUnits: 3,
            reservedUnits: 0,
            remainingUnits: 7,
            periodStart: "2026-09-01",
            periodEnd: "2026-10-01",
            dailyLimit: 50,
            dailyUsedUnits: 3,
            dailyReservedUnits: 0,
            dailyRemainingUnits: 47,
            usageDate: "2026-09-21",
          },
        ]),
    },
  });

  assertEquals(test.sent[0]?.text.includes("Plan: Free"), true);
  assertEquals(test.sent[0]?.text.includes("Today: 2 / 50"), true);
  assertEquals(test.sent[0]?.text.includes("This month: 7 (+1 processing) / 50"), true);
  assertEquals(test.sent[0]?.text.includes("Today: 4 (+1 processing) / 50"), true);
  assertEquals(test.sent[0]?.text.includes("This month: 3 / 50"), true);
});

Deno.test("settings displays the current preference snapshot", async () => {
  const test = harness();
  const sent: string[] = [];

  await handleCommand(command("settings", null), {
    ...test.deps,
    preferences: {
      get: () =>
        Promise.resolve({
          outputLanguage: "id" as const,
          defaultTextTemplate: "clean_note" as const,
          defaultVoiceTemplate: null,
          defaultDocumentTemplate: "detailed_summary" as const,
          privacyMode: "balanced" as const,
        }),
      update: () => Promise.reject(new Error("update must not run")),
    },
    templates: {
      listLabels: () =>
        Promise.resolve(
          new Map([
            ["clean_note", "Clean Note"],
            ["detailed_summary", "Detailed Summary"],
          ]),
        ),
    },
    telegram: {
      sendMessage: (_chatId, text) => {
        sent.push(text);
        return Promise.resolve({ messageId: 1 });
      },
    },
  });

  assertEquals(sent[0]?.includes("Output language: Indonesian"), true);
  assertEquals(sent[0]?.includes("Privacy mode: Balanced"), true);
  assertEquals(sent[0]?.includes("Voice format: Automatic"), true);
});

Deno.test("start opens a compact onboarding menu", async () => {
  const test = harness();

  await handleCommand(command("start", null), test.deps);

  assertEquals(test.ensured(), 1);
  assertEquals(test.sent[0]?.text.startsWith("👋 Welcome to Notinn"), true);
  const options = test.sent[0]?.options as {
    inlineKeyboard: { inline_keyboard: { text: string; callback_data: string }[][] };
  };
  assertEquals(options.inlineKeyboard.inline_keyboard[0]?.map((button) => button.text), [
    "📝 New note",
    "📚 My notes",
  ]);
  assertEquals(
    options.inlineKeyboard.inline_keyboard.flat().every((button) =>
      button.callback_data.startsWith("v2:")
    ),
    true,
  );
});

Deno.test("settings validates and saves a future-job privacy preference", async () => {
  const test = harness();
  const updates: unknown[] = [];
  const sent: string[] = [];

  await handleCommand(command("settings", "privacy minimal"), {
    ...test.deps,
    preferences: {
      get: () => Promise.reject(new Error("get must not run")),
      update: (userId, setting, value) => {
        updates.push({ userId, setting, value });
        return Promise.resolve({
          outputLanguage: "mirror" as const,
          defaultTextTemplate: null,
          defaultVoiceTemplate: null,
          defaultDocumentTemplate: null,
          privacyMode: "minimal" as const,
        });
      },
    },
    templates: { listLabels: () => Promise.resolve(new Map()) },
    telegram: {
      sendMessage: (_chatId, text) => {
        sent.push(text);
        return Promise.resolve({ messageId: 1 });
      },
    },
  });

  assertEquals(updates, [{ userId: USER_ID, setting: "privacy", value: "minimal" }]);
  assertEquals(sent[0]?.includes("Setting saved."), true);
  assertEquals(sent[0]?.includes("Privacy: minimal"), true);
});

Deno.test("settings accepts an applicable owned custom template", async () => {
  const test = harness();
  const updates: unknown[] = [];

  await handleCommand(command("settings", "text ct_0123456789ab"), {
    ...test.deps,
    preferences: {
      get: () => Promise.reject(new Error("get must not run")),
      update: (userId, setting, value) => {
        updates.push({ userId, setting, value });
        return Promise.resolve({
          outputLanguage: "mirror" as const,
          defaultTextTemplate: "ct_0123456789ab",
          defaultVoiceTemplate: null,
          defaultDocumentTemplate: null,
          privacyMode: "balanced" as const,
        });
      },
    },
    templates: {
      listLabels: (_userId, inputType) =>
        Promise.resolve(
          inputType === "text" || inputType === null
            ? new Map([["ct_0123456789ab", "Client Brief"]])
            : new Map(),
        ),
    },
  });

  assertEquals(updates, [{
    userId: USER_ID,
    setting: "text_template",
    value: "ct_0123456789ab",
  }]);
});

Deno.test("template create expands input groups and reports the generated key", async () => {
  const test = harness();
  const creates: unknown[] = [];
  const sent: string[] = [];

  await handleCommand(
    command(
      "template",
      "create Client Brief | text,document | Emphasize decisions and next actions.",
    ),
    {
      ...test.deps,
      templates: {
        listLabels: () => Promise.resolve(new Map()),
        listAvailable: () => Promise.resolve([]),
        archiveCustom: () => Promise.resolve("not_found" as const),
        createCustom: (userId, name, instruction, inputTypes) => {
          creates.push({ userId, name, instruction, inputTypes });
          return Promise.resolve({
            key: "ct_0123456789ab",
            name,
            isCustom: true,
            applicableInputTypes: inputTypes,
          });
        },
      },
      telegram: {
        sendMessage: (_chatId, text) => {
          sent.push(text);
          return Promise.resolve({ messageId: 1 });
        },
      },
    },
  );

  assertEquals(creates, [{
    userId: USER_ID,
    name: "Client Brief",
    instruction: "Emphasize decisions and next actions.",
    inputTypes: ["text", "image", "pdf", "docx", "txt", "md"],
  }]);
  assertEquals(sent[0]?.includes("ct_0123456789ab"), true);
});

Deno.test("template archive explains a pending-job refusal", async () => {
  const test = harness();
  const sent: string[] = [];

  await handleCommand(command("template", "archive ct_0123456789ab"), {
    ...test.deps,
    templates: {
      listLabels: () => Promise.resolve(new Map()),
      listAvailable: () => Promise.resolve([]),
      createCustom: () => Promise.reject(new Error("create must not run")),
      archiveCustom: () => Promise.resolve("in_use" as const),
    },
    telegram: {
      sendMessage: (_chatId, text) => {
        sent.push(text);
        return Promise.resolve({ messageId: 1 });
      },
    },
  });

  assertEquals(sent[0]?.includes("pending note"), true);
});

Deno.test("privacy and terms remain available before alpha activation", async () => {
  for (const name of ["privacy", "terms"] as const) {
    const test = harness();
    await handleCommand(command(name, null), {
      ...test.deps,
      access: {
        getAccess: () =>
          Promise.resolve({ status: "pending" as const, activatedAt: null, suspendedAt: null }),
        redeemInvite: () => Promise.reject(new Error("invite redemption must not run")),
      },
    });
    assertEquals(test.sent.length, 1);
    assertEquals(
      test.sent[0]?.text.includes(name === "privacy" ? "Notinn Privacy" : "Terms"),
      true,
    );
    assertEquals(test.sent[0]?.text.includes("invite-only"), false);
  }
});

Deno.test("account deletion requires exact confirmation before scheduling", async () => {
  const test = harness();
  let requests = 0;
  const lifecycle = {
    get: () =>
      Promise.resolve({
        status: "active" as const,
        deletionRequestedAt: null,
        deletionScheduledAt: null,
        deletedAt: null,
      }),
    requestDeletion: () => {
      requests += 1;
      return Promise.resolve({ outcome: "scheduled" as const, deletionScheduledAt: null });
    },
    cancelDeletion: () => Promise.resolve("not_pending" as const),
  };

  await handleCommand(command("delete_account", null), { ...test.deps, lifecycle });
  assertEquals(requests, 0);
  assertEquals(test.sent[0]?.text.includes("/delete_account confirm"), true);

  await handleCommand(command("delete_account", "confirm"), { ...test.deps, lifecycle });
  assertEquals(requests, 1);
  assertEquals(test.sent[1]?.text.includes("Account deletion pending"), true);
});

Deno.test("pending deletion blocks features but can still be cancelled", async () => {
  const test = harness();
  let cancellations = 0;
  const lifecycle = {
    get: () =>
      Promise.resolve({
        status: "deletion_pending" as const,
        deletionRequestedAt: "2026-09-21T12:00:00Z",
        deletionScheduledAt: "2026-09-28T12:00:00Z",
        deletedAt: null,
      }),
    requestDeletion: () =>
      Promise.resolve({
        outcome: "already_pending" as const,
        deletionScheduledAt: "2026-09-28T12:00:00Z",
      }),
    cancelDeletion: () => {
      cancellations += 1;
      return Promise.resolve("cancelled" as const);
    },
  };

  await handleCommand(command("search", "quarterly"), { ...test.deps, lifecycle });
  assertEquals(test.searchCalls(), []);
  assertEquals(test.sent[0]?.text.includes("2026-09-28T12:00:00.000Z"), true);

  await handleCommand(command("cancel_deletion", null), { ...test.deps, lifecycle });
  assertEquals(cancellations, 1);
  assertEquals(test.sent[1]?.text.includes("deletion cancelled"), true);
});
