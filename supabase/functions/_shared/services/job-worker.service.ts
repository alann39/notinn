import {
  type JobState,
  MAX_AUDIO_DURATION_SECONDS,
  MAX_INLINE_AUDIO_BYTES,
  SYSTEM_TEMPLATE_KEYS,
  type SystemTemplateKey,
} from "../config/constants.ts";
import { AppError, toAppError } from "../errors/app-error.ts";
import type { Logger } from "../observability/logger.ts";
import type {
  AudioGenerationResult,
  NoteAIProvider,
  NoteGenerationResult,
} from "../providers/note-ai.provider.ts";
import type { NotesRepository, PersistNoteInput } from "../repositories/notes.repository.ts";
import type {
  ClaimedProcessingJob,
  ProcessingJobsRepository,
  ProcessingQueueMessage,
} from "../repositories/processing-jobs.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import { parseStructuredNote, STRUCTURED_NOTE_VERSION } from "../schemas/structured-note.ts";
import { sha256Hex } from "../security/hashing.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import { buildNoteKeyboard, renderNoteOutput, renderTranscriptPages } from "./note-rendering.ts";

const AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/aiff",
  "audio/alaw",
  "audio/flac",
  "audio/l16",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/mulaw",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
]);

const AUDIO_MIME_ALIASES: Readonly<Record<string, string>> = {
  "audio/mp4": "audio/m4a",
  "audio/x-m4a": "audio/m4a",
  "audio/x-wav": "audio/wav",
};

const MAX_ATTEMPTS = 3;
const QUEUE_VISIBILITY_SECONDS = 300;

export interface JobWorkerDependencies {
  readonly jobs: Pick<
    ProcessingJobsRepository,
    | "readQueue"
    | "deleteQueueMessage"
    | "findQueueMessageId"
    | "claim"
    | "advance"
    | "markRetryable"
    | "complete"
    | "fail"
  >;
  readonly notes: Pick<
    NotesRepository,
    "stageNoteForDelivery" | "findNoteForDisplay" | "findNoteForRegeneration"
  >;
  readonly templates: Pick<TemplatesRepository, "findForGeneration" | "listSystemLabels">;
  readonly usage: Pick<UsageRepository, "recordGeneration">;
  readonly provider: NoteAIProvider;
  readonly telegram: TelegramGateway;
  readonly logger: Logger;
}

export interface QueueBatchResult {
  readonly read: number;
  readonly completed: number;
  readonly retrying: number;
  readonly discarded: number;
}

type ProcessOutcome = "completed" | "retrying" | "discarded";

function templateKeyOf(value: string | null): SystemTemplateKey {
  if (value !== null && (SYSTEM_TEMPLATE_KEYS as readonly string[]).includes(value)) {
    return value as SystemTemplateKey;
  }
  throw AppError.internal("worker job referenced an unknown template key");
}

function requiredClaim(job: ClaimedProcessingJob): asserts job is ClaimedProcessingJob & {
  readonly userId: string;
  readonly chatId: number;
  readonly inputType: NonNullable<ClaimedProcessingJob["inputType"]>;
  readonly state: "ACQUIRING";
} {
  if (
    job.userId === null || job.chatId === null || job.inputType === null ||
    job.state !== "ACQUIRING"
  ) {
    throw AppError.internal("claimed job omitted required worker metadata");
  }
}

async function advance(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & { readonly userId: string },
  expected: JobState,
  next: JobState,
): Promise<void> {
  const result = await deps.jobs.advance(job.userId, job.jobId, expected, next);
  if (result.outcome !== "advanced") {
    throw AppError.internal(`worker job did not advance from ${expected} to ${next}`);
  }
}

async function editStatusBestEffort(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & { readonly chatId: number },
  text: string,
): Promise<void> {
  if (job.statusMessageId === null) return;
  try {
    await deps.telegram.editMessageText(job.chatId, job.statusMessageId, text);
  } catch (thrown) {
    const error = toAppError(thrown);
    deps.logger[error.logLevel]("worker.status_edit_failed", {
      job_id: job.jobId,
      error_code: error.code,
      error_detail: error.internalDetail,
    });
  }
}

