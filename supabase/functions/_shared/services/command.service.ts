import { encodeCallbackPayload } from "../schemas/callback.ts";
import type { IngestionRepository } from "../repositories/ingestion.repository.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import {
  OUTPUT_LANGUAGES,
  type PreferenceSetting,
  type UserPreferences,
  type UserPreferencesRepository,
} from "../repositories/user-preferences.repository.ts";
import { SYSTEM_TEMPLATE_KEYS } from "../config/constants.ts";
import type { EmbeddingProvider, LibraryAnswerProvider } from "../providers/library-ai.provider.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import type { CommandMessage } from "../telegram/parse-update.ts";

const RECENT_LIMIT = 10;
const SEARCH_LIMIT = 10;
const SEARCH_QUERY_MAX_CHARS = 200;
const ASK_QUERY_MAX_CHARS = 500;
const EMBEDDING_BATCH_LIMIT = 20;
const SEMANTIC_MATCH_LIMIT = 5;
const MIN_SEMANTIC_SIMILARITY = 0.35;

export interface CommandDependencies {
  readonly users: Pick<IngestionRepository, "ensureUser">;
  readonly notes: Pick<
    NotesRepository,
    | "listRecentSavedNotes"
    | "searchSavedNotes"
    | "listSavedNotesForEmbedding"
    | "upsertNoteEmbedding"
    | "matchSavedNoteEmbeddings"
  >;
  readonly telegram: Pick<TelegramGateway, "sendMessage">;
  readonly embeddings?: EmbeddingProvider;
  readonly answers?: LibraryAnswerProvider;
  readonly usage?: Pick<UsageRepository, "recordGeneration" | "recordEmbedding">;
  readonly preferences?: Pick<UserPreferencesRepository, "get" | "update">;
  readonly templates?: Pick<TemplatesRepository, "listSystemLabels">;
}

const SETTINGS_HELP = [
  "Settings commands:",
  "/settings — show current settings",
  "/settings language mirror|id|en",
  "/settings privacy balanced|minimal",
  "/settings text default|<template_key>",
  "/settings voice default|<template_key>",
  "/settings document default|<template_key>",
].join("\n");

function templateLabel(
  key: string | null,
  labels: ReadonlyMap<string, string>,
): string {
  if (key === null) return "Automatic default";
  return `${labels.get(key) ?? key} (${key})`;
}

function renderSettings(
  preferences: UserPreferences,
  labels: ReadonlyMap<string, string>,
): string {
  return [
    "Your Notinn settings:",
    "",
    `Language: ${preferences.outputLanguage}`,
    `Privacy: ${preferences.privacyMode}`,
    `Text template: ${templateLabel(preferences.defaultTextTemplate, labels)}`,
    `Voice template: ${templateLabel(preferences.defaultVoiceTemplate, labels)}`,
    `Document template: ${templateLabel(preferences.defaultDocumentTemplate, labels)}`,
    "",
    "These settings apply only to notes you send after the change.",
    "Use /settings help to see update commands.",
  ].join("\n");
}

