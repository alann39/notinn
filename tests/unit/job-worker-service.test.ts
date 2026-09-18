import { assertEquals } from "@std/assert";
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
    sourceText: "Synthetic source text.",
    mimeType: null,
    sizeBytes: null,
    durationSeconds: null,
    templateKey: "clean_note",
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
    fileError?: AppError;
    deliveryError?: AppError;
    fileBytes?: Uint8Array;
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
  const audio = options.fileBytes ?? new Uint8Array([1, 2, 3, 4]);
  let sourceType = job.inputType ?? "text";
  let sourceText = job.sourceText;
  let providerTextCalls = 0;
  let providerAudioCalls = 0;
  let providerImageCalls = 0;
  let providerPdfCalls = 0;
  const note = structuredNoteFixture({ template_key: "clean_note" });
  const { logger } = createCapturingLogger({ level: "debug" });

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
      return Promise.resolve({
        transcript: "Synthetic transcript.",
        note,
        provider: "gemini",
        model: "gemini-synthetic-flash",
        providerRequestId: "request-audio",
        inputTokens: 30,
        outputTokens: 40,
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
      listSystemLabels: () => Promise.resolve(new Map([["clean_note", "Clean Note"]])),
    },
    usage: {
      recordGeneration: (input: unknown) => {
        usage.push(input);
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
      downloadFile: () =>
        options.fileError === undefined
          ? Promise.resolve(audio)
          : Promise.reject(options.fileError),
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
    audio,
    providerCalls: () => ({
      text: providerTextCalls,
      audio: providerAudioCalls,
      image: providerImageCalls,
      pdf: providerPdfCalls,
    }),
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
  assertEquals(test.edits.some((text) => text.includes("Transcript")), true);
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

Deno.test("audio beyond the alpha duration limit is rejected before download", async () => {
  const test = harness(claimed({
    inputType: "audio",
    sourceText: null,
    telegramFileId: "synthetic-file-id",
    mimeType: "audio/mpeg",
    durationSeconds: 1_801,
  }));

  const outcome = await processQueueMessage(
    { queueMessageId: 7, readCount: 1, jobId: JOB_ID },
    test.deps,
  );

  assertEquals(outcome, "discarded");
  assertEquals(test.providerCalls(), { text: 0, audio: 0, image: 0, pdf: 0 });
  assertEquals(test.failed, ["ACQUIRING"]);
  assertEquals(test.deleted, [7]);
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
