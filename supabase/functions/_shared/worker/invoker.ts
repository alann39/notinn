import { INTERNAL_WORKER_SECRET_HEADER } from "../config/constants.ts";
import type { Secret } from "../config/env.ts";
import { AppError, toAppError } from "../errors/app-error.ts";
import type { Logger } from "../observability/logger.ts";

/** Invoke the worker with an opaque job id and no user content or file handle. */
export async function invokeWorker(
  supabaseUrl: string,
  secret: Secret,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${supabaseUrl}/functions/v1/process-job`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [INTERNAL_WORKER_SECRET_HEADER]: secret.reveal(),
    },
    body: JSON.stringify({ job_id: jobId, trigger: "immediate" }),
  });

  // The response is operational metadata only, but the webhook does not need it.
  // Cancel it promptly so a background invocation retains no unused body.
  await response.body?.cancel();
  if (!response.ok) {
    throw AppError.internal(`background worker invocation returned ${response.status}`);
  }
}

interface EdgeRuntimeLike {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Schedule an invocation without extending Telegram's webhook response time.
 *
 * Supabase Edge Runtime exposes `EdgeRuntime.waitUntil`. Plain Deno (including
 * local tests) does not, so the promise is still started and owns its rejection.
 */
export function scheduleWorkerInvocation(
  supabaseUrl: string,
  secret: Secret,
  jobId: string,
  logger: Logger,
  fetchImpl: typeof fetch = fetch,
): void {
  const task = invokeWorker(supabaseUrl, secret, jobId, fetchImpl).catch((thrown) => {
    const error = toAppError(thrown);
    logger[error.logLevel]("worker.background_invocation_failed", {
      job_id: jobId,
      error_code: error.code,
      error_detail: error.internalDetail,
    });
  });

  const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;
  runtime?.waitUntil(task);
}
