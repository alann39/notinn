import {
  type GenerationReason,
  TEMPLATE_KEY_PATTERN,
  type TemplateKey,
} from "../config/constants.ts";
import { AppError, toAppError } from "../errors/app-error.ts";
import type { Logger } from "../observability/logger.ts";
import type { NoteAIProvider } from "../providers/note-ai.provider.ts";
import type { IngestionRepository } from "../repositories/ingestion.repository.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { QuotaRepository } from "../repositories/quota.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import type { UserPreferencesRepository } from "../repositories/user-preferences.repository.ts";
import { actionToken, decodeCallbackPayload } from "../schemas/callback.ts";
import { decodeNavigationCallback, isNavigationCallback } from "../schemas/navigation-callback.ts";
import { parseStructuredNote, STRUCTURED_NOTE_VERSION } from "../schemas/structured-note.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import type { CallbackActionRequest } from "../telegram/parse-update.ts";
import {
  buildDeleteConfirmationKeyboard,
  buildEditKeyboard,
  buildExportKeyboard,
  buildFormatKeyboard,
  buildNoteKeyboard,
  renderNoteOutput,
} from "./note-rendering.ts";
import { type NoteExportFormat, renderNoteExport } from "./note-export.ts";
import { withConsumedQuota } from "./quota.service.ts";
import { handleNavigationCallback } from "./navigation.service.ts";

const NOTE_GONE = "That note is no longer available.";

export interface CallbackDependencies {
  readonly users: Pick<IngestionRepository, "ensureUser">;
  readonly notes: Pick<
    NotesRepository,
    | "findNoteForDisplay"
    | "findNoteForRegeneration"
    | "regenerateNoteOutput"
    | "setCurrentOutput"
    | "setNoteSaved"
    | "deleteNote"
    | "listRecentSavedNotes"
  >;
  readonly templates:
    & Pick<TemplatesRepository, "findForGeneration" | "listLabels">
    & Partial<Pick<TemplatesRepository, "listAvailable">>;
  readonly preferences?: Pick<UserPreferencesRepository, "get" | "update">;
  readonly usage: Pick<UsageRepository, "recordGeneration">;
  readonly quota: Pick<QuotaRepository, "reserve" | "consume" | "getSummary">;
  readonly provider: Pick<NoteAIProvider, "generateText">;
  readonly telegram: Pick<
    TelegramGateway,
    | "sendMessage"
    | "sendDocument"
    | "answerCallbackQuery"
    | "editMessageReplyMarkup"
    | "editMessageText"
  >;
  readonly logger: Logger;
}

async function exportCurrentNote(
  callback: CallbackActionRequest,
  userId: string,
  noteId: string,
  format: NoteExportFormat,
  deps: CallbackDependencies,
): Promise<boolean> {
  const display = await deps.notes.findNoteForDisplay(userId, noteId);
  if (display === null) return false;

  const note = parseStructuredNote(display.contentJson, AppError.outputValidationFailed);
  const exported = await renderNoteExport(note, format);
  try {
    await deps.telegram.sendDocument(
      callback.telegramChatId,
      exported.bytes,
      exported.filename,
      exported.mimeType,
      {
        caption: format === "markdown"
          ? "Markdown export from Notinn."
          : format === "text"
          ? "Text export from Notinn."
          : "PDF export from Notinn.",
      },
    );
  } finally {
    exported.bytes.fill(0);
  }
  return true;
}

function templateKey(value: string): TemplateKey {
  if (!TEMPLATE_KEY_PATTERN.test(value)) {
    throw AppError.internal("stored note names an invalid template");
  }
  return value;
}

async function sendCurrentNote(
  callback: CallbackActionRequest,
  userId: string,
  noteId: string,
  deps: CallbackDependencies,
): Promise<boolean> {
  const display = await deps.notes.findNoteForDisplay(userId, noteId);
  if (display === null) return false;

  const note = parseStructuredNote(display.contentJson, AppError.outputValidationFailed);
  const rendered = renderNoteOutput(note);
  const keyboard = {
    inline_keyboard: buildNoteKeyboard({
      noteId,
      isSaved: display.isSaved,
    }),
  };

  for (let index = 0; index < rendered.pages.length; index += 1) {
    const isLast = index === rendered.pages.length - 1;
    await deps.telegram.sendMessage(callback.telegramChatId, rendered.pages[index] ?? "", {
      parseMode: "HTML",
      ...(isLast ? { inlineKeyboard: keyboard } : {}),
    });
  }
  return true;
}

