import type { JobState, SystemTemplateKey } from "../config/constants.ts";
import { AppError, toAppError } from "../errors/app-error.ts";
import type { Logger } from "../observability/logger.ts";
import type { NoteAIProvider } from "../providers/note-ai.provider.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { ProcessingJobsRepository } from "../repositories/processing-jobs.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import { STRUCTURED_NOTE_VERSION } from "../schemas/structured-note.ts";
import { sha256Hex } from "../security/hashing.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import type { AcceptedMessage } from "../telegram/parse-update.ts";
import { buildNoteKeyboard, renderNoteOutput } from "./note-rendering.ts";

export interface TextNoteDependencies {
  readonly jobs: Pick<ProcessingJobsRepository, "advance" | "markRetryable">;
  readonly notes: Pick<NotesRepository, "persistNote">;
  readonly templates: Pick<TemplatesRepository, "findForGeneration" | "listSystemLabels">;
  readonly usage: Pick<UsageRepository, "recordGeneration">;
  readonly provider: Pick<NoteAIProvider, "generateText">;
  readonly telegram: Pick<TelegramGateway, "sendMessage">;
  readonly logger: Logger;
}

export interface TextNoteResult {
  readonly noteId: string;
  readonly outputId: string;
}

async function advance(
  deps: TextNoteDependencies,
  userId: string,
  jobId: string,
  expected: JobState,
  next: JobState,
): Promise<void> {
  const result = await deps.jobs.advance(userId, jobId, expected, next);
  if (result.outcome !== "advanced") {
    throw AppError.internal(`job did not advance from ${expected} to ${next}`);
  }
}

/** Generate, persist and deliver one newly ingested text note inline. */
export async function createTextNote(
  message: AcceptedMessage,
  userId: string,
  jobId: string,
  deps: TextNoteDependencies,
): Promise<TextNoteResult> {
  if (message.inputType !== "text" || message.sourceText === null) {
    throw AppError.internal("createTextNote received a non-text job");
  }

  let state: JobState = "QUEUED";

  try {
    await advance(deps, userId, jobId, state, "ACQUIRING");
    state = "ACQUIRING";
    await advance(deps, userId, jobId, state, "EXTRACTING");
    state = "EXTRACTING";
    await advance(deps, userId, jobId, state, "GENERATING");
    state = "GENERATING";

    const template = await deps.templates.findForGeneration(userId, message.templateKey);
    const generation = await deps.provider.generateText({
      sourceText: message.sourceText,
      template,
      templateKey: message.templateKey,
      reason: "initial",
      outputLanguage: null,
    });
    const rendered = renderNoteOutput(generation.note);

    await deps.usage.recordGeneration({
      userId,
      jobId,
      provider: generation.provider,
      model: generation.model,
      inputTokens: generation.inputTokens,
      outputTokens: generation.outputTokens,
      providerRequestId: generation.providerRequestId,
    });

    await advance(deps, userId, jobId, state, "DELIVERING");
    state = "DELIVERING";

    const persisted = await deps.notes.persistNote({
      userId,
      jobId,
      title: generation.note.title,
      language: generation.note.language,
      sourceType: message.inputType,
      normalizedSourceText: message.sourceText,
      sourceTextSha256: await sha256Hex(message.sourceText),
      templateKey: message.templateKey,
      schemaVersion: STRUCTURED_NOTE_VERSION,
      contentJson: generation.note,
      renderedText: rendered.html,
      provider: generation.provider,
      model: generation.model,
      generationReason: "initial",
    });

    if (
      (persisted.outcome !== "created" && persisted.outcome !== "existing") ||
      persisted.noteId === null || persisted.outputId === null
    ) {
      throw AppError.internal(`persist_note returned ${persisted.outcome}`);
    }

    const labels = await deps.templates.listSystemLabels();
    const keyboard = {
      inline_keyboard: buildNoteKeyboard({
        noteId: persisted.noteId,
        templateKey: message.templateKey as SystemTemplateKey,
        isSaved: false,
        templateLabels: labels,
      }),
    };

    try {
      for (let index = 0; index < rendered.pages.length; index += 1) {
        const isLast = index === rendered.pages.length - 1;
        await deps.telegram.sendMessage(message.telegramChatId, rendered.pages[index] ?? "", {
          parseMode: "HTML",
          ...(isLast ? { inlineKeyboard: keyboard } : {}),
        });
      }
    } catch (thrown) {
      throw AppError.deliveryFailed("telegram note delivery failed", thrown);
    }

    deps.logger.info("note.created", {
      user_id: userId,
      job_id: jobId,
      note_id: persisted.noteId,
      template_key: message.templateKey,
      input_tokens: generation.inputTokens,
      output_tokens: generation.outputTokens,
      provider: generation.provider,
      model: generation.model,
    });

    return { noteId: persisted.noteId, outputId: persisted.outputId };
  } catch (thrown) {
    const error = toAppError(thrown);

    if (state !== "DELIVERING" || error.code !== "delivery_failed") {
      try {
        await deps.jobs.markRetryable(
          userId,
          jobId,
          state,
          error.code.toUpperCase(),
          `Phase 1 inline ${state.toLowerCase()} failure`,
        );
      } catch {
        // The original classified error is more useful than a secondary failure
        // to record its retry state. Both paths are already logged by the caller.
      }
    }

    throw error;
  }
}
