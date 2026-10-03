import { assert, assertEquals } from "@std/assert";
import { createClient } from "@supabase/supabase-js";
import {
  MAX_TELEGRAM_DOWNLOAD_BYTES,
  TELEGRAM_SECRET_HEADER,
} from "../../supabase/functions/_shared/config/constants.ts";
import { loadWebhookConfig } from "../../supabase/functions/_shared/config/env.ts";
import { createCapturingLogger } from "../../supabase/functions/_shared/observability/logger.ts";
import type { NoteAIProvider } from "../../supabase/functions/_shared/providers/note-ai.provider.ts";
import { AccountLifecycleRepository } from "../../supabase/functions/_shared/repositories/account-lifecycle.repository.ts";
import { AuthLinkRepository } from "../../supabase/functions/_shared/repositories/auth-link.repository.ts";
import { ClosedAlphaRepository } from "../../supabase/functions/_shared/repositories/closed-alpha.repository.ts";
import { IngestionRepository } from "../../supabase/functions/_shared/repositories/ingestion.repository.ts";
import { NotesRepository } from "../../supabase/functions/_shared/repositories/notes.repository.ts";
import { NoteWorkflowRepository } from "../../supabase/functions/_shared/repositories/note-workflow.repository.ts";
import { PaymentRepository } from "../../supabase/functions/_shared/repositories/payment.repository.ts";
import { PlanRepository } from "../../supabase/functions/_shared/repositories/plan.repository.ts";
import { ProcessingJobsRepository } from "../../supabase/functions/_shared/repositories/processing-jobs.repository.ts";
import { QuotaRepository } from "../../supabase/functions/_shared/repositories/quota.repository.ts";
import { RejectedChatsRepository } from "../../supabase/functions/_shared/repositories/rejected-chats.repository.ts";
import { TemplatesRepository } from "../../supabase/functions/_shared/repositories/templates.repository.ts";
import { UsageRepository } from "../../supabase/functions/_shared/repositories/usage.repository.ts";
import { UserPreferencesRepository } from "../../supabase/functions/_shared/repositories/user-preferences.repository.ts";
import { handleWebhookRequest } from "../../supabase/functions/_shared/telegram/handler.ts";
import { SYNTHETIC_ID_BASE, voiceUpdate } from "../fixtures/telegram/builders.ts";

/**
 * The webhook's refusal of audio the Bot API could never hand over.
 *
 * The property under test is not "the handler says no" — it is that saying no
 * costs nothing. A refused upload must leave no job, no queue message and no quota
 * reservation behind, must still register a first-time sender so the refusal does
 * not erase them from the product, and must answer 2xx so Telegram stops
 * redelivering a file that will be refused identically every time.
 *
 * The handler, the service, the repositories and the configuration loader are all
 * the real ones. Only the HTTP transport is stubbed, so an assertion here is an
 * assertion about the deployed path.
 */

const SUPABASE_URL = "https://synthetic.supabase.co";
const SERVICE_ROLE_KEY = "synthetic-service-role-key-not-a-credential";
const WEBHOOK_SECRET = "synthetic_webhook_secret_value";
const BOT_TOKEN = "123456789:***";
const GEMINI_API_KEY = "synthetic-gemini-api-key-value";
const GEMINI_MODEL = "gemini-synthetic-flash";
const INTERNAL_WORKER_SECRET = "synthetic-internal-worker-secret-value";
const DASHBOARD_URL = "https://synthetic-dashboard.example";
const DASHBOARD_LINK_SECRET = "synthetic-dashboard-link-secret-value";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

const OVERSIZED_BYTES = 27 * 1024 * 1024;
const ACCEPTED_BYTES = 19 * 1024 * 1024;

interface RpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

interface RpcResponse {
  readonly status: number;
  readonly body: unknown;
}

/** A Supabase client whose only transport is a function that records what it saw. */
function stubTransport(respond: (fn: string) => RpcResponse) {
  const calls: RpcCall[] = [];

  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const fn = url.pathname.split("/").pop() ?? "";
    const args = init?.body === undefined
      ? {}
      : JSON.parse(String(init.body)) as Record<string, unknown>;

    calls.push({ fn, args });

    const response = respond(fn);
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl },
  });

  return { client, calls };
}

/** Enough of the happy path for the RPCs the accepted branch reaches. */
function happyPath(fn: string): RpcResponse {
  if (fn === "ensure_telegram_user") return { status: 200, body: USER_ID };
  if (fn === "create_auth_link_token") return { status: 200, body: true };

  if (fn === "accept_and_enqueue_telegram_update_v2") {
    return {
      status: 200,
      body: [{
        update_id: SYNTHETIC_ID_BASE + 1,
        user_id: USER_ID,
        job_id: JOB_ID,
        outcome: "accepted",
        job_state: "QUEUED",
        chat_id: SYNTHETIC_ID_BASE + 1,
        message_id: SYNTHETIC_ID_BASE + 2,
        queue_message_id: SYNTHETIC_ID_BASE + 3,
        template_key: "clean_note",
      }],
    };
  }

  return { status: 404, body: { code: "PGRST202", message: "no such function" } };
}

interface SentMessage {
  readonly chatId: number;
  readonly text: string;
  readonly options?: {
    readonly parseMode?: string;
    readonly inlineKeyboard?: {
      readonly inline_keyboard: readonly { readonly text: string; readonly url?: string }[][];
    };
  };
}

