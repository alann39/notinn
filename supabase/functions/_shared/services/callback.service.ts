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
import type {
  NoteDelivery,
  NoteDraftView,
  NoteWorkflowRepository,
} from "../repositories/note-workflow.repository.ts";
import type { QuotaRepository } from "../repositories/quota.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import type { UserPreferencesRepository } from "../repositories/user-preferences.repository.ts";
import type { ClosedAlphaRepository } from "../repositories/closed-alpha.repository.ts";
import type { AccountLifecycleRepository } from "../repositories/account-lifecycle.repository.ts";
import type { PlanRepository } from "../repositories/plan.repository.ts";
import { actionToken, decodeCallbackPayload } from "../schemas/callback.ts";
import { decodeNavigationCallback, isNavigationCallback } from "../schemas/navigation-callback.ts";
import { parseStructuredNote, STRUCTURED_NOTE_VERSION } from "../schemas/structured-note.ts";
import type { InlineKeyboardMarkup, TelegramGateway } from "../telegram/client.ts";
import type { CallbackActionRequest } from "../telegram/parse-update.ts";
import {
  buildDeleteConfirmationKeyboard,
  buildDraftComparisonKeyboard,
  buildEditKeyboard,
  buildExportKeyboard,
  buildFormatKeyboard,
  buildNoteKeyboard,
  buildProcessingKeyboard,
  renderNoteOutput,
} from "./note-rendering.ts";
import { type NoteExportFormat, renderNoteExport } from "./note-export.ts";
import { withConsumedQuota } from "./quota.service.ts";
import { handleNavigationCallback } from "./navigation.service.ts";
import { closedAlphaAccessMessage, pendingDeletionMessage } from "./command.service.ts";

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
  readonly workflow: Pick<
    NoteWorkflowRepository,
    | "registerDelivery"
    | "findDelivery"
    | "listDeliveries"
    | "replaceDeliveryMessages"
    | "beginDraft"
    | "completeDraft"
    | "getDraft"
    | "applyDraft"
    | "discardDraft"
    | "failDraft"
  >;
  readonly templates:
    & Pick<TemplatesRepository, "findForGeneration" | "listLabels">
    & Partial<Pick<TemplatesRepository, "listAvailable">>;
  readonly preferences?: Pick<UserPreferencesRepository, "get" | "update">;
  readonly usage: Pick<UsageRepository, "recordGeneration">;
  readonly quota: Pick<QuotaRepository, "reserve" | "consume" | "getSummary">;
  readonly access?: Pick<ClosedAlphaRepository, "getAccess">;
  readonly lifecycle?: Pick<AccountLifecycleRepository, "get">;
  readonly plans?: Pick<PlanRepository, "getCatalogue">;
  readonly provider: Pick<NoteAIProvider, "generateText">;
  readonly telegram: Pick<
    TelegramGateway,
    | "sendMessage"
    | "sendDocument"
    | "answerCallbackQuery"
    | "editMessageReplyMarkup"
    | "editMessageText"
    | "deleteMessages"
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

async function deleteMessageIdsBestEffort(
  chatId: number,
  messageIds: readonly number[],
  deps: CallbackDependencies,
): Promise<void> {
  for (let offset = 0; offset < messageIds.length; offset += 100) {
    const batch = messageIds.slice(offset, offset + 100);
    if (batch.length === 0) continue;
    try {
      await deps.telegram.deleteMessages(chatId, batch);
    } catch (thrown) {
      const error = toAppError(thrown);
      deps.logger[error.logLevel]("telegram.delivery_cleanup_failed", {
        error_code: error.code,
        error_detail: error.internalDetail,
      });
    }
  }
}

async function deliveryFor(
  callback: CallbackActionRequest,
  userId: string,
  noteId: string,
  deps: CallbackDependencies,
): Promise<NoteDelivery> {
  const stored = await deps.workflow.findDelivery(
    userId,
    noteId,
    callback.telegramChatId,
    callback.messageId,
  );
  return stored ?? {
    deliveryId: "",
    noteId,
    chatId: callback.telegramChatId,
    messageIds: [callback.messageId],
  };
}

