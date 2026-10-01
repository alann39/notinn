import { assert, assertEquals } from "@std/assert";
import type { JobState } from "../../supabase/functions/_shared/config/constants.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import type { NoteAIProvider } from "../../supabase/functions/_shared/providers/note-ai.provider.ts";
import type { PersistNoteInput } from "../../supabase/functions/_shared/repositories/notes.repository.ts";
import type { ClaimedProcessingJob } from "../../supabase/functions/_shared/repositories/processing-jobs.repository.ts";
import { processQueueMessage } from "../../supabase/functions/_shared/services/job-worker.service.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

const JOB_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "33333333-3333-4333-8333-333333333333";
const OUTPUT_ID = "44444444-4444-4444-8444-444444444444";

function claimed(overrides: Partial<ClaimedProcessingJob> = {}): ClaimedProcessingJob {
  return {
    outcome: "claimed",
    jobId: JOB_ID,
    userId: USER_ID,
    chatId: 900_000_001,
    statusMessageId: 42,
    inputType: "text",
    telegramFileId: null,
    storagePath: null,
    sourceText: "Synthetic source text.",
    mimeType: null,
    sizeBytes: null,
    durationSeconds: null,
    templateKey: "clean_note",
    outputLanguage: "mirror",
    privacyMode: "balanced",
    state: "ACQUIRING",
    attemptCount: 0,
    noteId: null,
    queueMessageId: 7,
    ...overrides,
  };
}