async function regenerate(
  callback: CallbackActionRequest,
  userId: string,
  noteId: string,
  targetTemplate: TemplateKey | null,
  reason: GenerationReason,
  deps: CallbackDependencies,
): Promise<boolean> {
  const source = await deps.notes.findNoteForRegeneration(userId, noteId);
  if (source === null) return false;
  if (source.sourceText === null) {
    await deps.telegram.sendMessage(
      callback.telegramChatId,
      "This note was created in minimal privacy mode, so its source was not retained and it cannot be reformatted.",
    );
    return true;
  }
  const sourceText = source.sourceText;

  const selectedTemplateKey = targetTemplate ?? templateKey(source.templateKey);
  const template = await deps.templates.findForGeneration(
    userId,
    selectedTemplateKey,
    source.sourceType,
  );
  const generation = await withConsumedQuota(
    deps.quota,
    {
      userId,
      metric: "regeneration",
      reservationKey: `callback:${callback.updateId}:regeneration`,
    },
    () =>
      deps.provider.generateText({
        sourceText,
        template,
        templateKey: selectedTemplateKey,
        reason,
        outputLanguage: source.language,
      }),
  );
  const rendered = renderNoteOutput(generation.note);

  await deps.usage.recordGeneration({
    userId,
    jobId: null,
    provider: generation.provider,
    model: generation.model,
    inputTokens: generation.inputTokens,
    outputTokens: generation.outputTokens,
    providerRequestId: generation.providerRequestId,
  });

  const output = await deps.notes.regenerateNoteOutput({
    userId,
    noteId,
    templateKey: selectedTemplateKey,
    schemaVersion: STRUCTURED_NOTE_VERSION,
    contentJson: generation.note,
    renderedText: rendered.html,
    provider: generation.provider,
    model: generation.model,
    generationReason: reason,
  });
  if (output.outcome !== "created" || output.outputId === null) return false;

  const display = await deps.notes.findNoteForDisplay(userId, noteId);
  if (display === null) return false;
  const keyboard = {
    inline_keyboard: buildNoteKeyboard({
      noteId,
      isSaved: display.isSaved,
    }),
  };

  for (let index = 0; index < rendered.pages.length; index += 1) {
    const isLast = index === rendered.pages.length - 1;
    await deps.telegram.sendMessage(callback.telegramChatId, rendered.pages[index] ?? "", {
      parseMode: "HTML",
      ...(isLast ? { inlineKeyboard: keyboard } : {}),
    });
  }

  const current = await deps.notes.setCurrentOutput(userId, noteId, output.outputId);
  if (current.outcome !== "updated") {
    throw AppError.internal("delivered regeneration could not become current");
  }

  return true;
}

