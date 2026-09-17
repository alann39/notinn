import { assertEquals, assertRejects } from "@std/assert";
import type { JobState } from "../../supabase/functions/_shared/config/constants.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import type { NoteGenerationResult } from "../../supabase/functions/_shared/providers/note-ai.provider.ts";
import type { PersistNoteInput } from "../../supabase/functions/_shared/repositories/notes.repository.ts";
import { createTextNote } from "../../supabase/functions/_shared/services/text-note.service.ts";
import type { AcceptedMessage } from "../../supabase/functions/_shared/telegram/parse-update.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "33333333-3333-4333-8333-333333333333";
const OUTPUT_ID = "44444444-4444-4444-8444-444444444444";

const message: AcceptedMessage = {
  updateId: 900_000_001,
  telegramUserId: 900_000_001,
  telegramChatId: 900_000_001,
  telegramUsername: null,
  displayName: "Synthetic User",
  messageId: 1,
  inputType: "text",
  templateKey: "clean_note",
  routingReason: "text",
  forwarded: false,
  sourceText: "Synthetic source text.",
  telegramFileId: null,
  telegramFileUniqueId: null,
  originalFilename: null,
  mimeType: null,
  sizeBytes: null,
  durationSeconds: null,
};

const generation: NoteGenerationResult = {
  note: structuredNoteFixture(),
  provider: "gemini",
  model: "gemini-synthetic-flash",
  providerRequestId: "synthetic-request-id",
  inputTokens: 20,
  outputTokens: 30,
};

function harness(providerResult: NoteGenerationResult | AppError = generation) {
  const transitions: [JobState, JobState][] = [];
  const retryable: JobState[] = [];
  const sent: { text: string; hasKeyboard: boolean }[] = [];
  const usage: unknown[] = [];
  const persisted: PersistNoteInput[] = [];
  const { logger } = createCapturingLogger({ level: "debug" });

  const deps = {
    jobs: {
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
        return Promise.resolve({ outcome: "updated" as const, state: "RETRYABLE_FAILED" as const });
      },
    },
    notes: {
      persistNote: (input: PersistNoteInput) => {
        persisted.push(input);
        return Promise.resolve({
          outcome: "created" as const,
          noteId: NOTE_ID,
          outputId: OUTPUT_ID,
        });
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
      listSystemLabels: () => Promise.resolve(new Map([["clean_note", "Clean Note"]])),
    },
    usage: {
      recordGeneration: (input: unknown) => {
        usage.push(input);
        return Promise.resolve();
      },
    },
    provider: {
      generateText: () =>
        providerResult instanceof AppError
          ? Promise.reject(providerResult)
          : Promise.resolve(providerResult),
    },
    telegram: {
      sendMessage: (_chatId: number, text: string, options?: { inlineKeyboard?: unknown }) => {
        sent.push({ text, hasKeyboard: options?.inlineKeyboard !== undefined });
        return Promise.resolve({ messageId: 10 });
      },
      answerCallbackQuery: () => Promise.resolve(true),
      editMessageReplyMarkup: () => Promise.resolve(true),
      editMessageText: () => Promise.resolve(true),
    },
    logger,
  };

  return { deps, transitions, retryable, sent, usage, persisted };
}

Deno.test("a text note walks the state machine, persists, meters and delivers", async () => {
  const test = harness();

  const result = await createTextNote(message, USER_ID, JOB_ID, test.deps);

  assertEquals(result, { noteId: NOTE_ID, outputId: OUTPUT_ID });
  assertEquals(test.transitions, [
    ["QUEUED", "ACQUIRING"],
    ["ACQUIRING", "EXTRACTING"],
    ["EXTRACTING", "GENERATING"],
    ["GENERATING", "DELIVERING"],
  ]);
  assertEquals(test.persisted.length, 1);
  assertEquals(test.usage.length, 1);
  assertEquals(test.sent.length, 1);
  assertEquals(test.sent[0]?.hasKeyboard, true);
  assertEquals(test.retryable, []);
});

Deno.test("a provider failure marks the generating job retryable and persists nothing", async () => {
  const test = harness(AppError.providerRateLimited("synthetic 429"));

  const error = await assertRejects(
    () => createTextNote(message, USER_ID, JOB_ID, test.deps),
    AppError,
  );

  assertEquals(error.code, "provider_rate_limited");
  assertEquals(test.retryable, ["GENERATING"]);
  assertEquals(test.persisted, []);
  assertEquals(test.sent, []);
});