async function handleSettings(
  command: CommandMessage,
  userId: string,
  deps: CommandDependencies,
): Promise<void> {
  if (deps.preferences === undefined || deps.templates === undefined) {
    await deps.telegram.sendMessage(command.telegramChatId, "Settings are not enabled yet.");
    return;
  }

  const labels = await deps.templates.listSystemLabels();
  const raw = command.argumentsText?.trim() ?? "";
  if (raw === "" || raw === "show") {
    const preferences = await deps.preferences.get(userId);
    await deps.telegram.sendMessage(command.telegramChatId, renderSettings(preferences, labels));
    return;
  }
  if (raw === "help") {
    const available = SYSTEM_TEMPLATE_KEYS.map((key) => `- ${key}: ${labels.get(key) ?? key}`);
    await deps.telegram.sendMessage(
      command.telegramChatId,
      [SETTINGS_HELP, "", "Available templates:", ...available].join("\n"),
    );
    return;
  }

  const [category, value, ...extra] = raw.toLowerCase().split(/\s+/);
  if (category === undefined || value === undefined || extra.length > 0) {
    await deps.telegram.sendMessage(command.telegramChatId, SETTINGS_HELP);
    return;
  }

  let setting: PreferenceSetting;
  let valid = false;
  if (category === "language") {
    setting = "language";
    valid = (OUTPUT_LANGUAGES as readonly string[]).includes(value);
  } else if (category === "privacy") {
    setting = "privacy";
    valid = value === "balanced" || value === "minimal";
  } else if (category === "text" || category === "voice" || category === "document") {
    setting = `${category}_template` as PreferenceSetting;
    valid = value === "default" || (SYSTEM_TEMPLATE_KEYS as readonly string[]).includes(value);
  } else {
    await deps.telegram.sendMessage(command.telegramChatId, SETTINGS_HELP);
    return;
  }

  if (!valid) {
    await deps.telegram.sendMessage(command.telegramChatId, SETTINGS_HELP);
    return;
  }

  const preferences = await deps.preferences.update(userId, setting, value);
  await deps.telegram.sendMessage(
    command.telegramChatId,
    ["Setting saved.", "", renderSettings(preferences, labels)].join("\n"),
  );
}

function embeddingText(title: string, contentJson: unknown): string {
  const serialized = JSON.stringify(contentJson);
  const content = typeof serialized === "string" ? serialized : "";
  // 24k characters stays comfortably under the embedding model's 8,192-token
  // input ceiling for normal prose while bounding provider payload size.
  return `${title}\n${content}`.slice(0, 24_000);
}

async function handleAsk(
  command: CommandMessage,
  userId: string,
  question: string,
  deps: CommandDependencies,
): Promise<void> {
  if (deps.embeddings === undefined || deps.answers === undefined || deps.usage === undefined) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "Semantic answers are not enabled yet. You can still use /search with keywords.",
    );
    return;
  }

  const embeddingModel = deps.embeddings.model;
  const pending = await deps.notes.listSavedNotesForEmbedding(
    userId,
    embeddingModel,
    EMBEDDING_BATCH_LIMIT,
  );
  if (pending.length > 0) {
    const indexed = await deps.embeddings.embedDocuments(
      pending.map((note) => ({
        title: note.title,
        text: embeddingText(note.title, note.contentJson),
      })),
    );
    await deps.usage.recordEmbedding({
      userId,
      provider: indexed.provider,
      model: indexed.model,
    });
    for (let index = 0; index < pending.length; index += 1) {
      const note = pending[index];
      const vector = indexed.vectors[index];
      if (note === undefined || vector === undefined) continue;
      await deps.notes.upsertNoteEmbedding({
        userId,
        noteId: note.noteId,
        outputId: note.outputId,
        embeddingModel: indexed.model,
        contentSha256: note.contentSha256,
        embedding: vector,
      });
    }
  }

  const query = await deps.embeddings.embedQuestion(question);
  const queryVector = query.vectors[0];
  if (queryVector === undefined) return;
  await deps.usage.recordEmbedding({
    userId,
    provider: query.provider,
    model: query.model,
  });
  const matches = await deps.notes.matchSavedNoteEmbeddings(
    userId,
    query.model,
    queryVector,
    SEMANTIC_MATCH_LIMIT,
    MIN_SEMANTIC_SIMILARITY,
  );
  if (matches.length === 0) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "I could not find enough evidence in your saved notes to answer that.",
    );
    return;
  }

  const answer = await deps.answers.answerFromEvidence(
    question,
    matches.map((note, index) => ({
      index: index + 1,
      title: note.title,
      updatedAt: note.updatedAt,
      content: embeddingText(note.title, note.contentJson),
    })),
  );
  await deps.usage.recordGeneration({
    userId,
    jobId: null,
    provider: answer.provider,
    model: answer.model,
    inputTokens: answer.inputTokens,
    outputTokens: answer.outputTokens,
    providerRequestId: answer.providerRequestId,
  });
  if (!answer.sufficient) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "I could not find enough evidence in your saved notes to answer that.",
    );
    return;
  }

  const cited = answer.citationIndexes
    .map((index) => ({ index, note: matches[index - 1] }))
    .filter((item): item is { index: number; note: NonNullable<typeof item.note> } =>
      item.note !== undefined
    );
  const sources = cited.map((item) => `[${item.index}] ${item.note.title}`);
  await deps.telegram.sendMessage(
    command.telegramChatId,
    [answer.answer.slice(0, 3_000), "", "Sources:", ...sources].join("\n"),
    cited.length === 0 ? undefined : {
      inlineKeyboard: {
        inline_keyboard: cited.map((item) => [{
          text: `Open source ${item.index}`,
          callback_data: encodeCallbackPayload({
            action: { kind: "show" },
            resourceId: item.note.noteId,
            revision: 0,
          }),
        }]),
      },
    },
  );
}

