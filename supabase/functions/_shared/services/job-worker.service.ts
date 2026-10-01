import {
  AUDIO_DURATION_BY_PLAN,
  type JobState,
  LARGE_AUDIO_SEGMENT_BYTES,
  LARGE_AUDIO_SEGMENT_OVERLAP_BYTES,
  LARGE_AUDIO_TIMEOUT_MS,
  MAX_AUDIO_DURATION_SECONDS_FREE,
  MAX_DOCX_BYTES,
  MAX_INLINE_AUDIO_BYTES,
  MAX_INLINE_MEDIA_BYTES,
  MAX_LARGE_AUDIO_BYTES,
  MAX_LARGE_AUDIO_SEGMENTS,
  MAX_TEXT_DOCUMENT_BYTES,
  MAX_WEB_AUDIO_BYTES,
  SEGMENT_AUDIO_TIMEOUT_MS,
  TEMPLATE_KEY_PATTERN,
  type TemplateKey,
} from "../config/constants.ts";
import { AppError, toAppError } from "../errors/app-error.ts";
import type { Logger } from "../observability/logger.ts";
import type {
  AudioGenerationRequest,
  AudioGenerationResult,
  ImageGenerationResult,
  NoteAIProvider,
  NoteGenerationResult,
} from "../providers/note-ai.provider.ts";
import { isTransientProviderFailure } from "../providers/provider-fallback.ts";
import type { NotesRepository, PersistNoteInput } from "../repositories/notes.repository.ts";
import type { NoteWorkflowRepository } from "../repositories/note-workflow.repository.ts";
import type {
  ClaimedProcessingJob,
  ProcessingJobsRepository,
  ProcessingQueueMessage,
} from "../repositories/processing-jobs.repository.ts";
import type { PlanRepository } from "../repositories/plan.repository.ts";
import type { QuotaRepository } from "../repositories/quota.repository.ts";
import type {
  GenerationTemplate,
  TemplatesRepository,
} from "../repositories/templates.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import { parseStructuredNote, STRUCTURED_NOTE_VERSION } from "../schemas/structured-note.ts";
import { sha256Hex } from "../security/hashing.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import { buildNoteKeyboard, renderNoteOutput } from "./note-rendering.ts";
import {
  extractDocxText,
  extractPlainText,
  validatedImageMime,
  validatePdf,
} from "./document-extraction.ts";
import { withConsumedQuota } from "./quota.service.ts";

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
  readonly workflow: Pick<NoteWorkflowRepository, "registerDelivery">;
  readonly templates: Pick<TemplatesRepository, "findForGeneration" | "listLabels">;
  readonly usage: Pick<UsageRepository, "recordGeneration">;
  readonly quota: Pick<QuotaRepository, "reserve" | "consume" | "release">;
  readonly provider: NoteAIProvider;
  readonly telegram: Pick<
    TelegramGateway,
    "downloadFile" | "editMessageText" | "sendMessage" | "deleteMessages"
  >;
  readonly plans?: Pick<PlanRepository, "getAudioLimit">;
  readonly storage?: {
    download(bucket: string, path: string): Promise<Uint8Array>;
    remove(bucket: string, paths: readonly string[]): Promise<void>;
  };
  readonly logger: Logger;
}

export interface QueueBatchResult {
  readonly read: number;
  readonly completed: number;
  readonly retrying: number;
  readonly discarded: number;
}

type ProcessOutcome = "completed" | "retrying" | "discarded";

/**
 * Preserve only a controlled upstream status for operator diagnosis. Provider
 * response bodies can contain user content and must never reach PostgreSQL.
 */
function safeFailureDetail(error: AppError, state: JobState): string {
  const providerStatus = error.internalDetail?.match(
    /^gemini interaction returned ([1-5][0-9]{2})$/,
  )?.[1];
  return providerStatus === undefined
    ? `Worker ${state.toLowerCase()} failure`
    : `Worker ${state.toLowerCase()} failure; Gemini HTTP ${providerStatus}`;
}

function templateKeyOf(value: string | null): TemplateKey {
  if (value !== null && TEMPLATE_KEY_PATTERN.test(value)) {
    return value;
  }
  throw AppError.internal("worker job referenced an unknown template key");
}