function harness(
  job: ClaimedProcessingJob,
  options: {
    providerError?: AppError;
    providerLargeAudioError?: AppError;
    quotaError?: AppError;
    fileError?: AppError;
    deliveryError?: AppError;
    fileBytes?: Uint8Array;
    planKey?: string;
    maxAudioSeconds?: number;
    audioTranscripts?: string[];
    storageBytes?: Uint8Array;
    storageError?: AppError;
  } = {},
) {
  const transitions: [JobState, JobState][] = [];
  const deleted: number[] = [];
  const retryable: JobState[] = [];
  const retryDetails: string[] = [];
  const failed: JobState[] = [];
  const staged: PersistNoteInput[] = [];
  const edits: string[] = [];
  const sends: string[] = [];
  const usage: unknown[] = [];
  const quotaEvents: string[] = [];
  const deliveries: number[][] = [];
  const storageDownloads: { bucket: string; path: string }[] = [];
  const storageRemoves: { bucket: string; paths: readonly string[] }[] = [];
  const audio = options.fileBytes ?? options.storageBytes ?? new Uint8Array([1, 2, 3, 4]);
  const audioTranscripts = options.audioTranscripts ? [...options.audioTranscripts] : [];
  let sourceType = job.inputType ?? "text";
  let sourceText = job.sourceText;
  let providerTextCalls = 0;
  let providerAudioCalls = 0;
  let providerLargeAudioCalls = 0;
  let providerImageCalls = 0;
  let providerPdfCalls = 0;
  const note = structuredNoteFixture({ template_key: "clean_note" });
  const { logger, lines } = createCapturingLogger({ level: "debug" });

  const provider: NoteAIProvider = {
    generateText: () => {
      providerTextCalls += 1;
      if (options.providerError !== undefined) return Promise.reject(options.providerError);
      return Promise.resolve({
        note,
        provider: "gemini",
        model: "gemini-synthetic-flash",
        providerRequestId: "request-text",
        inputTokens: 10,
        outputTokens: 20,
      });
    },
    generateAudio: () => {
      providerAudioCalls += 1;
      if (options.providerError !== undefined) return Promise.reject(options.providerError);
      const transcript = audioTranscripts.shift() ?? "Synthetic transcript.";
      return Promise.resolve({
        transcript,
        note,
        provider: "gemini",
        model: "gemini-synthetic-flash",
        providerRequestId: "request-audio",
        inputTokens: 30,
        outputTokens: 40,
      });
    },
    generateLargeAudio: () => {
      providerLargeAudioCalls += 1;
      if (options.providerLargeAudioError !== undefined) {
        return Promise.reject(options.providerLargeAudioError);
      }
      return Promise.resolve({
        transcript: "Synthetic large transcript.",
        note,
        provider: "gemini",
        model: "gemini-synthetic-flash",
        providerRequestId: "request-large-audio",
        inputTokens: 100,
        outputTokens: 50,
      });
    },
    generateImage: () => {
      providerImageCalls += 1;
      if (options.providerError !== undefined) return Promise.reject(options.providerError);
      return Promise.resolve({
        extractedText: "Synthetic image text.",
        note,
        provider: "gemini",
        model: "gemini-synthetic-flash",
        providerRequestId: "request-image",
        inputTokens: 50,
        outputTokens: 20,
      });
    },
    generatePdf: () => {
      providerPdfCalls += 1;
      if (options.providerError !== undefined) return Promise.reject(options.providerError);
      return Promise.resolve({
        extractedText: "Synthetic PDF text.",
        documentPages: 2,
        note,
        provider: "gemini",
        model: "gemini-synthetic-flash",
        providerRequestId: "request-pdf",
        inputTokens: 60,
        outputTokens: 20,
      });
    },
  };

  const deps = {
    jobs: {
      readQueue: () => Promise.resolve([]),
      findQueueMessageId: () => Promise.resolve(7),
      claim: () => Promise.resolve(job),
      advance: (
        _userId: string,
        _jobId: string,
        expected: JobState,
        next: JobState,
      ) => {
        transitions.push([expected, next]);
        return Promise.resolve({ outcome: "advanced" as const, state: next });
      },
      markRetryable: (
        _userId: string,
        _jobId: string,
        expected: JobState,
        _code: string,
        _detail: string,
      ) => {
        retryable.push(expected);
        retryDetails.push(_detail);
        return Promise.resolve({ outcome: "updated" as const, state: "RETRYABLE_FAILED" as const });
      },
      fail: (
        _userId: string,
        _jobId: string,
        expected: JobState,
      ) => {
        failed.push(expected);
        return Promise.resolve(true);
      },
      complete: () => Promise.resolve(true),
      deleteQueueMessage: (id: number) => {
        deleted.push(id);
        return Promise.resolve(true);
      },
    },
    notes: {
      stageNoteForDelivery: (input: PersistNoteInput) => {
        staged.push(input);
        sourceType = input.sourceType;
        sourceText = input.normalizedSourceText;
        return Promise.resolve({
          outcome: "created" as const,
          noteId: NOTE_ID,
          outputId: OUTPUT_ID,
        });
      },
      findNoteForDisplay: () =>
        Promise.resolve({
          noteId: NOTE_ID,
          renderedText: "stored rendering",
          contentJson: note,
          templateKey: "clean_note",
          isSaved: false,
          sourceType,
        }),
      findNoteForRegeneration: () =>
        Promise.resolve({
          noteId: NOTE_ID,
          language: "en",
          sourceType,
          sourceText,
          templateKey: "clean_note",
        }),
    },
    workflow: {
      registerDelivery: (
        _userId: string,
        _noteId: string,
        _chatId: number,
        messageIds: readonly number[],
      ) => {
        deliveries.push([...messageIds]);
        return Promise.resolve({ outcome: "created" as const, deliveryId: OUTPUT_ID });
      },
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
    usage: {
      recordGeneration: (input: unknown) => {
        usage.push(input);
        return Promise.resolve();
      },
    },
    quota: {
      reserve: () => {
        quotaEvents.push("reserve");
        if (options.quotaError !== undefined) return Promise.reject(options.quotaError);
        return Promise.resolve({
          reservationId: "55555555-5555-4555-8555-555555555555",
          outcome: "reserved" as const,
        });
      },
      consume: () => {
        quotaEvents.push("consume");
        return Promise.resolve();
      },
      release: () => {
        quotaEvents.push("release");
        return Promise.resolve();
      },
    },
    provider,
    telegram: {
      sendMessage: (_chatId: number, text: string) => {
        sends.push(text);
        return options.deliveryError === undefined
          ? Promise.resolve({ messageId: 100 })
          : Promise.reject(options.deliveryError);
      },
      answerCallbackQuery: () => Promise.resolve(true),
      editMessageReplyMarkup: () => Promise.resolve(true),
      editMessageText: (_chatId: number, _messageId: number, text: string) => {
        edits.push(text);
        return options.deliveryError === undefined
          ? Promise.resolve(true)
          : Promise.reject(options.deliveryError);
      },
      deleteMessages: (_chatId: number, messageIds: readonly number[]) => {
        deleted.push(...messageIds);
        return Promise.resolve(true);
      },
      downloadFile: () =>
        options.fileError === undefined
          ? Promise.resolve(audio)
          : Promise.reject(options.fileError),
    },
    plans: {
      getAudioLimit: (_userId: string) => {
        const planKey = options.planKey ?? "free";
        const maxAudioSeconds = options.maxAudioSeconds ??
          (planKey === "pro" || planKey === "alpha" ? 7200 : 1800);
        return Promise.resolve({ planKey, maxAudioSeconds });
      },
    },
    storage: {
      download: (bucket: string, path: string) => {
        storageDownloads.push({ bucket, path });
        if (options.storageError !== undefined) {
          return Promise.reject(options.storageError);
        }
        return Promise.resolve(options.storageBytes ?? audio);
      },
      remove: (bucket: string, paths: readonly string[]) => {
        storageRemoves.push({ bucket, paths });
        return Promise.resolve();
      },
    },
    logger,
  };

  return {
    deps,
    transitions,
    deleted,
    retryable,
    retryDetails,
    failed,
    staged,
    edits,
    sends,
    usage,
    quotaEvents,
    deliveries,
    storageDownloads,
    storageRemoves,
    lines,
    audio,
    providerCalls: () => ({
      text: providerTextCalls,
      audio: providerAudioCalls,
      image: providerImageCalls,
      pdf: providerPdfCalls,
    }),
    largeAudioCalls: () => providerLargeAudioCalls,
  };
}

Deno.test("the worker completes a queued text note and acknowledges its queue message", async () => {
  const test = harness(claimed());

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.transitions, [
    ["ACQUIRING", "EXTRACTING"],
    ["EXTRACTING", "GENERATING"],
    ["GENERATING", "DELIVERING"],
  ]);
  assertEquals(test.providerCalls(), { text: 1, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.staged.length, 1);
  assertEquals(test.deleted, [7]);
  assertEquals(test.retryable, []);
  assertEquals(test.quotaEvents, ["reserve", "consume"]);
});

Deno.test("voice audio is transcribed inline, returned for review and scrubbed from memory", async () => {
  const test = harness(claimed({
    inputType: "voice",
    sourceText: null,
    telegramFileId: "synthetic-file-id",
    mimeType: "audio/ogg",
    sizeBytes: 4,
    durationSeconds: 12,
  }));

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 0, audio: 1, image: 0, pdf: 0 });
  assertEquals(test.staged[0]?.normalizedSourceText, "Synthetic transcript.");
  assertEquals(test.audio, new Uint8Array([0, 0, 0, 0]));
  // Transcripts are delivered on-demand via [📜 Lihat Transkrip] rather than prepended to the initial note
  assertEquals(test.edits.some((text) => text.includes("Transcript")), false);
  assertEquals(test.usage.length, 1);
});

