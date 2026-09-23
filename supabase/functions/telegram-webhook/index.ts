import { loadWebhookConfig, type WebhookConfig } from "../_shared/config/env.ts";
import { createServiceClient } from "../_shared/db/client.ts";
import { toAppError } from "../_shared/errors/app-error.ts";
import { emptyResponse } from "../_shared/errors/http.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { IngestionRepository } from "../_shared/repositories/ingestion.repository.ts";
import { NotesRepository } from "../_shared/repositories/notes.repository.ts";
import { NoteWorkflowRepository } from "../_shared/repositories/note-workflow.repository.ts";
import { ProcessingJobsRepository } from "../_shared/repositories/processing-jobs.repository.ts";
import { QuotaRepository } from "../_shared/repositories/quota.repository.ts";
import { RejectedChatsRepository } from "../_shared/repositories/rejected-chats.repository.ts";
import { TemplatesRepository } from "../_shared/repositories/templates.repository.ts";
import { UsageRepository } from "../_shared/repositories/usage.repository.ts";
import { UserPreferencesRepository } from "../_shared/repositories/user-preferences.repository.ts";
import { ClosedAlphaRepository } from "../_shared/repositories/closed-alpha.repository.ts";
import { AccountLifecycleRepository } from "../_shared/repositories/account-lifecycle.repository.ts";
import { AuthLinkRepository } from "../_shared/repositories/auth-link.repository.ts";
import { PlanRepository } from "../_shared/repositories/plan.repository.ts";
import { resolveProviderConfig } from "../_shared/repositories/provider-config.repository.ts";
import { createNoteProvider } from "../_shared/providers/note-provider.factory.ts";
import { GeminiEmbeddingProvider } from "../_shared/providers/gemini-embedding.provider.ts";
import { createTelegramGateway } from "../_shared/telegram/client.ts";
import { handleWebhookRequest } from "../_shared/telegram/handler.ts";
import { scheduleWorkerInvocation } from "../_shared/worker/invoker.ts";

/**
 * Telegram webhook endpoint (blueprint 17.1).
 *
 * This file is a composition root and nothing else. It wires configuration, a
 * logger, a database client and a repository into `handleWebhookRequest`, and it
 * contains no business logic, no validation and no SQL. Everything worth testing
 * lives in `_shared/`, where it can be tested without a running Supabase.
 *
 * The JWT check is disabled for this function in `supabase/config.toml`. That is
 * required, not a convenience: Telegram cannot present a Supabase JWT. The
 * request is authenticated instead by the secret token Telegram echoes back in
 * `X-Telegram-Bot-Api-Secret-Token`, which is verified in constant time before
 * any other work happens. See docs/ADR/0005-access-model.md.
 */

/**
 * Configuration is read once per isolate and reused.
 *
 * Edge Function isolates serve many requests, and re-reading the environment on
 * every delivery would repeat two SHA-256 computations for no benefit. Only
 * successful loads are cached: a configuration error must be re-evaluated on the
 * next request, so that fixing a secret and letting the isolate turn over is
 * enough to recover.
 */
let cachedConfig: WebhookConfig | null = null;

async function resolveConfig(): Promise<WebhookConfig> {
  if (cachedConfig !== null) return cachedConfig;
  const config = await loadWebhookConfig();
  cachedConfig = config;
  return config;
}

Deno.serve(async (request: Request): Promise<Response> => {
  let config: WebhookConfig;

  try {
    config = await resolveConfig();
  } catch (thrown) {
    // The function cannot serve without configuration. It must not answer 2xx
    // (which would tell Telegram the delivery succeeded and discard it), and it
    // must not leak a stack trace. A bare 500 is both.
    //
    // This path is expected to be unreachable in a correctly deployed
    // environment: `deno task verify-env` and the deployment checklist in
    // docs/IMPLEMENTATION_STATUS.md exist to catch it before traffic arrives.
    const error = toAppError(thrown);
    const bootstrapLogger = createLogger({
      level: "error",
      context: { function_name: "telegram-webhook" },
    });
    bootstrapLogger.error("webhook.configuration_failed", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return emptyResponse(500);
  }

  try {
    const logger = createLogger({
      level: config.logLevel,
      context: {
        function_name: "telegram-webhook",
        environment: config.environment,
      },
    });

    const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);
    const repository = new IngestionRepository(client);

    const ai = await resolveProviderConfig(client, config.ai);
    const noteProvider = createNoteProvider(ai);
    const phase1 = {
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
      provider: noteProvider,
      embeddings: ai.embeddingModel === null ? undefined : new GeminiEmbeddingProvider(ai),
      answers: noteProvider,
      telegram: createTelegramGateway(config.botToken),
      triggerWorker: (jobId: string) =>
        scheduleWorkerInvocation(
          config.supabaseUrl,
          config.internalWorkerSecret,
          jobId,
          logger,
        ),
    };

    return await handleWebhookRequest(request, { config, repository, logger, phase1 });
  } catch (thrown) {
    // handleWebhookRequest handles its own errors. This is a backstop for a
    // failure in the wiring above, so that no exception ever escapes to the
    // runtime's default handler and produces a response containing a stack.
    const error = toAppError(thrown);
    const logger = createLogger({
      level: "error",
      context: { function_name: "telegram-webhook", environment: config.environment },
    });
    logger.error("webhook.unhandled", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return emptyResponse(500);
  }
});