function requiredClaim(job: ClaimedProcessingJob): asserts job is ClaimedProcessingJob & {
  readonly userId: string;
  readonly chatId: number | null;
  readonly inputType: NonNullable<ClaimedProcessingJob["inputType"]>;
  readonly state: "ACQUIRING";
  readonly outputLanguage: NonNullable<ClaimedProcessingJob["outputLanguage"]>;
  readonly privacyMode: NonNullable<ClaimedProcessingJob["privacyMode"]>;
} {
  if (
    job.userId === null || job.inputType === null ||
    job.state !== "ACQUIRING" || job.outputLanguage === null || job.privacyMode === null ||
    (job.storagePath === null && job.chatId === null && job.sourceText === null)
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
  job: ClaimedProcessingJob & { readonly chatId: number | null },
  text: string,
): Promise<void> {
  if (job.chatId === null || job.statusMessageId === null) return;
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
  _transcript: string | null,
  notePages: readonly string[],
  keyboard: Parameters<TelegramGateway["sendMessage"]>[2],
): Promise<readonly number[]> {
  const pages = notePages;

  const messageIds: number[] = [];
  const sendFresh = async (fromIndex: number): Promise<void> => {
    for (let index = fromIndex; index < pages.length; index += 1) {
      const isLast = index === pages.length - 1;
      const sent = await deps.telegram.sendMessage(job.chatId, pages[index] ?? "", {
        parseMode: "HTML",
        ...(isLast ? keyboard : {}),
      });
      messageIds.push(sent.messageId);
    }
  };

  try {
    if (job.statusMessageId === null) {
      await sendFresh(0);
      return messageIds;
    }

    try {
      const isOnly = pages.length === 1;
      await deps.telegram.editMessageText(job.chatId, job.statusMessageId, pages[0] ?? "", {
        parseMode: "HTML",
        ...(isOnly ? keyboard : {}),
      });
      messageIds.push(job.statusMessageId);
    } catch {
      // A status message may have been deleted or become uneditable while the
      // job was waiting. Recover with a fresh, fully tracked delivery.
      await sendFresh(0);
      return messageIds;
    }

    await sendFresh(1);
    return messageIds;
  } catch (thrown) {
    // Do not leave half a multi-page note behind. A retry will create one clean
    // replacement group and register it only after every page has arrived.
    if (messageIds.length > 0) {
      try {
        await deps.telegram.deleteMessages(job.chatId, messageIds);
      } catch (cleanupThrown) {
        const error = toAppError(cleanupThrown);
        deps.logger[error.logLevel]("worker.partial_delivery_cleanup_failed", {
          job_id: job.jobId,
          error_code: error.code,
          error_detail: error.internalDetail,
        });
      }
    }
    throw thrown;
  }
}

async function deliverPersistedNote(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & {
    readonly userId: string;
    readonly chatId: number | null;
    readonly inputType: NonNullable<ClaimedProcessingJob["inputType"]>;
  },
  noteId: string,
): Promise<void> {
  if (job.chatId === null) {
    // Web-originated job: note is persisted and immediately visible in dashboard.
    return;
  }
  const chatId = job.chatId;
  const [display, source] = await Promise.all([
    deps.notes.findNoteForDisplay(job.userId, noteId),
    deps.notes.findNoteForRegeneration(job.userId, noteId),
  ]);
  if (display === null) throw AppError.internal("staged note was not readable for delivery");

  const note = parseStructuredNote(display.contentJson, AppError.outputValidationFailed);
  const rendered = renderNoteOutput(note);
  const keyboard = {
    inlineKeyboard: {
      inline_keyboard: buildNoteKeyboard({
        noteId,
        isSaved: display.isSaved,
      }),
    },
  } as const;
  const transcript = source?.sourceType === "voice" || source?.sourceType === "audio"
    ? source.sourceText
    : null;

  try {
    const messageIds = await deliverPages(
      deps,
      { ...job, chatId },
      transcript,
      rendered.pages,
      keyboard,
    );
    const registered = await deps.workflow.registerDelivery(
      job.userId,
      noteId,
      chatId,
      messageIds,
    );
    if (registered.outcome !== "created") {
      throw AppError.internal("delivered note message ids could not be registered");
    }
  } catch (thrown) {
    throw AppError.deliveryFailed("telegram note delivery failed", thrown);
  }
}

async function generateNewNote(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & {
    readonly userId: string;
    readonly chatId: number | null;
    readonly inputType: NonNullable<ClaimedProcessingJob["inputType"]>;
    readonly outputLanguage: NonNullable<ClaimedProcessingJob["outputLanguage"]>;
  },
  templateKey: TemplateKey,
  state: { value: JobState },
): Promise<{
  generation: NoteGenerationResult;
  sourceText: string;
  operation: "generation" | "vision";
  documentPages: number | null;
}> {
  const template = await deps.templates.findForGeneration(job.userId, templateKey, job.inputType);
  const generate = <T>(providerCall: () => Promise<T>) =>
    withConsumedQuota(
      deps.quota,
      {
        userId: job.userId,
        metric: "note_generation",
        reservationKey: `job:${job.jobId}:attempt:${job.attemptCount}`,
        jobId: job.jobId,
      },
      providerCall,
    );

  if (job.inputType === "text") {
    if (job.sourceText === null) throw AppError.internal("text job had no source text");
    const sourceText = job.sourceText;
    await advance(deps, job, "ACQUIRING", "EXTRACTING");
    state.value = "EXTRACTING";
    await advance(deps, job, "EXTRACTING", "GENERATING");
    state.value = "GENERATING";
    const generation = await generate(() =>
      deps.provider.generateText({
        sourceText,
        template,
        templateKey,
        reason: "initial",
        outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
      })
    );
    return { generation, sourceText, operation: "generation", documentPages: null };
  }

  if (job.inputType === "image") {
    if (job.storagePath === null && job.telegramFileId === null) {
      throw AppError.fileUnavailable("file job had no file source");
    }
    if (job.sizeBytes !== null && job.sizeBytes > MAX_INLINE_MEDIA_BYTES) {
      throw AppError.inputTooLarge("image metadata exceeded the inline provider limit");
    }
    await editStatusBestEffort(deps, job, "Image received — extracting and organizing it.");
    let image: Uint8Array;
    if (job.storagePath !== null) {
      if (!deps.storage) {
        throw AppError.internal("storage dependency missing for web image download");
      }
      image = await deps.storage.download("audio_uploads", job.storagePath);
      if (image.byteLength > MAX_INLINE_MEDIA_BYTES) {
        image.fill(0);
        throw AppError.inputTooLarge("image download exceeded the inline provider limit");
      }
    } else {
      image = await deps.telegram.downloadFile(job.telegramFileId!, MAX_INLINE_MEDIA_BYTES);
    }
    try {
      const mimeType = validatedImageMime(image);
      await advance(deps, job, "ACQUIRING", "EXTRACTING");
      state.value = "EXTRACTING";
      await advance(deps, job, "EXTRACTING", "GENERATING");
      state.value = "GENERATING";
      const generation: ImageGenerationResult = await generate(() =>
        deps.provider.generateImage({
          image,
          mimeType,
          template,
          templateKey,
          outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
        })
      );
      return {
        generation,
        sourceText: generation.extractedText,
        operation: "vision",
        documentPages: null,
      };
    } finally {
      image.fill(0);
      if (job.storagePath !== null && deps.storage) {
        try {
          await deps.storage.remove("audio_uploads", [job.storagePath]);
        } catch (cleanupThrown) {
          const cleanupErr = toAppError(cleanupThrown);
          deps.logger[cleanupErr.logLevel]("worker.storage_cleanup_failed", {
            job_id: job.jobId,
            error_code: cleanupErr.code,
            error_detail: cleanupErr.internalDetail,
          });
        }
      }
    }
  }

  if (job.inputType === "pdf") {
    if (job.storagePath === null && job.telegramFileId === null) {
      throw AppError.fileUnavailable("file job had no file source");
    }
    if (job.sizeBytes !== null && job.sizeBytes > MAX_INLINE_MEDIA_BYTES) {
      throw AppError.inputTooLarge("PDF metadata exceeded the inline provider limit");
    }
    await editStatusBestEffort(deps, job, "PDF received — reading and organizing it.");
    let pdf: Uint8Array;
    if (job.storagePath !== null) {
      if (!deps.storage) {
        throw AppError.internal("storage dependency missing for web pdf download");
      }
      pdf = await deps.storage.download("audio_uploads", job.storagePath);
      if (pdf.byteLength > MAX_INLINE_MEDIA_BYTES) {
        pdf.fill(0);
        throw AppError.inputTooLarge("PDF download exceeded the inline provider limit");
      }
    } else {
      pdf = await deps.telegram.downloadFile(job.telegramFileId!, MAX_INLINE_MEDIA_BYTES);
    }
    try {
      validatePdf(pdf);
      await advance(deps, job, "ACQUIRING", "EXTRACTING");
      state.value = "EXTRACTING";
      await advance(deps, job, "EXTRACTING", "GENERATING");
      state.value = "GENERATING";
      const generation = await generate(() =>
        deps.provider.generatePdf({
          pdf,
          template,
          templateKey,
          outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
        })
      );
      return {
        generation,
        sourceText: generation.extractedText,
        operation: "vision",
        documentPages: generation.documentPages,
      };
    } finally {
      pdf.fill(0);
      if (job.storagePath !== null && deps.storage) {
        try {
          await deps.storage.remove("audio_uploads", [job.storagePath]);
        } catch (cleanupThrown) {
          const cleanupErr = toAppError(cleanupThrown);
          deps.logger[cleanupErr.logLevel]("worker.storage_cleanup_failed", {
            job_id: job.jobId,
            error_code: cleanupErr.code,
            error_detail: cleanupErr.internalDetail,
          });
        }
      }
    }
  }

  if (job.inputType === "docx" || job.inputType === "txt" || job.inputType === "md") {
    if (job.telegramFileId === null) {
      throw AppError.fileUnavailable("file job had no Telegram file id");
    }
    const telegramFileId = job.telegramFileId;
    const maxBytes = job.inputType === "docx" ? MAX_DOCX_BYTES : MAX_TEXT_DOCUMENT_BYTES;
    if (job.sizeBytes !== null && job.sizeBytes > maxBytes) {
      throw AppError.inputTooLarge("document metadata exceeded its extraction limit");
    }
    await editStatusBestEffort(deps, job, "Document received — extracting and organizing it.");
    const document = await deps.telegram.downloadFile(telegramFileId, maxBytes);
    try {
      await advance(deps, job, "ACQUIRING", "EXTRACTING");
      state.value = "EXTRACTING";
      const sourceText = job.inputType === "docx"
        ? await extractDocxText(document)
        : extractPlainText(document);
      await advance(deps, job, "EXTRACTING", "GENERATING");
      state.value = "GENERATING";
      const generation = await generate(() =>
        deps.provider.generateText({
          sourceText,
          template,
          templateKey,
          reason: "initial",
          outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
        })
      );
      return { generation, sourceText, operation: "generation", documentPages: null };
    } finally {
      document.fill(0);
    }
  }

  if (job.inputType !== "voice" && job.inputType !== "audio") {
    throw AppError.unsupportedInput("worker received an unknown input modality");
  }

  const audioLimit = deps.plans === undefined
    ? { planKey: "free", maxAudioSeconds: MAX_AUDIO_DURATION_SECONDS_FREE }
    : await deps.plans.getAudioLimit(job.userId);
  const planKey = audioLimit.planKey;
  const isProOrAlpha = planKey === "pro" || planKey === "alpha";
  const maxAudioSeconds = isProOrAlpha
    ? audioLimit.maxAudioSeconds
    : (AUDIO_DURATION_BY_PLAN[planKey] ?? MAX_AUDIO_DURATION_SECONDS_FREE);
  const isWebJob = job.storagePath !== null;
  const maxAudioBytes = isProOrAlpha
    ? (isWebJob ? MAX_WEB_AUDIO_BYTES : MAX_LARGE_AUDIO_BYTES)
    : MAX_INLINE_AUDIO_BYTES;
  if (job.sizeBytes !== null && job.sizeBytes > maxAudioBytes) {
    const publicMessage = isProOrAlpha
      ? "That is over the 2-hour limit — split it into parts under 2 hours each."
      : "Voice notes over 30 minutes need Pro — send a shorter clip or split it.";
    throw AppError.inputTooLarge("audio metadata exceeded size limit for plan", { publicMessage });
  }
  if (job.durationSeconds !== null && job.durationSeconds > maxAudioSeconds) {
    const publicMessage = isProOrAlpha
      ? "That is over the 2-hour limit — split it into parts under 2 hours each."
      : "Voice notes over 30 minutes need Pro — send a shorter clip or split it.";
    throw AppError.inputTooLarge("audio duration exceeded plan limit", { publicMessage });
  }

  const reportedMimeType = job.mimeType?.split(";", 1)[0]?.trim().toLowerCase() ||
    (job.inputType === "voice" ? "audio/ogg" : "");
  const mimeType = AUDIO_MIME_ALIASES[reportedMimeType] ?? reportedMimeType;
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    throw AppError.unsupportedInput("audio MIME type is not accepted by the Gemini adapter");
  }

  if (job.storagePath === null && job.telegramFileId === null) {
    throw AppError.fileUnavailable("audio job had no file source");
  }

  await editStatusBestEffort(deps, job, "Audio received — transcribing and organizing it.");
  let audio: Uint8Array;
  if (job.storagePath !== null) {
    if (!deps.storage) {
      throw AppError.internal("storage dependency missing for web audio download");
    }
    audio = await deps.storage.download("audio_uploads", job.storagePath);
    if (audio.byteLength > maxAudioBytes) {
      audio.fill(0);
      const publicMessage = isProOrAlpha
        ? "That is over the 2-hour limit — split it into parts under 2 hours each."
        : "Voice notes over 30 minutes need Pro — send a shorter clip or split it.";
      throw AppError.inputTooLarge("audio download exceeded size limit for plan", {
        publicMessage,
      });
    }
  } else {
    audio = await deps.telegram.downloadFile(job.telegramFileId!, maxAudioBytes);
  }
  try {
    await advance(deps, job, "ACQUIRING", "EXTRACTING");
    state.value = "EXTRACTING";
    await advance(deps, job, "EXTRACTING", "GENERATING");
    state.value = "GENERATING";
    const generation: AudioGenerationResult = await generate(
      async (): Promise<AudioGenerationResult> => {
        if (audio.byteLength <= MAX_INLINE_AUDIO_BYTES) {
          return await deps.provider.generateAudio({
            audio,
            mimeType,
            template,
            templateKey,
            outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
          });
        }

        deps.logger.info("worker.large_audio_routed", {
          job_id: job.jobId,
          user_id: job.userId,
          size_bytes: audio.byteLength,
          duration_seconds: job.durationSeconds,
          plan_key: planKey,
          attempt_count: job.attemptCount,
        });

        if (typeof deps.provider.generateLargeAudio === "function") {
          try {
            return await deps.provider.generateLargeAudio({
              audio,
              mimeType,
              template,
              templateKey,
              outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
              timeoutMs: LARGE_AUDIO_TIMEOUT_MS,
            });
          } catch (thrown) {
            const err = toAppError(thrown);
            const isLargeRouteFailure = err.code === "provider_timeout" ||
              err.code === "provider_rate_limited" ||
              err.code === "output_validation_failed" ||
              (err.code === "provider_error" && /returned 5\d\d/.test(err.internalDetail ?? ""));
            if (!isLargeRouteFailure) {
              throw thrown;
            }
            deps.logger.warn("worker.large_audio_chunk_fallback_triggered", {
              job_id: job.jobId,
              user_id: job.userId,
              error_code: err.code,
              error_detail: err.internalDetail,
              plan_key: planKey,
              attempt_count: job.attemptCount,
            });
          }
        }

        return await processSegmentedAudio(
          deps,
          job,
          audio,
          mimeType,
          template,
          templateKey,
        );
      },
    );
    return {
      generation,
      sourceText: generation.transcript,
      operation: "generation",
      documentPages: null,
    };
  } finally {
    // Best-effort memory scrubbing. It does not replace the no-persistence rule,
    // but shortens the lifetime of raw audio inside a warm isolate.
    audio.fill(0);
    if (job.storagePath !== null && deps.storage) {
      try {
        await deps.storage.remove("audio_uploads", [job.storagePath]);
      } catch (cleanupThrown) {
        const cleanupErr = toAppError(cleanupThrown);
        deps.logger[cleanupErr.logLevel]("worker.storage_cleanup_failed", {
          job_id: job.jobId,
          error_code: cleanupErr.code,
          error_detail: cleanupErr.internalDetail,
        });
      }
    }
  }
}
async function generateAudioSegmentWithRetry(
  deps: JobWorkerDependencies,
  request: AudioGenerationRequest,
): Promise<AudioGenerationResult> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await deps.provider.generateAudio(request);
    } catch (thrown) {
      const error = toAppError(thrown);
      if (attempt === 1 && isTransientProviderFailure(error)) {
        continue;
      }
      throw AppError.inputTooLarge("audio segment failed transcription validation", {
        publicMessage: "That is over the 2-hour limit — split it into parts under 2 hours each.",
      });
    }
  }
}