Deno.test("a delivery retry reuses the staged note without another Gemini call", async () => {
  const test = harness(claimed({ noteId: NOTE_ID }));

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 2, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.staged, []);
  assertEquals(test.deleted, [7]);
});

Deno.test("a failed Telegram delivery retains the staged note for retry", async () => {
  const test = harness(claimed(), {
    deliveryError: AppError.telegramError("synthetic delivery failure"),
  });

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "retrying");
  assertEquals(test.staged.length, 1);
  assertEquals(test.retryable, ["DELIVERING"]);
  assertEquals(test.deleted, []);
});

Deno.test("a transient provider failure remains queued for retry", async () => {
  const test = harness(claimed(), { providerError: AppError.providerRateLimited("synthetic") });

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "retrying");
  assertEquals(test.retryable, ["GENERATING"]);
  assertEquals(test.deleted, []);
  assertEquals(test.staged, []);
  assertEquals(test.edits, [
    "I'm a little busy right now. I'll retry automatically in about 5 minutes—no need to send it again.",
  ]);
  assertEquals(test.sends, []);
  assertEquals(test.quotaEvents, ["reserve", "release"]);
});

Deno.test("an exhausted note quota fails before the provider and is not retried", async () => {
  const test = harness(claimed(), {
    quotaError: AppError.quotaExceeded("synthetic allowance exhausted"),
  });

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "discarded");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.quotaEvents, ["reserve"]);
  assertEquals(test.failed, ["GENERATING"]);
  assertEquals(test.retryable, []);
  assertEquals(
    [...test.edits, ...test.sends].some((text) => text.includes("plan's limit")),
    true,
  );
});