async function deliverPages(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & { readonly chatId: number },
  transcript: string | null,
  notePages: readonly string[],
  keyboard: Parameters<TelegramGateway["sendMessage"]>[2],
): Promise<void> {
  const pages = [
    ...(transcript === null ? [] : renderTranscriptPages(transcript)),
    ...notePages,
  ];

  const sendFresh = async (fromIndex: number): Promise<void> => {
    for (let index = fromIndex; index < pages.length; index += 1) {
      const isLast = index === pages.length - 1;
      await deps.telegram.sendMessage(job.chatId, pages[index] ?? "", {
        parseMode: "HTML",
        ...(isLast ? keyboard : {}),
      });
    }
  };

  if (job.statusMessageId === null) {
    await sendFresh(0);
    return;
  }

  try {
    const isOnly = pages.length === 1;
    await deps.telegram.editMessageText(job.chatId, job.statusMessageId, pages[0] ?? "", {
      parseMode: "HTML",
      ...(isOnly ? keyboard : {}),
    });
    await sendFresh(1);
  } catch {
    // A status message may have been deleted or become uneditable while the job
    // was waiting. A fresh delivery is the recovery path; if Telegram itself is
    // unavailable this second call throws and the durable job is retried.
    await sendFresh(0);
  }
}

async function deliverPersistedNote(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & { readonly userId: string; readonly chatId: number },
  noteId: string,
): Promise<void> {
  const [display, source, labels] = await Promise.all([
    deps.notes.findNoteForDisplay(job.userId, noteId),
    deps.notes.findNoteForRegeneration(job.userId, noteId),
    deps.templates.listSystemLabels(),
  ]);
  if (display === null) throw AppError.internal("staged note was not readable for delivery");

  const note = parseStructuredNote(display.contentJson, AppError.outputValidationFailed);
  const rendered = renderNoteOutput(note);
  const templateKey = templateKeyOf(display.templateKey);
  const keyboard = {
    inlineKeyboard: {
      inline_keyboard: buildNoteKeyboard({
        noteId,
        templateKey,
        isSaved: display.isSaved,
        templateLabels: labels,
      }),
    },
  } as const;
  const transcript = source?.sourceType === "voice" || source?.sourceType === "audio"
    ? source.sourceText
    : null;

  try {
    await deliverPages(deps, job, transcript, rendered.pages, keyboard);
  } catch (thrown) {
    throw AppError.deliveryFailed("telegram note delivery failed", thrown);
  }
}