async function processSegmentedAudio(
  deps: JobWorkerDependencies,
  job: ClaimedProcessingJob & {
    readonly userId: string;
    readonly outputLanguage: NonNullable<ClaimedProcessingJob["outputLanguage"]>;
  },
  audio: Uint8Array,
  mimeType: string,
  template: GenerationTemplate,
  templateKey: TemplateKey,
): Promise<AudioGenerationResult> {
  const segmentCount = Math.ceil(audio.byteLength / LARGE_AUDIO_SEGMENT_BYTES);
  if (segmentCount > MAX_LARGE_AUDIO_SEGMENTS) {
    throw AppError.inputTooLarge("audio segments exceeded maximum chunk count", {
      publicMessage: "That is over the 2-hour limit — split it into parts under 2 hours each.",
    });
  }

  const transcripts: string[] = [];
  let totalInputTokens: number | null = null;
  let totalOutputTokens: number | null = null;
  let lastModel = "gemini";
  let lastProvider = "gemini";
  let lastRequestId: string | null = null;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = Math.max(
      0,
      index * LARGE_AUDIO_SEGMENT_BYTES - (index > 0 ? LARGE_AUDIO_SEGMENT_OVERLAP_BYTES : 0),
    );
    const end = Math.min(audio.byteLength, (index + 1) * LARGE_AUDIO_SEGMENT_BYTES);
    const segmentBytes = new Uint8Array(end - start);
    segmentBytes.set(audio.subarray(start, end));

    let segmentResult: AudioGenerationResult;
    try {
      segmentResult = await generateAudioSegmentWithRetry(deps, {
        audio: segmentBytes,
        mimeType,
        template,
        templateKey,
        outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
        timeoutMs: SEGMENT_AUDIO_TIMEOUT_MS,
      });
    } finally {
      segmentBytes.fill(0);
    }

    transcripts.push(segmentResult.transcript.trim());
    if (segmentResult.inputTokens !== null) {
      totalInputTokens = (totalInputTokens ?? 0) + segmentResult.inputTokens;
    }
    if (segmentResult.outputTokens !== null) {
      totalOutputTokens = (totalOutputTokens ?? 0) + segmentResult.outputTokens;
    }
    lastModel = segmentResult.model;
    lastProvider = segmentResult.provider;
    lastRequestId = segmentResult.providerRequestId;
  }

  const concatenatedTranscript = transcripts.filter(Boolean).join("\n\n");
  const textResult = await deps.provider.generateText({
    sourceText: concatenatedTranscript,
    template,
    templateKey,
    reason: "initial",
    outputLanguage: job.outputLanguage === "mirror" ? null : job.outputLanguage,
  });

  return {
    transcript: concatenatedTranscript,
    note: textResult.note,
    provider: textResult.provider ?? lastProvider,
    model: textResult.model ?? lastModel,
    providerRequestId: textResult.providerRequestId ?? lastRequestId,
    inputTokens: (totalInputTokens ?? 0) + (textResult.inputTokens ?? 0) || null,
    outputTokens: (totalOutputTokens ?? 0) + (textResult.outputTokens ?? 0) || null,
  };
}