Deno.test("a provider HTTP status is retained without its response body", async () => {
  const test = harness(claimed(), {
    providerError: AppError.providerError("gemini interaction returned 400"),
  });

  await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(test.retryDetails, ["Worker generating failure; Gemini HTTP 400"]);
  assertEquals(test.quotaEvents, ["reserve", "release"]);
});

Deno.test("a missing Telegram audio file fails permanently and requests a resend", async () => {
  const test = harness(
    claimed({
      inputType: "voice",
      sourceText: null,
      telegramFileId: "expired-file-id",
      mimeType: "audio/ogg",
    }),
    { fileError: AppError.fileUnavailable("synthetic missing") },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "discarded");
  assertEquals(test.failed, ["ACQUIRING"]);
  assertEquals(test.deleted, [7]);
  assertEquals(test.edits.some((text) => text.includes("send it again")), true);
});

Deno.test("free audio beyond 1800 s is rejected before download with upgrade advice", async () => {
  const test = harness(
    claimed({
      inputType: "audio",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/mpeg",
      durationSeconds: 1_801,
    }),
    { planKey: "free", maxAudioSeconds: 1800 },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "discarded");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.largeAudioCalls(), 0);
  assertEquals(test.failed, ["ACQUIRING"]);
  assertEquals(test.deleted, [7]);
  assertEquals(
    [...test.edits, ...test.sends].some((text) =>
      text.includes("Voice notes over 30 minutes need Pro — send a shorter clip or split it.")
    ),
    true,
  );
});

Deno.test("pro audio up to 7200 s (7199 s) passes duration gate", async () => {
  const test = harness(
    claimed({
      inputType: "voice",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/ogg",
      sizeBytes: 100,
      durationSeconds: 7_199,
    }),
    { planKey: "pro", maxAudioSeconds: 7200 },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 0, audio: 1, image: 0, pdf: 0 });
  assertEquals(test.largeAudioCalls(), 0);
});

Deno.test("pro audio beyond 7200 s (7201 s) is rejected before download with split advice", async () => {
  const test = harness(
    claimed({
      inputType: "audio",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/mpeg",
      durationSeconds: 7_201,
    }),
    { planKey: "pro", maxAudioSeconds: 7200 },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "discarded");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.largeAudioCalls(), 0);
  assertEquals(test.failed, ["ACQUIRING"]);
  assertEquals(test.deleted, [7]);
  assertEquals(
    [...test.edits, ...test.sends].some((text) =>
      text.includes("That is over the 2-hour limit — split it into parts under 2 hours each.")
    ),
    true,
  );
});