interface Harness {
  readonly response: Response;
  readonly calls: RpcCall[];
  readonly lines: string[];
  readonly sent: { readonly chatId: number; readonly text: string }[];
  readonly sentMessages: SentMessage[];
}

/** Run one delivery through the whole path, phase 1 included. */
async function deliver(body: unknown): Promise<Harness> {
  const { client, calls } = stubTransport(happyPath);
  const { logger, lines } = createCapturingLogger({ level: "debug" });

  const sent: { chatId: number; text: string }[] = [];
  const sentMessages: SentMessage[] = [];

  // The provider and the outbound Bot API are the two things this path must never
  // reach. They are stubs that record, so a test can prove the absence.
  const provider: Pick<NoteAIProvider, "generateText"> = {
    generateText: () => Promise.reject(new Error("the provider must not be reached")),
  };

  const telegram = {
    sendMessage: (chatId: number, text: string, options?: any) => {
      sent.push({ chatId, text });
      sentMessages.push({ chatId, text, options });
      return Promise.resolve({ messageId: 1 });
    },
    sendDocument: () => Promise.reject(new Error("sendDocument must not be reached")),
    answerCallbackQuery: () => Promise.resolve(true),
    editMessageReplyMarkup: () => Promise.resolve(undefined),
    editMessageText: () => Promise.resolve(undefined),
    deleteMessages: () => Promise.resolve(true),
  };

  const request = new Request(`${SUPABASE_URL}/functions/v1/telegram-webhook`, {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      [TELEGRAM_SECRET_HEADER]: WEBHOOK_SECRET,
    }),
    body: JSON.stringify(body),
  });

  const config = await loadWebhookConfig({
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: GEMINI_API_KEY,
    GEMINI_MODEL: GEMINI_MODEL,
    INTERNAL_WORKER_SECRET,
    DASHBOARD_URL,
    DASHBOARD_LINK_SECRET,
    NOTINN_ENV: "local",
  });

  const response = await handleWebhookRequest(request, {
    config,
    repository: new IngestionRepository(client),
    logger,
    phase1: {
      notes: new NotesRepository(client),
      workflow: new NoteWorkflowRepository(client),
      jobs: new ProcessingJobsRepository(client),
      rejectedChats: new RejectedChatsRepository(client),
      templates: new TemplatesRepository(client),
      usage: new UsageRepository(client),
      quota: new QuotaRepository(client),
      preferences: new UserPreferencesRepository(client),
      access: new ClosedAlphaRepository(client),
      lifecycle: new AccountLifecycleRepository(client),
      authLinks: new AuthLinkRepository(client),
      plans: new PlanRepository(client),
      payments: new PaymentRepository(client),
      provider,
      telegram,
    },
  });

  return { response, calls, lines, sent, sentMessages };
}

// --- The refusal -----------------------------------------------------------

Deno.test("audio past the Bot API ceiling is answered, and nothing is enqueued", async () => {
  const { response, calls, lines, sent, sentMessages } = await deliver(
    voiceUpdate({ fileSize: OVERSIZED_BYTES }),
  );

  assertEquals(response.status, 200);

  assert(
    !calls.some((call) => call.fn === "accept_and_enqueue_telegram_update_v2"),
    "an oversized upload was enqueued as a job",
  );
  assertEquals(
    calls.filter((call) => call.fn === "ensure_telegram_user").length,
    1,
    "the sender was not registered exactly once",
  );

  assertEquals(sent.length, 1, "the refusal was not sent exactly once");
  const reply = sent[0]?.text ?? "";
  assert(reply.includes("27.0 MB"), "the reply did not name the size that was sent");
  assert(
    reply.includes(`${Math.round(MAX_TELEGRAM_DOWNLOAD_BYTES / (1024 * 1024))} MB`),
    "the reply did not name the bound that was applied",
  );
  
  assert(
    reply.includes("Web Dashboard"),
    "the reply did not explain dashboard transport",
  );

  const button = sentMessages[0]?.options?.inlineKeyboard?.inline_keyboard?.[0]?.[0];
  assert(button !== undefined, "magic button was not attached to refusal");
  assert(button.text.includes("Buka Web Dashboard"), "button text mismatched");
  assert(button.url?.startsWith(`${DASHBOARD_URL}/auth/callback?token=`), "button url did not use magic auth callback");

  assert(
    lines.some((line) => line.includes("webhook.too_large")),
    "the refusal left no operator-visible trace",
  );
});

Deno.test("the refusal reply is redacted of nothing it should not carry", async () => {
  // The reply is a fixed sentence plus one number and one URL. It must not echo
  // the file handle, which is a capability.
  const { sent } = await deliver(voiceUpdate({ fileSize: OVERSIZED_BYTES }));

  const reply = sent[0]?.text ?? "";
  assert(!reply.includes("synthetic-voice-file-id"));
  assert(!reply.includes("synthetic-voice-unique-id"));
});

Deno.test("audio under the ceiling still becomes a job", async () => {
  // The gate must not over-fire. A file the Bot API will serve is ordinary work.
  const { response, calls, sent } = await deliver(
    voiceUpdate({ fileSize: ACCEPTED_BYTES }),
  );

  assertEquals(response.status, 200);
  assert(
    calls.some((call) => call.fn === "accept_and_enqueue_telegram_update_v2"),
    "a file within the ceiling was refused",
  );
  assert(
    sent.every((message) => !message.text.includes("Telegram lets bots download")),
    "a file within the ceiling was answered with the refusal",
  );
});
