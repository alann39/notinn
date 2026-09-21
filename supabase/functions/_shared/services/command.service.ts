import { encodeCallbackPayload } from "../schemas/callback.ts";
import { encodeNavigationCallback } from "../schemas/navigation-callback.ts";
import type { IngestionRepository } from "../repositories/ingestion.repository.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { QuotaRepository } from "../repositories/quota.repository.ts";
import type {
  ClosedAlphaAccessStatus,
  ClosedAlphaRepository,
  InviteRedemptionOutcome,
} from "../repositories/closed-alpha.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import {
  OUTPUT_LANGUAGES,
  type PreferenceSetting,
  type UserPreferences,
  type UserPreferencesRepository,
} from "../repositories/user-preferences.repository.ts";
import {
  type InputType,
  MAX_CUSTOM_TEMPLATE_INSTRUCTION_CHARS,
  MAX_CUSTOM_TEMPLATE_NAME_CHARS,
  TEMPLATE_KEY_PATTERN,
} from "../config/constants.ts";
import type { EmbeddingProvider, LibraryAnswerProvider } from "../providers/library-ai.provider.ts";
import { AppError, isAppError } from "../errors/app-error.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import type { CommandMessage } from "../telegram/parse-update.ts";
import { sendNavigationCommand } from "./navigation.service.ts";

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
  readonly quota?: Pick<QuotaRepository, "reserve" | "consume" | "release" | "getSummary">;
  readonly access?: Pick<ClosedAlphaRepository, "getAccess" | "redeemInvite">;
  readonly preferences?: Pick<UserPreferencesRepository, "get" | "update">;
  readonly templates?:
    & Pick<TemplatesRepository, "listLabels">
    & Partial<Pick<TemplatesRepository, "listAvailable" | "createCustom" | "archiveCustom">>;
}

const CLOSED_ALPHA_PENDING = [
  "🔐 Notinn Closed Alpha",
  "",
  "Access is currently invite-only.",
  "Open your invitation link, or send /start followed by your invite code.",
].join("\n");

const CLOSED_ALPHA_SUSPENDED = [
  "⏸️ Access paused",
  "",
  "Your Closed Alpha access is currently suspended.",
  "Contact the Notinn team if you believe this is a mistake.",
].join("\n");

export function closedAlphaAccessMessage(status: ClosedAlphaAccessStatus | null): string {
  return status === "suspended" ? CLOSED_ALPHA_SUSPENDED : CLOSED_ALPHA_PENDING;
}