Deno.test("alpha audio mirrors pro limits (7199 s passes, 7201 s rejected with split advice)", async () => {
  const passTest = harness(
    claimed({
      inputType: "voice",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/ogg",
      sizeBytes: 100,
      durationSeconds: 7_199,
    }),
    { planKey: "alpha", maxAudioSeconds: 7200 },
  );

  const passOutcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    passTest.deps,
  );
  assertEquals(passOutcome, "completed");

  const rejectTest = harness(
    claimed({
      inputType: "voice",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/ogg",
      sizeBytes: 100,
      durationSeconds: 7_201,
    }),
    { planKey: "alpha", maxAudioSeconds: 7200 },
  );

  const rejectOutcome = await processQueueMessage(
    { queueMessageId: 8, readCount: 1, jobId: JOB_ID },
    rejectTest.deps,
  );
  assertEquals(rejectOutcome, "discarded");
  assertEquals(rejectTest.failed, ["ACQUIRING"]);
  assertEquals(
    [...rejectTest.edits, ...rejectTest.sends].some((text) =>
      text.includes("That is over the 2-hour limit — split it into parts under 2 hours each.")
    ),
    true,
  );
});

Deno.test("audio under inline ceiling (<= 14 MiB) uses inline generateAudio", async () => {
  const test = harness(
    claimed({
      inputType: "voice",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/ogg",
      sizeBytes: 10 * 1024 * 1024,
      durationSeconds: 300,
    }),
    {
      planKey: "pro",
      fileBytes: new Uint8Array(10 * 1024 * 1024),
    },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 0, audio: 1, image: 0, pdf: 0 });
  assertEquals(test.largeAudioCalls(), 0);
});

Deno.test("entitled large audio (>14 MiB, <= 20 MiB) routes to generateLargeAudio, never inline", async () => {
  const test = harness(
    claimed({
      inputType: "voice",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/ogg",
      sizeBytes: 19_000_000,
      durationSeconds: 7_199,
    }),
    {
      planKey: "pro",
      maxAudioSeconds: 7200,
      fileBytes: new Uint8Array(15 * 1024 * 1024),
    },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.largeAudioCalls(), 1);
  assertEquals(test.staged[0]?.normalizedSourceText, "Synthetic large transcript.");
});

Deno.test("large audio route failure falls back to chunked segmentation and single generateText call", async () => {
  const test = harness(
    claimed({
      inputType: "voice",
      sourceText: null,
      telegramFileId: "synthetic-file-id",
      mimeType: "audio/ogg",
      sizeBytes: 15 * 1024 * 1024,
      durationSeconds: 5_000,
    }),
    {
      planKey: "pro",
      maxAudioSeconds: 7200,
      fileBytes: new Uint8Array(15 * 1024 * 1024),
      providerLargeAudioError: AppError.providerTimeout("synthetic timeout"),
      audioTranscripts: ["Segment 1 transcript.", "Segment 2 transcript."],
    },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.largeAudioCalls(), 1);
  assertEquals(test.providerCalls(), { text: 1, audio: 2, image: 0, pdf: 0 });
  assertEquals(
    test.staged[0]?.normalizedSourceText,
    "Segment 1 transcript.\n\nSegment 2 transcript.",
  );
  assertEquals(test.quotaEvents, ["reserve", "consume"]);
});

Deno.test("quota lifecycle: reserve -> release on failure, reserve -> consume on success", async () => {
  // 1. Failure path: reserve -> release
  const failTest = harness(claimed(), {
    providerError: AppError.providerError("provider failure"),
  });
  await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    failTest.deps,
  );
  assertEquals(failTest.quotaEvents, ["reserve", "release"]);

  // 2. Success path: reserve -> consume
  const successTest = harness(claimed());
  const outcome = await processQueueMessage(
    { queueMessageId: 8, readCount: 1, jobId: JOB_ID },
    successTest.deps,
  );
  assertEquals(outcome, "completed");
  assertEquals(successTest.quotaEvents, ["reserve", "consume"]);
});