/** Resolve ownership and execute one decoded Telegram button action. */
export async function handleCallback(
  callback: CallbackActionRequest,
  deps: CallbackDependencies,
): Promise<void> {
  if (isNavigationCallback(callback.data)) {
    let navigation;
    try {
      navigation = decodeNavigationCallback(callback.data);
    } catch {
      await deps.telegram.answerCallbackQuery(callback.callbackQueryId, {
        text: "That menu is no longer available.",
      });
      return;
    }

    await deps.telegram.answerCallbackQuery(callback.callbackQueryId);
    const userId = await deps.users.ensureUser(callback);
    const log = deps.logger.child({
      update_id: callback.updateId,
      user_id: userId,
    });
    try {
      await handleNavigationCallback(callback, navigation, userId, {
        notes: deps.notes,
        telegram: deps.telegram,
        preferences: deps.preferences,
        templates: deps.templates,
        quota: deps.quota,
      });
      log.info("callback.completed", {
        callback_action: navigation.action,
        outcome: "completed",
      });
    } catch (thrown) {
      const error = toAppError(thrown);
      log[error.logLevel]("callback.failed", {
        callback_action: navigation.action,
        error_code: error.code,
        error_detail: error.internalDetail,
      });
      await deps.telegram.sendMessage(callback.telegramChatId, error.publicMessage);
    }
    return;
  }

  let payload;
  try {
    payload = decodeCallbackPayload(callback.data);
  } catch {
    await deps.telegram.answerCallbackQuery(callback.callbackQueryId, {
      text: "That action is no longer available.",
    });
    return;
  }

  const action = actionToken(payload.action);

  // Stop Telegram's progress indicator before ownership resolution or any
  // provider call. Follow-up failures are sent as ordinary messages because a
  // callback can be answered only once.
  await deps.telegram.answerCallbackQuery(callback.callbackQueryId);

  const userId = await deps.users.ensureUser(callback);
  const log = deps.logger.child({
    update_id: callback.updateId,
    user_id: userId,
    note_id: payload.resourceId,
  });

  try {
    const noteId = payload.resourceId;
    let found = true;

    switch (payload.action.kind) {
      case "save":
      case "unsave": {
        const saved = payload.action.kind === "save";
        const result = await deps.notes.setNoteSaved(userId, noteId, saved);
        if (result.outcome !== "updated") {
          found = false;
          break;
        }
        const display = await deps.notes.findNoteForDisplay(userId, noteId);
        if (display === null) {
          found = false;
          break;
        }
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          {
            inline_keyboard: buildNoteKeyboard({
              noteId,
              isSaved: saved,
            }),
          },
        );
        break;
      }
      case "delete": {
        const display = await deps.notes.findNoteForDisplay(userId, noteId);
        if (display === null) {
          found = false;
          break;
        }
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          { inline_keyboard: buildDeleteConfirmationKeyboard(noteId) },
        );
        break;
      }
      case "edit": {
        const display = await deps.notes.findNoteForDisplay(userId, noteId);
        if (display === null) {
          found = false;
          break;
        }
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          { inline_keyboard: buildEditKeyboard(noteId) },
        );
        break;
      }
      case "edit_export": {
        const display = await deps.notes.findNoteForDisplay(userId, noteId);
        if (display === null) {
          found = false;
          break;
        }
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          { inline_keyboard: buildExportKeyboard(noteId) },
        );
        break;
      }
      case "edit_format":
      case "format_prev":
      case "format_next": {
        const display = await deps.notes.findNoteForDisplay(userId, noteId);
        if (display === null) {
          found = false;
          break;
        }
        const labels = await deps.templates.listLabels(userId, display.sourceType);
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          {
            inline_keyboard: buildFormatKeyboard({
              noteId,
              templateKey: templateKey(display.templateKey),
              templateLabels: labels,
              page: payload.action.kind === "edit_format" ? 0 : payload.revision,
            }),
          },
        );
        break;
      }
      case "edit_back": {
        const display = await deps.notes.findNoteForDisplay(userId, noteId);
        if (display === null) {
          found = false;
          break;
        }
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          {
            inline_keyboard: buildNoteKeyboard({
              noteId,
              isSaved: display.isSaved,
            }),
          },
        );
        break;
      }
      case "delete_confirm": {
        const result = await deps.notes.deleteNote(userId, noteId);
        if (result.outcome !== "deleted") {
          found = false;
          break;
        }
        await deps.telegram.editMessageText(
          callback.telegramChatId,
          callback.messageId,
          "Note deleted.",
        );
        break;
      }
      case "cancel_delete": {
        const display = await deps.notes.findNoteForDisplay(userId, noteId);
        if (display === null) {
          found = false;
          break;
        }
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          {
            inline_keyboard: buildNoteKeyboard({
              noteId,
              isSaved: display.isSaved,
            }),
          },
        );
        break;
      }
      case "show":
        found = await sendCurrentNote(callback, userId, noteId, deps);
        break;
      case "export_md":
        found = await exportCurrentNote(callback, userId, noteId, "markdown", deps);
        break;
      case "export_txt":
        found = await exportCurrentNote(callback, userId, noteId, "text", deps);
        break;
      case "export_pdf":
        found = await exportCurrentNote(callback, userId, noteId, "pdf", deps);
        break;
      case "shorter":
        found = await regenerate(callback, userId, noteId, null, "shorter", deps);
        break;
      case "detailed":
        found = await regenerate(callback, userId, noteId, null, "detailed", deps);
        break;
      case "format":
        found = await regenerate(
          callback,
          userId,
          noteId,
          payload.action.templateKey,
          "custom",
          deps,
        );
        break;
    }

    if (!found) {
      await deps.telegram.sendMessage(callback.telegramChatId, NOTE_GONE);
      return;
    }

    log.info("callback.completed", { callback_action: action, outcome: "completed" });
  } catch (thrown) {
    const error = toAppError(thrown);
    log[error.logLevel]("callback.failed", {
      callback_action: action,
      error_code: error.code,
      error_detail: error.internalDetail,
    });
    await deps.telegram.sendMessage(callback.telegramChatId, error.publicMessage);
  }
}