/** Render one logical note back into its existing Telegram message group. */
async function replaceDeliveryPages(
  callback: CallbackActionRequest,
  userId: string,
  noteId: string,
  pages: readonly string[],
  keyboard: InlineKeyboardMarkup,
  deps: CallbackDependencies,
): Promise<void> {
  if (pages.length === 0) throw AppError.internal("rendered note had no Telegram pages");
  const delivery = await deliveryFor(callback, userId, noteId, deps);
  const oldIds = [...delivery.messageIds];
  const nextIds: number[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const isLast = index === pages.length - 1;
    const existingId = oldIds[index];
    if (existingId !== undefined) {
      await deps.telegram.editMessageText(delivery.chatId, existingId, pages[index] ?? "", {
        parseMode: "HTML",
        ...(isLast ? { inlineKeyboard: keyboard } : {}),
      });
      nextIds.push(existingId);
    } else {
      const sent = await deps.telegram.sendMessage(delivery.chatId, pages[index] ?? "", {
        parseMode: "HTML",
        ...(isLast ? { inlineKeyboard: keyboard } : {}),
      });
      nextIds.push(sent.messageId);
    }
  }

  await deleteMessageIdsBestEffort(delivery.chatId, oldIds.slice(pages.length), deps);

  if (delivery.deliveryId === "") {
    const registered = await deps.workflow.registerDelivery(
      userId,
      noteId,
      delivery.chatId,
      nextIds,
    );
    if (registered.outcome !== "created") {
      throw AppError.internal("legacy note delivery could not be registered");
    }
  } else {
    const outcome = await deps.workflow.replaceDeliveryMessages(
      userId,
      delivery.deliveryId,
      nextIds,
    );
    if (outcome !== "updated") {
      throw AppError.internal("note delivery registry changed during an edit");
    }
  }
}

