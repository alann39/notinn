import { z } from "zod";
import { INTERNAL_WORKER_SECRET_HEADER } from "../config/constants.ts";
import type { WorkerConfig } from "../config/env.ts";
import { AppError, toAppError } from "../errors/app-error.ts";
import { emptyResponse } from "../errors/http.ts";
import type { Logger } from "../observability/logger.ts";
import { constantTimeEquals } from "../security/webhook-secret.ts";
import {
  type JobWorkerDependencies,
  processJobById,
  processQueueBatch,
} from "../services/job-worker.service.ts";

const ProcessJobRequestSchema = z.object({
  job_id: z.uuid().optional(),
  trigger: z.enum(["immediate", "queue", "retry", "recovery"]),
  batch_size: z.number().int().min(1).max(10).optional(),
});

export interface ProcessJobHandlerDependencies extends JobWorkerDependencies {
  readonly config: WorkerConfig;
  readonly logger: Logger;
}

async function assertInternalSecret(request: Request, config: WorkerConfig): Promise<void> {
  const presented = request.headers.get(INTERNAL_WORKER_SECRET_HEADER);
  if (
    presented === null || presented === "" ||
    !(await constantTimeEquals(presented, config.internalWorkerSecret.reveal()))
  ) {
    throw AppError.unauthorized("internal worker secret check failed");
  }
}

export async function handleProcessJobRequest(
  request: Request,
  deps: ProcessJobHandlerDependencies,
): Promise<Response> {
  try {
    if (request.method !== "POST") throw AppError.validation("worker accepts POST only");
    await assertInternalSecret(request, deps.config);

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw AppError.validation("worker request body was not JSON");
    }
    const parsed = ProcessJobRequestSchema.safeParse(raw);
    if (!parsed.success) throw AppError.validation("worker request body had an invalid shape");

    if (parsed.data.job_id !== undefined) {
      const outcome = await processJobById(parsed.data.job_id, deps);
      return Response.json({ accepted: true, job_id: parsed.data.job_id, outcome });
    }

    if (parsed.data.trigger !== "queue" && parsed.data.trigger !== "recovery") {
      throw AppError.validation("a direct trigger requires job_id");
    }

    const result = await processQueueBatch(deps, parsed.data.batch_size ?? 5);
    return Response.json({ accepted: true, ...result });
  } catch (thrown) {
    const error = toAppError(thrown);
    deps.logger[error.logLevel]("worker.request_failed", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return emptyResponse(error.httpStatus);
  }
}