async function generateNewNote(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & {
    readonly userId: string;
    readonly chatId: number;
    readonly inputType: NonNullable<ClaimedProcessingJob["inputType"]>;
  },
  templateKey: SystemTemplateKey,
  state: { value: JobState },
): Promise<{ generation: NoteGenerationResult; sourceText: string }> {
  const template = await deps.templates.findForGeneration(job.userId, templateKey);

  if (job.inputType === "text") {
    if (job.sourceText === null) throw AppError.internal("text job had no source text");
    await advance(deps, job, "ACQUIRING", "EXTRACTING");
    state.value = "EXTRACTING";
    await advance(deps, job, "EXTRACTING", "GENERATING");
    state.value = "GENERATING";
    const generation = await deps.provider.generateText({
      sourceText: job.sourceText,
      template,
      templateKey,
      reason: "initial",
      outputLanguage: null,
    });
    return { generation, sourceText: job.sourceText };
  }

  if (job.inputType !== "voice" && job.inputType !== "audio") {
    throw AppError.unsupportedInput("worker modality belongs to Phase 3");
  }
  if (job.telegramFileId === null) {
    throw AppError.fileUnavailable("audio job had no Telegram file id");
  }
  if (job.sizeBytes !== null && job.sizeBytes > MAX_INLINE_AUDIO_BYTES) {
    throw AppError.inputTooLarge("audio metadata exceeded the inline provider limit");
  }
  if (job.durationSeconds !== null && job.durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    throw AppError.inputTooLarge("audio duration exceeded the product limit");
  }

  const reportedMimeType = job.mimeType?.split(";", 1)[0]?.trim().toLowerCase() ||
    (job.inputType === "voice" ? "audio/ogg" : "");
  const mimeType = AUDIO_MIME_ALIASES[reportedMimeType] ?? reportedMimeType;
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    throw AppError.unsupportedInput("audio MIME type is not accepted by the Gemini adapter");
  }

  await editStatusBestEffort(deps, job, "Audio received — transcribing and organizing it.");
  const audio = await deps.telegram.downloadFile(job.telegramFileId, MAX_INLINE_AUDIO_BYTES);
  await advance(deps, job, "ACQUIRING", "EXTRACTING");
  state.value = "EXTRACTING";
  await advance(deps, job, "EXTRACTING", "GENERATING");
  state.value = "GENERATING";

  let generation: AudioGenerationResult;
  try {
    generation = await deps.provider.generateAudio({
      audio,
      mimeType,
      template,
      templateKey,
      outputLanguage: null,
    });
  } finally {
    // Best-effort memory scrubbing. It does not replace the no-persistence rule,
    // but shortens the lifetime of raw audio inside a warm isolate.
    audio.fill(0);
  }

  return { generation, sourceText: generation.transcript };
}

async function handleFailure(
  deps: JobWorkerDependencies,
  message: ProcessingQueueMessage,
  job: ClaimedProcessingJob & { readonly userId: string; readonly chatId: number },
  state: JobState,
  thrown: unknown,
): Promise<ProcessOutcome> {
  const error = toAppError(thrown);
  deps.logger[error.logLevel]("worker.job_failed", {
    job_id: job.jobId,
    user_id: job.userId,
    error_code: error.code,
    error_detail: error.internalDetail,
    job_state: state,
    attempt_count: job.attemptCount,
  });

  if (error.retryable) {
    await deps.jobs.markRetryable(
      job.userId,
      job.jobId,
      state,
      error.code.toUpperCase(),
      `Phase 2 worker ${state.toLowerCase()} failure`,
    );
    await editStatusBestEffort(deps, job, error.publicMessage);
    return "retrying";
  }

  await deps.jobs.fail(
    job.userId,
    job.jobId,
    state,
    error.code.toUpperCase(),
    `Phase 2 permanent ${state.toLowerCase()} failure`,
  );
  await deps.jobs.deleteQueueMessage(message.queueMessageId);
  if (job.statusMessageId === null) {
    await deps.telegram.sendMessage(job.chatId, error.publicMessage);
  } else {
    await editStatusBestEffort(deps, job, error.publicMessage);
  }
  return "discarded";
}

