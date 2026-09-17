import { loadWorkerConfig, type WorkerConfig } from "../_shared/config/env.ts";
import { createServiceClient } from "../_shared/db/client.ts";
import { toAppError } from "../_shared/errors/app-error.ts";
import { emptyResponse } from "../_shared/errors/http.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { GeminiNoteProvider } from "../_shared/providers/gemini-note.provider.ts";
import { NotesRepository } from "../_shared/repositories/notes.repository.ts";
import { ProcessingJobsRepository } from "../_shared/repositories/processing-jobs.repository.ts";
import { TemplatesRepository } from "../_shared/repositories/templates.repository.ts";
import { UsageRepository } from "../_shared/repositories/usage.repository.ts";
import { createTelegramGateway } from "../_shared/telegram/client.ts";
import { handleProcessJobRequest } from "../_shared/worker/handler.ts";

let cachedConfig: WorkerConfig | null = null;

async function resolveConfig(): Promise<WorkerConfig> {
  if (cachedConfig !== null) return cachedConfig;
  cachedConfig = await loadWorkerConfig();
  return cachedConfig;
}

Deno.serve(async (request: Request): Promise<Response> => {
  let config: WorkerConfig;
  try {
    config = await resolveConfig();
  } catch (thrown) {
    const error = toAppError(thrown);
    const logger = createLogger({
      level: "error",
      context: { function_name: "process-job" },
    });
    logger.error("worker.configuration_failed", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return emptyResponse(500);
  }

  const logger = createLogger({
    level: config.logLevel,
    context: { function_name: "process-job", environment: config.environment },
  });

  try {
    const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);
    return await handleProcessJobRequest(request, {
      config,
      jobs: new ProcessingJobsRepository(client),
      notes: new NotesRepository(client),
      templates: new TemplatesRepository(client),
      usage: new UsageRepository(client),
      provider: new GeminiNoteProvider(config.ai),
      telegram: createTelegramGateway(config.botToken),
      logger,
    });
  } catch (thrown) {
    const error = toAppError(thrown);
    logger.error("worker.unhandled", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return emptyResponse(500);
  }
});