function renderedDraft(view: NoteDraftView, visible: "before" | "after") {
  return renderNoteOutput(
    parseStructuredNote(
      visible === "before" ? view.baseContentJson : view.draftContentJson,
      AppError.outputValidationFailed,
    ),
  );
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
  const messageIds: number[] = [];

  for (let index = 0; index < rendered.pages.length; index += 1) {
    const isLast = index === rendered.pages.length - 1;
    const sent = await deps.telegram.sendMessage(
      callback.telegramChatId,
      rendered.pages[index] ?? "",
      {
        parseMode: "HTML",
        ...(isLast ? { inlineKeyboard: keyboard } : {}),
      },
    );
    messageIds.push(sent.messageId);
  }
  const registered = await deps.workflow.registerDelivery(
    userId,
    noteId,
    callback.telegramChatId,
    messageIds,
  );
  if (registered.outcome !== "created") {
    throw AppError.internal("shown note delivery could not be registered");
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
    await deps.telegram.editMessageReplyMarkup(
      callback.telegramChatId,
      callback.messageId,
      { inline_keyboard: buildEditKeyboard(noteId, false) },
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
  const draft = await deps.workflow.beginDraft({
    userId,
    noteId,
    updateId: callback.updateId,
    templateKey: selectedTemplateKey,
    reason,
  });
  if (draft.outcome === "not_found") return false;
  if (draft.outcome === "source_unavailable") {
    await deps.telegram.editMessageReplyMarkup(
      callback.telegramChatId,
      callback.messageId,
      { inline_keyboard: buildEditKeyboard(noteId, false) },
    );
    return true;
  }
  if (draft.outcome === "busy" || draft.draftId === null) {
    await deps.telegram.editMessageReplyMarkup(
      callback.telegramChatId,
      callback.messageId,
      { inline_keyboard: buildProcessingKeyboard("Edit already in progress…") },
    );
    return true;
  }

  const draftId = draft.draftId;
  await deps.telegram.editMessageReplyMarkup(
    callback.telegramChatId,
    callback.messageId,
    { inline_keyboard: buildProcessingKeyboard("Creating preview…") },
  );

  try {
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
    if (output.outcome !== "created" || output.outputId === null) {
      throw AppError.internal("generated edit could not be staged");
    }

    const completed = await deps.workflow.completeDraft(userId, draftId, output.outputId);
    if (completed !== "ready") {
      throw AppError.internal("generated edit could not become a ready draft");
    }

    await replaceDeliveryPages(
      callback,
      userId,
      noteId,
      rendered.pages,
      { inline_keyboard: buildDraftComparisonKeyboard(draftId, "after") },
      deps,
    );
    return true;
  } catch (thrown) {
    await deps.workflow.failDraft(userId, draftId);
    try {
      await deps.telegram.editMessageReplyMarkup(
        callback.telegramChatId,
        callback.messageId,
        { inline_keyboard: buildEditKeyboard(noteId, true) },
      );
    } catch {
      // The original error remains authoritative; a stale message may no longer
      // be editable, and Telegram will surface the ordinary failure message.
    }
    throw thrown;
  }
}

async function handleDraftCallback(
  callback: CallbackActionRequest,
  userId: string,
  draftId: string,
  action: "draft_before" | "draft_after" | "draft_apply" | "draft_discard",
  deps: CallbackDependencies,
): Promise<boolean> {
  const view = await deps.workflow.getDraft(userId, draftId);
  if (view === null) return false;

  if (action === "draft_before" || action === "draft_after") {
    const visible = action === "draft_before" ? "before" : "after";
    const rendered = renderedDraft(view, visible);
    await replaceDeliveryPages(
      callback,
      userId,
      view.noteId,
      rendered.pages,
      { inline_keyboard: buildDraftComparisonKeyboard(draftId, visible) },
      deps,
    );
    return true;
  }

  await deps.telegram.editMessageReplyMarkup(
    callback.telegramChatId,
    callback.messageId,
    {
      inline_keyboard: buildProcessingKeyboard(
        action === "draft_apply" ? "Applying change…" : "Restoring original…",
      ),
    },
  );

  if (action === "draft_apply") {
    const applied = await deps.workflow.applyDraft(userId, draftId);
    if (applied.outcome !== "applied" || applied.noteId === null || applied.isSaved === null) {
      return false;
    }
    const rendered = renderedDraft(view, "after");
    await replaceDeliveryPages(
      callback,
      userId,
      applied.noteId,
      rendered.pages,
      {
        inline_keyboard: buildNoteKeyboard({
          noteId: applied.noteId,
          isSaved: applied.isSaved,
        }),
      },
      deps,
    );
    return true;
  }

  const discarded = await deps.workflow.discardDraft(userId, draftId);
  if (
    discarded.outcome !== "discarded" || discarded.noteId === null ||
    discarded.isSaved === null
  ) {
    return false;
  }
  const rendered = renderedDraft(view, "before");
  await replaceDeliveryPages(
    callback,
    userId,
    discarded.noteId,
    rendered.pages,
    {
      inline_keyboard: buildNoteKeyboard({
        noteId: discarded.noteId,
        isSaved: discarded.isSaved,
      }),
    },
    deps,
  );
  return true;
}

async function deleteNoteCleanly(
  callback: CallbackActionRequest,
  userId: string,
  noteId: string,
  deps: CallbackDependencies,
): Promise<boolean> {
  const deliveries = await deps.workflow.listDeliveries(userId, noteId);
  await deps.telegram.editMessageReplyMarkup(
    callback.telegramChatId,
    callback.messageId,
    { inline_keyboard: buildProcessingKeyboard("Deleting note…") },
  );

  const result = await deps.notes.deleteNote(userId, noteId);
  if (result.outcome !== "deleted") return false;

  let notificationId = callback.messageId;
  try {
    await deps.telegram.editMessageText(
      callback.telegramChatId,
      callback.messageId,
      "Note deleted.",
    );
  } catch {
    const sent = await deps.telegram.sendMessage(callback.telegramChatId, "Note deleted.");
    notificationId = sent.messageId;
  }

  const byChat = new Map<number, Set<number>>();
  for (const delivery of deliveries) {
    const ids = byChat.get(delivery.chatId) ?? new Set<number>();
    for (const messageId of delivery.messageIds) {
      if (delivery.chatId !== callback.telegramChatId || messageId !== notificationId) {
        ids.add(messageId);
      }
    }
    byChat.set(delivery.chatId, ids);
  }
  if (notificationId !== callback.messageId) {
    const ids = byChat.get(callback.telegramChatId) ?? new Set<number>();
    ids.add(callback.messageId);
    byChat.set(callback.telegramChatId, ids);
  }

  for (const [chatId, ids] of byChat) {
    await deleteMessageIdsBestEffort(chatId, [...ids], deps);
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
    const lifecycle = await deps.lifecycle?.get(userId);
    if (lifecycle?.status === "deletion_pending" || lifecycle?.status === "deleted") {
      await deps.telegram.sendMessage(
        callback.telegramChatId,
        lifecycle.status === "deletion_pending"
          ? pendingDeletionMessage(lifecycle.deletionScheduledAt)
          : "This account has been deleted.",
      );
      return;
    }
    const access = await deps.access?.getAccess(userId);
    if (access !== undefined && access?.status !== "active") {
      await deps.telegram.sendMessage(
        callback.telegramChatId,
        closedAlphaAccessMessage(access?.status ?? null),
      );
      return;
    }
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
        plans: deps.plans,
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
  const longRunningActions = new Set([
    "shorter",
    "detailed",
    "format",
    "delete_confirm",
    "draft_apply",
    "draft_discard",
    "export_md",
    "export_txt",
    "export_pdf",
  ]);
  await deps.telegram.answerCallbackQuery(
    callback.callbackQueryId,
    longRunningActions.has(payload.action.kind) ? { text: "⏳ Working on it…" } : undefined,
  );

  const userId = await deps.users.ensureUser(callback);
  const lifecycle = await deps.lifecycle?.get(userId);
  if (lifecycle?.status === "deletion_pending" || lifecycle?.status === "deleted") {
    await deps.telegram.sendMessage(
      callback.telegramChatId,
      lifecycle.status === "deletion_pending"
        ? pendingDeletionMessage(lifecycle.deletionScheduledAt)
        : "This account has been deleted.",
    );
    return;
  }
  const access = await deps.access?.getAccess(userId);
  if (access !== undefined && access?.status !== "active") {
    await deps.telegram.sendMessage(
      callback.telegramChatId,
      closedAlphaAccessMessage(access?.status ?? null),
    );
    return;
  }

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
        const [display, source] = await Promise.all([
          deps.notes.findNoteForDisplay(userId, noteId),
          deps.notes.findNoteForRegeneration(userId, noteId),
        ]);
        if (display === null || source === null) {
          found = false;
          break;
        }
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          { inline_keyboard: buildEditKeyboard(noteId, source.sourceText !== null) },
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
        found = await deleteNoteCleanly(callback, userId, noteId, deps);
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
      case "export_md": {
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          { inline_keyboard: buildProcessingKeyboard("Preparing Markdown…") },
        );
        found = await exportCurrentNote(callback, userId, noteId, "markdown", deps);
        if (found) {
          await deps.telegram.editMessageReplyMarkup(
            callback.telegramChatId,
            callback.messageId,
            { inline_keyboard: buildExportKeyboard(noteId) },
          );
        }
        break;
      }
      case "export_txt": {
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          { inline_keyboard: buildProcessingKeyboard("Preparing text file…") },
        );
        found = await exportCurrentNote(callback, userId, noteId, "text", deps);
        if (found) {
          await deps.telegram.editMessageReplyMarkup(
            callback.telegramChatId,
            callback.messageId,
            { inline_keyboard: buildExportKeyboard(noteId) },
          );
        }
        break;
      }
      case "export_pdf": {
        await deps.telegram.editMessageReplyMarkup(
          callback.telegramChatId,
          callback.messageId,
          { inline_keyboard: buildProcessingKeyboard("Preparing PDF…") },
        );
        found = await exportCurrentNote(callback, userId, noteId, "pdf", deps);
        if (found) {
          await deps.telegram.editMessageReplyMarkup(
            callback.telegramChatId,
            callback.messageId,
            { inline_keyboard: buildExportKeyboard(noteId) },
          );
        }
        break;
      }
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
      case "draft_before":
      case "draft_after":
      case "draft_apply":
      case "draft_discard":
        found = await handleDraftCallback(
          callback,
          userId,
          payload.resourceId,
          payload.action.kind,
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