Deno.test("an image is validated, summarized inline, and scrubbed", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const test = harness(
    claimed({
      inputType: "image",
      sourceText: null,
      telegramFileId: "synthetic-image-id",
      mimeType: "image/jpeg",
      sizeBytes: bytes.length,
    }),
    { fileBytes: bytes },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 1, pdf: 0 });
  assertEquals(test.staged[0]?.normalizedSourceText, "Synthetic image text.");
  assertEquals(bytes.every((value) => value === 0), true);
  assertEquals((test.usage[0] as { operation: string }).operation, "vision");
});

Deno.test("an invalid image is rejected and still scrubbed", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const test = harness(
    claimed({
      inputType: "image",
      sourceText: null,
      telegramFileId: "synthetic-image-id",
      mimeType: "image/jpeg",
      sizeBytes: bytes.length,
    }),
    { fileBytes: bytes },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "discarded");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.failed, ["ACQUIRING"]);
  assertEquals(bytes.every((value) => value === 0), true);
});

Deno.test("a PDF is processed as a document and records observed pages", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic\n%%EOF");
  const test = harness(
    claimed({
      inputType: "pdf",
      sourceText: null,
      telegramFileId: "synthetic-pdf-id",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
    }),
    { fileBytes: bytes },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 1 });
  assertEquals(test.staged[0]?.normalizedSourceText, "Synthetic PDF text.");
  assertEquals((test.usage[0] as { documentPages: number }).documentPages, 2);
  assertEquals(bytes.every((value) => value === 0), true);
});