async function handleFailure(
  deps: JobWorkerDependencies,
  message: ProcessingQueueMessage,
  job: ClaimedProcessingJob & { readonly userId: string; readonly chatId: number | null },
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
      safeFailureDetail(error, state),
    );
    await editStatusBestEffort(deps, job, error.publicMessage);
    return "retrying";
  }

  await deps.jobs.fail(
    job.userId,
    job.jobId,
    state,
    error.code.toUpperCase(),
    safeFailureDetail(error, state),
  );
  await deps.jobs.deleteQueueMessage(message.queueMessageId);
  if (job.chatId !== null) {
    if (job.statusMessageId === null) {
      await deps.telegram.sendMessage(job.chatId, error.publicMessage);
    } else {
      await editStatusBestEffort(deps, job, error.publicMessage);
    }
  }
  if (job.storagePath !== null && deps.storage) {
    try {
      await deps.storage.remove("audio_uploads", [job.storagePath]);
    } catch (cleanupThrown) {
      const cleanupErr = toAppError(cleanupThrown);
      deps.logger[cleanupErr.logLevel]("worker.storage_cleanup_failed", {
        job_id: job.jobId,
        error_code: cleanupErr.code,
        error_detail: cleanupErr.internalDetail,
      });
    }
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
        documentPages: generated.documentPages,
        operation: generated.operation,
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