function inviteOutcomeMessage(outcome: InviteRedemptionOutcome): string {
  if (outcome === "expired") return "That invite has expired. Ask for a new invitation.";
  if (outcome === "exhausted") return "That invite has reached its activation limit.";
  if (outcome === "suspended") return CLOSED_ALPHA_SUSPENDED;
  if (outcome === "user_not_active") return "This account cannot be activated right now.";
  return "That invite code is not valid. Check the invitation link and try again.";
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

const TEMPLATE_HELP = [
  "Template commands:",
  "/templates — list available templates",
  "/template create Name | text,voice,document | Instructions",
  "/template archive <template_key>",
  "You can keep up to 5 active custom templates.",
].join("\n");

const INPUT_TYPES_BY_GROUP: Readonly<Record<string, readonly InputType[]>> = {
  text: ["text"],
  voice: ["voice", "audio"],
  document: ["image", "pdf", "docx", "txt", "md"],
};

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

  const labels = await deps.templates.listLabels(userId);
  const raw = command.argumentsText?.trim() ?? "";
  if (raw === "" || raw === "show") {
    const preferences = await deps.preferences.get(userId);
    await deps.telegram.sendMessage(command.telegramChatId, renderSettings(preferences, labels));
    return;
  }
  if (raw === "help") {
    const available = [...labels].map(([key, name]) => `- ${key}: ${name}`);
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
    const representativeInput: InputType = category === "text"
      ? "text"
      : category === "voice"
      ? "voice"
      : "pdf";
    const applicableLabels = await deps.templates.listLabels(userId, representativeInput);
    valid = value === "default" || applicableLabels.has(value);
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

function inputGroupLabels(inputTypes: readonly InputType[]): string {
  const groups = Object.entries(INPUT_TYPES_BY_GROUP)
    .filter(([, types]) => types.some((type) => inputTypes.includes(type)))
    .map(([group]) => group);
  return groups.join(",");
}

async function handleTemplates(
  command: CommandMessage,
  userId: string,
  deps: CommandDependencies,
): Promise<void> {
  if (
    deps.templates?.listAvailable === undefined ||
    deps.templates.createCustom === undefined ||
    deps.templates.archiveCustom === undefined
  ) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "Custom templates are not enabled yet.",
    );
    return;
  }

  const raw = command.argumentsText?.trim() ?? "";
  if (command.command === "templates" || raw === "" || raw === "list") {
    const templates = await deps.templates.listAvailable(userId);
    const system = templates.filter((template) => !template.isCustom);
    const custom = templates.filter((template) => template.isCustom);
    const line = (template: (typeof templates)[number]) =>
      `- ${template.name} (${template.key}) — ${inputGroupLabels(template.applicableInputTypes)}`;
    await deps.telegram.sendMessage(
      command.telegramChatId,
      [
        "Available templates:",
        "",
        "Built-in:",
        ...system.map(line),
        "",
        `Custom (${custom.length}/5):`,
        ...(custom.length === 0 ? ["- None yet"] : custom.map(line)),
        "",
        "Use /template help to create or archive one.",
      ].join("\n"),
    );
    return;
  }
  if (raw === "help") {
    await deps.telegram.sendMessage(command.telegramChatId, TEMPLATE_HELP);
    return;
  }
  if (raw.toLowerCase().startsWith("create ")) {
    const parts = raw.slice(7).split("|").map((part) => part.trim());
    if (parts.length !== 3) {
      await deps.telegram.sendMessage(command.telegramChatId, TEMPLATE_HELP);
      return;
    }
    const [name = "", groupsText = "", instruction = ""] = parts;
    const groups = [...new Set(groupsText.toLowerCase().split(",").map((group) => group.trim()))];
    if (
      name.length === 0 || name.length > MAX_CUSTOM_TEMPLATE_NAME_CHARS ||
      instruction.length === 0 || instruction.length > MAX_CUSTOM_TEMPLATE_INSTRUCTION_CHARS ||
      groups.length === 0 || groups.some((group) => !(group in INPUT_TYPES_BY_GROUP))
    ) {
      await deps.telegram.sendMessage(command.telegramChatId, TEMPLATE_HELP);
      return;
    }
    const active = await deps.templates.listAvailable(userId);
    if (active.filter((template) => template.isCustom).length >= 5) {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        "You already have 5 active custom templates. Archive one before creating another.",
      );
      return;
    }
    const inputTypes = [...new Set(groups.flatMap((group) => INPUT_TYPES_BY_GROUP[group] ?? []))];
    const created = await deps.templates.createCustom(userId, name, instruction, inputTypes);
    await deps.telegram.sendMessage(
      command.telegramChatId,
      [
        "Custom template created.",
        `${created.name} (${created.key})`,
        `For: ${inputGroupLabels(created.applicableInputTypes)}`,
        "",
        `Set it as a default with /settings text|voice|document ${created.key}`,
      ].join("\n"),
    );
    return;
  }
  if (raw.toLowerCase().startsWith("archive ")) {
    const key = raw.slice(8).trim().toLowerCase();
    if (!TEMPLATE_KEY_PATTERN.test(key)) {
      await deps.telegram.sendMessage(command.telegramChatId, TEMPLATE_HELP);
      return;
    }
    const outcome = await deps.templates.archiveCustom(userId, key);
    const message = outcome === "archived"
      ? "Custom template archived. Any default that used it was reset to automatic."
      : outcome === "in_use"
      ? "That template is still being used by a pending note. Try archiving it after the note finishes."
      : "I could not find that active custom template.";
    await deps.telegram.sendMessage(command.telegramChatId, message);
    return;
  }
  await deps.telegram.sendMessage(command.telegramChatId, TEMPLATE_HELP);
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
  if (
    deps.embeddings === undefined || deps.answers === undefined || deps.usage === undefined ||
    deps.quota === undefined
  ) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "Semantic answers are not enabled yet. You can still use /search with keywords.",
    );
    return;
  }

  let reservation;
  try {
    reservation = await deps.quota.reserve({
      userId,
      metric: "semantic_answer",
      reservationKey: `command:${command.updateId}:semantic_answer`,
    });
    if (reservation.outcome === "existing_reserved") {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        AppError.rateLimited("duplicate semantic answer reservation").publicMessage,
      );
      return;
    }
  } catch (thrown) {
    if (isAppError(thrown) && thrown.code === "quota_exceeded") {
      await deps.telegram.sendMessage(command.telegramChatId, thrown.publicMessage);
      return;
    }
    throw thrown;
  }

  let providerStarted = false;
  try {
    const embeddingModel = deps.embeddings.model;
    const pending = await deps.notes.listSavedNotesForEmbedding(
      userId,
      embeddingModel,
      EMBEDDING_BATCH_LIMIT,
    );
    if (pending.length > 0) {
      providerStarted = true;
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

    providerStarted = true;
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
        {
          inlineKeyboard: {
            inline_keyboard: [[
              {
                text: "💬 Ask another question",
                callback_data: encodeNavigationCallback({ action: "ask", value: null }),
              },
            ], [
              {
                text: "📚 Recent notes",
                callback_data: encodeNavigationCallback({ action: "recent", value: null }),
              },
            ]],
          },
        },
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
        {
          inlineKeyboard: {
            inline_keyboard: [[{
              text: "💬 Ask another question",
              callback_data: encodeNavigationCallback({ action: "ask", value: null }),
            }], [{
              text: "🏠 Main menu",
              callback_data: encodeNavigationCallback({ action: "main", value: null }),
            }]],
          },
        },
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
          inline_keyboard: [
            ...cited.map((item) => [{
              text: `📄 Source ${item.index} · ${item.note.title.slice(0, 34)}`,
              callback_data: encodeCallbackPayload({
                action: { kind: "show" },
                resourceId: item.note.noteId,
                revision: 0,
              }),
            }]),
            [{
              text: "💬 Ask again",
              callback_data: encodeNavigationCallback({ action: "ask", value: null }),
            }, {
              text: "🏠 Main menu",
              callback_data: encodeNavigationCallback({ action: "main", value: null }),
            }],
          ],
        },
      },
    );
  } finally {
    if (providerStarted) {
      await deps.quota.consume(userId, reservation.reservationId, 1);
    } else {
      await deps.quota.release(userId, reservation.reservationId);
    }
  }
}