Deno.test("a UTF-8 text document is extracted locally before generation", async () => {
  const bytes = new TextEncoder().encode("  First line\r\nSecond line  ");
  const test = harness(
    claimed({
      inputType: "txt",
      sourceText: null,
      telegramFileId: "synthetic-text-id",
      mimeType: "text/plain",
      sizeBytes: bytes.length,
    }),
    { fileBytes: bytes },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "completed");
  assertEquals(test.providerCalls(), { text: 1, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.staged[0]?.normalizedSourceText, "First line\nSecond line");
  assertEquals(bytes.every((value) => value === 0), true);
});

Deno.test("web audio job with storagePath downloads from storage, routes through generateLargeAudio, skips Telegram delivery, stages note successfully, and deletes storage object", async () => {
  const storageAudio = new Uint8Array(48 * 1024 * 1024);
  storageAudio[0] = 42;
  const test = harness(
    claimed({
      inputType: "audio",
      chatId: null,
      statusMessageId: null,
      telegramFileId: null,
      storagePath: `${USER_ID}/meeting-recording.mp3`,
      mimeType: "audio/mpeg",
      sizeBytes: storageAudio.length,
      durationSeconds: 3600,
    }),
    {
      planKey: "pro",
      maxAudioSeconds: 7200,
      storageBytes: storageAudio,
    },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );
  assertEquals(outcome, "completed");
  assertEquals(test.largeAudioCalls(), 1);
  assertEquals(test.staged.length, 1);
  assertEquals(test.staged[0]?.sourceType, "audio");
  assertEquals(test.staged[0]?.normalizedSourceText, "Synthetic large transcript.");
  assertEquals(test.deliveries.length, 0); // Skipped Telegram delivery
  assertEquals(test.sends.length, 0); // No Telegram messages sent
  assertEquals(test.storageDownloads.length, 1);
  assertEquals(test.storageDownloads[0]?.bucket, "audio_uploads");
  assertEquals(test.storageDownloads[0]?.path, `${USER_ID}/meeting-recording.mp3`);
  assertEquals(test.storageRemoves.length, 1);
  assertEquals(test.storageRemoves[0]?.bucket, "audio_uploads");
  assertEquals(test.storageRemoves[0]?.paths, [`${USER_ID}/meeting-recording.mp3`]);
  assertEquals(storageAudio[0], 0); // Audio buffer was scrubbed
});
Deno.test(
  "web audio job with chatId delivers note pages and keyboard to Telegram, registers delivery, scrubs audio, and deletes storage object",
  async () => {
    const storageAudio = new Uint8Array(48 * 1024 * 1024);
    storageAudio[0] = 42;
    const test = harness(
      claimed({
        inputType: "audio",
        chatId: 900_000_001,
        statusMessageId: null,
        telegramFileId: null,
        storagePath: `${USER_ID}/meeting-recording.mp3`,
        mimeType: "audio/mpeg",
        sizeBytes: storageAudio.length,
        durationSeconds: 3600,
      }),
      {
        planKey: "pro",
        maxAudioSeconds: 7200,
        storageBytes: storageAudio,
      },
    );

    const outcome = await processQueueMessage(
      { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
      test.deps,
    );
    assertEquals(outcome, "completed");
    assertEquals(test.largeAudioCalls(), 1);
    assertEquals(test.staged.length, 1);
    assertEquals(test.staged[0]?.sourceType, "audio");
    assertEquals(test.staged[0]?.normalizedSourceText, "Synthetic large transcript.");
    assertEquals(test.deliveries.length, 1); // Telegram delivery registered
    assert(test.sends.length >= 1); // Note pages delivered to Telegram
    assertEquals(test.storageDownloads.length, 1);
    assertEquals(test.storageDownloads[0]?.bucket, "audio_uploads");
    assertEquals(test.storageDownloads[0]?.path, `${USER_ID}/meeting-recording.mp3`);
    assertEquals(test.storageRemoves.length, 1);
    assertEquals(test.storageRemoves[0]?.bucket, "audio_uploads");
    assertEquals(test.storageRemoves[0]?.paths, [`${USER_ID}/meeting-recording.mp3`]);
    assertEquals(storageAudio[0], 0); // Audio buffer was scrubbed
  },
);

Deno.test("web audio job failure scrubs audio and storage object without throwing unhandled exceptions or sending Telegram messages", async () => {
  const storageAudio = new Uint8Array(20 * 1024 * 1024);
  storageAudio[0] = 99;
  const test = harness(
    claimed({
      inputType: "audio",
      chatId: null,
      statusMessageId: null,
      telegramFileId: null,
      storagePath: `${USER_ID}/corrupted-audio.mp3`,
      mimeType: "audio/mpeg",
      sizeBytes: storageAudio.length,
      durationSeconds: 1800,
    }),
    {
      planKey: "pro",
      maxAudioSeconds: 7200,
      storageBytes: storageAudio,
      providerLargeAudioError: AppError.outputValidationFailed("synthetic validation failure"),
      providerError: AppError.outputValidationFailed("synthetic validation failure"),
    },
  );

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "discarded");
  assertEquals(test.sends.length, 0); // No Telegram messages sent
  assertEquals(test.failed.length, 1);
  assertEquals(test.storageRemoves.length >= 1, true);
  assertEquals(test.storageRemoves[0]?.bucket, "audio_uploads");
  assertEquals(test.storageRemoves[0]?.paths, [`${USER_ID}/corrupted-audio.mp3`]);
  assertEquals(storageAudio[0], 0); // Audio buffer was scrubbed
});

Deno.test(
  "web image job with storagePath downloads from storage, generates image note, stages note successfully, and deletes storage object",
  async () => {
    const storageImage = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
    const test = harness(
      claimed({
        inputType: "image",
        chatId: null,
        statusMessageId: null,
        telegramFileId: null,
        storagePath: `${USER_ID}/uploaded-receipt.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: storageImage.length,
      }),
      {
        storageBytes: storageImage,
      },
    );

    const outcome = await processQueueMessage(
      { queueMessageId: 8, readCount: 1, jobId: JOB_ID },
      test.deps,
    );

    assertEquals(outcome, "completed");
    assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 1, pdf: 0 });
    assertEquals(test.staged.length, 1);
    assertEquals(test.staged[0]?.sourceType, "image");
    assertEquals(test.deliveries.length, 0);
    assertEquals(test.sends.length, 0);
    assertEquals(test.storageDownloads.length, 1);
    assertEquals(test.storageDownloads[0]?.bucket, "audio_uploads");
    assertEquals(test.storageDownloads[0]?.path, `${USER_ID}/uploaded-receipt.jpg`);
    assertEquals(test.storageRemoves.length, 1);
    assertEquals(test.storageRemoves[0]?.bucket, "audio_uploads");
    assertEquals(test.storageRemoves[0]?.paths, [`${USER_ID}/uploaded-receipt.jpg`]);
    assertEquals(storageImage.every((value) => value === 0), true);
  },
);

Deno.test(
  "web pdf job with storagePath downloads from storage, generates pdf note, stages note successfully, and deletes storage object",
  async () => {
    const storagePdf = new TextEncoder().encode("%PDF-1.7\nsynthetic\n%%EOF");
    const test = harness(
      claimed({
        inputType: "pdf",
        chatId: null,
        statusMessageId: null,
        telegramFileId: null,
        storagePath: `${USER_ID}/document.pdf`,
        mimeType: "application/pdf",
        sizeBytes: storagePdf.length,
      }),
      {
        storageBytes: storagePdf,
      },
    );

    const outcome = await processQueueMessage(
      { queueMessageId: 9, readCount: 1, jobId: JOB_ID },
      test.deps,
    );

    assertEquals(outcome, "completed");
    assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 1 });
    assertEquals(test.staged.length, 1);
    assertEquals(test.staged[0]?.sourceType, "pdf");
    assertEquals(test.deliveries.length, 0);
    assertEquals(test.sends.length, 0);
    assertEquals(test.storageDownloads.length, 1);
    assertEquals(test.storageDownloads[0]?.bucket, "audio_uploads");
    assertEquals(test.storageDownloads[0]?.path, `${USER_ID}/document.pdf`);
    assertEquals(test.storageRemoves.length, 1);
    assertEquals(test.storageRemoves[0]?.bucket, "audio_uploads");
    assertEquals(test.storageRemoves[0]?.paths, [`${USER_ID}/document.pdf`]);
    assertEquals(storagePdf.every((value) => value === 0), true);
  },
);

Deno.test(
  "web direct text job with sourceText and no chatId/storagePath processes directly without downloading or Telegram sends",
  async () => {
    const test = harness(
      claimed({
        inputType: "text",
        chatId: null,
        statusMessageId: null,
        telegramFileId: null,
        storagePath: null,
        sourceText: "Meeting notes: discussed Q4 roadmap and deliverables.",
        mimeType: "text/plain",
        sizeBytes: 54,
      }),
    );

    const outcome = await processQueueMessage(
      { queueMessageId: 10, readCount: 1, jobId: JOB_ID },
      test.deps,
    );

    assertEquals(outcome, "completed");
    assertEquals(test.providerCalls(), { text: 1, audio: 0, image: 0, pdf: 0 });
    assertEquals(test.staged.length, 1);
    assertEquals(test.staged[0]?.sourceType, "text");
    assertEquals(
      test.staged[0]?.normalizedSourceText,
      "Meeting notes: discussed Q4 roadmap and deliverables.",
    );
    assertEquals(test.deliveries.length, 0);
    assertEquals(test.sends.length, 0);
    assertEquals(test.storageDownloads.length, 0);
    assertEquals(test.storageRemoves.length, 0);
  },
);
