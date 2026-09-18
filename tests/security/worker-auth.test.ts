import { assertEquals } from "@std/assert";
import { Secret, type WorkerConfig } from "../../supabase/functions/_shared/config/env.ts";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import type { ProcessJobHandlerDependencies } from "../../supabase/functions/_shared/worker/handler.ts";
import { handleProcessJobRequest } from "../../supabase/functions/_shared/worker/handler.ts";

const WORKER_SECRET = "synthetic-worker-secret-at-least-32-characters";

function harness() {
  let queueReads = 0;
  const { logger, lines } = createCapturingLogger({ level: "debug" });
  const config: WorkerConfig = {
    environment: "local",
    supabaseUrl: "https://synthetic.supabase.co",
    serviceRoleKey: new Secret("synthetic-service-role-key"),
    internalWorkerSecret: new Secret(WORKER_SECRET),
    botToken: new Secret("123456789:synthetic-bot-token"),
    ai: {
      provider: "gemini",
      apiKey: new Secret("synthetic-gemini-key"),
      model: "gemini-synthetic-flash",
      fallbackModel: null,
      embeddingModel: null,
    },
    logLevel: "debug",
    fingerprints: { serviceRoleKey: "synthetic" },
  };

  const deps: ProcessJobHandlerDependencies = {
    config,
    logger,
    jobs: {
      readQueue: () => {
        queueReads += 1;
        return Promise.resolve([]);
      },
      deleteQueueMessage: () => Promise.resolve(true),
      findQueueMessageId: () => Promise.resolve(null),
      claim: () => {
        throw new Error("claim must not run in an empty batch");
      },
      advance: () => {
        throw new Error("advance must not run in an empty batch");
      },
      markRetryable: () => {
        throw new Error("retry must not run in an empty batch");
      },
      complete: () => Promise.resolve(false),
      fail: () => Promise.resolve(false),
    },
    notes: {
      stageNoteForDelivery: () => {
        throw new Error("note write must not run in an empty batch");
      },
      findNoteForDisplay: () => Promise.resolve(null),
      findNoteForRegeneration: () => Promise.resolve(null),
    },
    templates: {
      findForGeneration: () => {
        throw new Error("template read must not run in an empty batch");
      },
      listSystemLabels: () => Promise.resolve(new Map()),
    },
    usage: { recordGeneration: () => Promise.resolve() },
    provider: {
      generateText: () => {
        throw new Error("provider must not run in an empty batch");
      },
      generateAudio: () => {
        throw new Error("provider must not run in an empty batch");
      },
      generateImage: () => {
        throw new Error("provider must not run in an empty batch");
      },
      generatePdf: () => {
        throw new Error("provider must not run in an empty batch");
      },
    },
    telegram: {
      sendMessage: () => Promise.resolve({ messageId: 1 }),
      answerCallbackQuery: () => Promise.resolve(true),
      editMessageReplyMarkup: () => Promise.resolve(true),
      editMessageText: () => Promise.resolve(true),
      downloadFile: () => Promise.resolve(new Uint8Array()),
    },
  };

  return { deps, lines, queueReads: () => queueReads };
}

function request(secret: string | null, body = { trigger: "queue" }): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set("X-Notinn-Worker-Secret", secret);
  return new Request("https://synthetic.test/process-job", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test("the worker rejects a missing trigger secret before reading the queue", async () => {
  const test = harness();
  const response = await handleProcessJobRequest(request(null), test.deps);

  assertEquals(response.status, 401);
  assertEquals(await response.text(), "");
  assertEquals(test.queueReads(), 0);
});

Deno.test("the worker rejects the wrong trigger secret without echoing it", async () => {
  const test = harness();
  const wrong = "wrong-worker-secret-at-least-32-characters";
  const response = await handleProcessJobRequest(request(wrong), test.deps);

  assertEquals(response.status, 401);
  assertEquals(await response.text(), "");
  assertEquals(test.queueReads(), 0);
  assertEquals(test.lines.some((line) => line.includes(wrong)), false);
});

Deno.test("a valid queue trigger reads one bounded batch", async () => {
  const test = harness();
  const response = await handleProcessJobRequest(request(WORKER_SECRET), test.deps);

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    accepted: true,
    read: 0,
    completed: 0,
    retrying: 0,
    discarded: 0,
  });
  assertEquals(test.queueReads(), 1);
});

Deno.test("a malformed authenticated worker body is a bare client error", async () => {
  const test = harness();
  const response = await handleProcessJobRequest(
    request(WORKER_SECRET, { trigger: "not-a-trigger" }),
    test.deps,
  );

  assertEquals(response.status, 400);
  assertEquals(await response.text(), "");
  assertEquals(test.queueReads(), 0);
});