export async function handleCommand(
  command: CommandMessage,
  deps: CommandDependencies,
): Promise<void> {
  if (
    command.command !== "start" && command.command !== "menu" && command.command !== "new" &&
    command.command !== "help" && command.command !== "recent" &&
    command.command !== "search" && command.command !== "ask" && command.command !== "usage" &&
    command.command !== "settings" && command.command !== "template" &&
    command.command !== "templates"
  ) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "I do not recognise that command. Use /menu to see everything Notinn can do.",
    );
    return;
  }

  const userId = await deps.users.ensureUser(command);
  if (deps.access !== undefined) {
    let access = await deps.access.getAccess(userId);
    if (
      command.command === "start" && access?.status === "pending" &&
      command.argumentsText !== null
    ) {
      const outcome = await deps.access.redeemInvite(userId, command.argumentsText);
      if (outcome === "activated" || outcome === "already_active") {
        access = { status: "active", activatedAt: null, suspendedAt: null };
        if (outcome === "activated") {
          await deps.telegram.sendMessage(
            command.telegramChatId,
            "✅ Invite accepted. Welcome to the Notinn Closed Alpha.",
          );
        }
      } else {
        await deps.telegram.sendMessage(command.telegramChatId, inviteOutcomeMessage(outcome));
        return;
      }
    }
    if (access?.status !== "active") {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        closedAlphaAccessMessage(access?.status ?? null),
      );
      return;
    }
  }
  if (
    command.command === "start" || command.command === "menu" || command.command === "new" ||
    command.command === "help" || command.command === "recent" ||
    command.command === "templates" || command.command === "usage" ||
    (command.command === "settings" && command.argumentsText === null)
  ) {
    await sendNavigationCommand(command, userId, {
      notes: deps.notes,
      telegram: deps.telegram,
      preferences: deps.preferences,
      templates: deps.templates,
      quota: deps.quota,
    });
    return;
  }
  if (command.command === "template") {
    await handleTemplates(command, userId, deps);
    return;
  }
  if (command.command === "settings") {
    await handleSettings(command, userId, deps);
    return;
  }
  if (command.command === "ask") {
    const question = command.argumentsText;
    if (question === null) {
      await sendNavigationCommand(command, userId, {
        notes: deps.notes,
        telegram: deps.telegram,
        preferences: deps.preferences,
        templates: deps.templates,
      });
      return;
    }
    if (question.length < 2 || question.length > ASK_QUERY_MAX_CHARS) {
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
    if (query === null) {
      await sendNavigationCommand(command, userId, {
        notes: deps.notes,
        telegram: deps.telegram,
        preferences: deps.preferences,
        templates: deps.templates,
      });
      return;
    }
    if (query.length < 2 || query.length > SEARCH_QUERY_MAX_CHARS) {
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
        "🔎 No results\n\nI could not find that in your saved notes. Try fewer or different keywords.",
        {
          inlineKeyboard: {
            inline_keyboard: [[{
              text: "🔄 Search again",
              callback_data: encodeNavigationCallback({ action: "search", value: null }),
            }, {
              text: "📚 Recent notes",
              callback_data: encodeNavigationCallback({ action: "recent", value: null }),
            }]],
          },
        },
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
      ["🔎 Search results", "", ...lines].join("\n"),
      {
        inlineKeyboard: {
          inline_keyboard: [
            ...matches.map((note, index) => [{
              text: `${index + 1} · ${note.title.slice(0, 42)}`,
              callback_data: encodeCallbackPayload({
                action: { kind: "show" },
                resourceId: note.noteId,
                revision: 0,
              }),
            }]),
            [{
              text: "🔄 New search",
              callback_data: encodeNavigationCallback({ action: "search", value: null }),
            }, {
              text: "🏠 Main menu",
              callback_data: encodeNavigationCallback({ action: "main", value: null }),
            }],
          ],
        },
      },
    );
    return;
  }
}