export async function processQueueMessage(
  message: ProcessingQueueMessage,
  deps: JobWorkerDependencies,
): Promise<ProcessOutcome> {
  const job = await deps.jobs.claim(message.jobId, MAX_ATTEMPTS);

  if (job.outcome === "not_found" || job.outcome === "terminal") {
    await deps.jobs.deleteQueueMessage(message.queueMessageId);
    return "discarded";
  }
  if (job.outcome === "retry_wait" || job.outcome === "busy") return "retrying";
  if (job.outcome === "exhausted") {
    await deps.jobs.deleteQueueMessage(message.queueMessageId);
    if (job.chatId !== null) {
      const error = AppError.retriesExhausted("worker reached its maximum attempts");
      if (job.statusMessageId === null) {
        await deps.telegram.sendMessage(job.chatId, error.publicMessage);
      } else {
        await editStatusBestEffort(deps, { ...job, chatId: job.chatId }, error.publicMessage);
      }
    }
    return "discarded";
  }

  requiredClaim(job);
  let state: JobState = "ACQUIRING";

  try {
    if (job.noteId !== null) {
      // A previous attempt generated and staged the note but failed during
      // delivery. Walk the legal state path without paying for generation again.
      await advance(deps, job, state, "EXTRACTING");
      state = "EXTRACTING";
      await advance(deps, job, state, "GENERATING");
      state = "GENERATING";
      await advance(deps, job, state, "DELIVERING");
      state = "DELIVERING";
      await deliverPersistedNote(deps, job, job.noteId);
    } else {
      const templateKey = templateKeyOf(job.templateKey);
      const stateRef = { value: state };
      let generated: Awaited<ReturnType<typeof generateNewNote>>;
      try {
        generated = await generateNewNote(deps, job, templateKey, stateRef);
      } finally {
        state = stateRef.value;
      }

      const rendered = renderNoteOutput(generated.generation.note);
      await deps.usage.recordGeneration({
        userId: job.userId,
        jobId: job.jobId,
        provider: generated.generation.provider,
        model: generated.generation.model,
        inputTokens: generated.generation.inputTokens,
        outputTokens: generated.generation.outputTokens,
        providerRequestId: generated.generation.providerRequestId,
        audioSeconds: job.inputType === "voice" || job.inputType === "audio"
          ? job.durationSeconds
          : null,
      });

      await advance(deps, job, state, "DELIVERING");
      state = "DELIVERING";
      const stagedInput: PersistNoteInput = {
        userId: job.userId,
        jobId: job.jobId,
        title: generated.generation.note.title,
        language: generated.generation.note.language,
        sourceType: job.inputType,
        normalizedSourceText: generated.sourceText,
        sourceTextSha256: await sha256Hex(generated.sourceText),
        templateKey,
        schemaVersion: STRUCTURED_NOTE_VERSION,
        contentJson: generated.generation.note,
        renderedText: rendered.html,
        provider: generated.generation.provider,
        model: generated.generation.model,
        generationReason: "initial",
      };
      const staged = await deps.notes.stageNoteForDelivery(stagedInput);
      if (
        (staged.outcome !== "created" && staged.outcome !== "existing") ||
        staged.noteId === null
      ) {
        throw AppError.internal(`stage_note_for_delivery returned ${staged.outcome}`);
      }
      await deliverPersistedNote(deps, job, staged.noteId);
    }

    const completed = await deps.jobs.complete(job.userId, job.jobId);
    if (!completed) throw AppError.internal("delivered job did not complete");
    await deps.jobs.deleteQueueMessage(message.queueMessageId);

    deps.logger.info("worker.job_completed", {
      job_id: job.jobId,
      user_id: job.userId,
      input_type: job.inputType,
      attempt_count: job.attemptCount,
    });
    return "completed";
  } catch (thrown) {
    return await handleFailure(deps, message, job, state, thrown);
  }
}

/** Process one explicitly named job using the same durable queue acknowledgement. */
export async function processJobById(
  jobId: string,
  deps: JobWorkerDependencies,
): Promise<ProcessOutcome> {
  const queueMessageId = await deps.jobs.findQueueMessageId(jobId);
  if (queueMessageId === null) {
    throw AppError.validation("job has no durable queue message");
  }
  return await processQueueMessage({ queueMessageId, readCount: 0, jobId }, deps);
}

/** Read and process one bounded queue batch sequentially. */
export async function processQueueBatch(
  deps: JobWorkerDependencies,
  batchSize = 5,
): Promise<QueueBatchResult> {
  const messages = await deps.jobs.readQueue(QUEUE_VISIBILITY_SECONDS, batchSize);
  const result = { read: messages.length, completed: 0, retrying: 0, discarded: 0 };

  for (const message of messages) {
    const outcome = await processQueueMessage(message, deps);
    result[outcome] += 1;
  }

  return result;
}