export async function handleCommand(
  command: CommandMessage,
  deps: CommandDependencies,
): Promise<void> {
  if (
    command.command !== "recent" && command.command !== "search" && command.command !== "ask" &&
    command.command !== "settings"
  ) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "Send me content to create a note, or use /recent, /search, /ask, or /settings.",
    );
    return;
  }

  const userId = await deps.users.ensureUser(command);
  if (command.command === "settings") {
    await handleSettings(command, userId, deps);
    return;
  }
  if (command.command === "ask") {
    const question = command.argumentsText;
    if (question === null || question.length < 2 || question.length > ASK_QUERY_MAX_CHARS) {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        "Use /ask followed by a 2–500 character question about your saved notes.",
      );
      return;
    }
    await handleAsk(command, userId, question, deps);
    return;
  }
  if (command.command === "search") {
    const query = command.argumentsText;
    if (query === null || query.length < 2 || query.length > SEARCH_QUERY_MAX_CHARS) {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        "Use /search followed by 2–200 characters, for example: /search quarterly risk.",
      );
      return;
    }

    const matches = await deps.notes.searchSavedNotes(userId, query, SEARCH_LIMIT);
    if (matches.length === 0) {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        "I could not find that in your saved notes. Try fewer or different keywords.",
      );
      return;
    }

    const lines = matches.map((note, index) => {
      const date = note.updatedAt.slice(0, 10);
      const tags = note.tags.slice(0, 3).map((tag) => `#${tag}`).join(" ");
      return `${index + 1}. ${note.title} — ${date}${tags === "" ? "" : `\n   ${tags}`}`;
    });
    await deps.telegram.sendMessage(
      command.telegramChatId,
      ["Search results:", "", ...lines].join("\n"),
      {
        inlineKeyboard: {
          inline_keyboard: matches.map((note, index) => [{
            text: `Open ${index + 1}`,
            callback_data: encodeCallbackPayload({
              action: { kind: "show" },
              resourceId: note.noteId,
              revision: 0,
            }),
          }]),
        },
      },
    );
    return;
  }

  const notes = await deps.notes.listRecentSavedNotes(userId, RECENT_LIMIT);

  if (notes.length === 0) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "You do not have any saved notes yet. Tap Save below a generated note first.",
    );
    return;
  }

  const lines = notes.map((note, index) => `${index + 1}. ${note.title}`);
  await deps.telegram.sendMessage(
    command.telegramChatId,
    ["Your recent saved notes:", "", ...lines].join("\n"),
    {
      inlineKeyboard: {
        inline_keyboard: notes.map((note, index) => [{
          text: `Open ${index + 1}`,
          callback_data: encodeCallbackPayload({
            action: { kind: "show" },
            resourceId: note.noteId,
            revision: 0,
          }),
        }]),
      },
    },
  );
}
