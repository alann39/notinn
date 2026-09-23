import { MAX_WEBHOOK_BODY_BYTES } from "../config/constants.ts";
import type { WebhookConfig } from "../config/env.ts";
import { AppError, toAppError } from "../errors/app-error.ts";
import { acceptedResponse, errorResponse } from "../errors/http.ts";
import { definitionFor, ERROR_CODES } from "../errors/taxonomy.ts";
import { resolveRequestId } from "../observability/correlation.ts";
import type { Logger } from "../observability/logger.ts";
import { sha256Hex } from "../security/hashing.ts";
import { assertWebhookSecret } from "../security/webhook-secret.ts";
import type { IngestionRepository } from "../repositories/ingestion.repository.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { NoteWorkflowRepository } from "../repositories/note-workflow.repository.ts";
import type { ProcessingJobsRepository } from "../repositories/processing-jobs.repository.ts";
import type { QuotaRepository } from "../repositories/quota.repository.ts";
import type { RejectedChatsRepository } from "../repositories/rejected-chats.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import type { UsageRepository } from "../repositories/usage.repository.ts";
import type { UserPreferencesRepository } from "../repositories/user-preferences.repository.ts";
import type { ClosedAlphaRepository } from "../repositories/closed-alpha.repository.ts";
import type { AccountLifecycleRepository } from "../repositories/account-lifecycle.repository.ts";
import type { AuthLinkRepository } from "../repositories/auth-link.repository.ts";
import type { PlanRepository } from "../repositories/plan.repository.ts";
import type { NoteAIProvider } from "../providers/note-ai.provider.ts";
import type { EmbeddingProvider, LibraryAnswerProvider } from "../providers/library-ai.provider.ts";
import { handleCallback } from "../services/callback.service.ts";
import { closedAlphaAccessMessage, handleCommand } from "../services/command.service.ts";
import { ingestMessage } from "../services/ingestion.service.ts";
import { classifyUpdate } from "./parse-update.ts";
import { TelegramUpdateSchema } from "./schema.ts";
import type { TelegramGateway } from "./client.ts";

/**
 * The Telegram webhook request handler.
 *
 * The order of operations is the design:
 *
 *   1. Authenticate before doing anything else. An unauthenticated request must
 *      not cause a database read, a log line containing an update id, or any
 *      other observable effect beyond a 401.
 *
 *   2. Bound and parse the body, then classify it. Classification is pure and
 *      decides whether this update is something Notinn acts on at all.
 *
 *   3. Ingest, which is two idempotent database calls.
 *
 *   4. Answer. The status code is the only signal Telegram receives, and it is
 *      chosen by the error taxonomy rather than by this function.
 *
 * Nothing that leaves this function reveals whether a job was created, what
 * state it is in, or that anything failed. Blueprint 17.1 requires that, and a
 * caller who has the webhook secret is still only Telegram.
 */

export interface WebhookDependencies {
  readonly config: WebhookConfig;
  readonly repository: IngestionRepository;
  readonly logger: Logger;
  /**
   * Phase 1 application services. Optional only for the Phase 0 boundary tests;
   * the production composition root always supplies it.
   */
  readonly phase1?: {
    readonly notes: NotesRepository;
    readonly workflow: NoteWorkflowRepository;
    readonly jobs: ProcessingJobsRepository;
    readonly rejectedChats: RejectedChatsRepository;
    readonly templates: TemplatesRepository;
    readonly usage: UsageRepository;
    readonly quota: QuotaRepository;
    readonly preferences: UserPreferencesRepository;
    readonly access: ClosedAlphaRepository;
    readonly lifecycle: AccountLifecycleRepository;
    readonly authLinks?: AuthLinkRepository;
    readonly plans?: PlanRepository;
    readonly provider: Pick<NoteAIProvider, "generateText">;
    readonly embeddings?: EmbeddingProvider;
    readonly answers?: LibraryAnswerProvider;
    readonly telegram: Pick<
      TelegramGateway,
      | "sendMessage"
      | "sendDocument"
      | "answerCallbackQuery"
      | "editMessageReplyMarkup"
      | "editMessageText"
      | "deleteMessages"
    >;
    /** Schedules a non-blocking worker call. The durable queue remains authoritative. */
    readonly triggerWorker?: (jobId: string) => void;
  };
}

/** Reject anything that is not a POST before touching the request body. */
function methodGuard(request: Request): void {
  if (request.method !== "POST") {
    throw AppError.validation(`method ${request.method} is not accepted`);
  }
}

/**
 * Parse the request body into a validated Telegram update.
 *
 * Returns both the parsed update and its SHA-256 digest. The digest is taken
 * over the raw bytes as received, before parsing, so that it describes what
 * Telegram actually sent rather than what survived normalisation.
 */
async function readUpdate(
  request: Request,
): Promise<{ update: unknown; digest: string; byteLength: number }> {
  const raw = await request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;

  if (byteLength === 0) {
    throw AppError.validation("request body was empty");
  }

  if (byteLength > MAX_WEBHOOK_BODY_BYTES) {
    throw AppError.validation(`request body of ${byteLength} bytes exceeds the limit`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The exception is deliberately not included: a JSON parse error quotes the
    // input near the failure, which would put message content in the detail.
    throw AppError.validation("request body was not valid JSON");
  }

  const digest = await sha256Hex(raw);
  return { update: parsed, digest, byteLength };
}

/** Describe validation issues without quoting any received value. */
function describeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export async function handleWebhookRequest(
  request: Request,
  deps: WebhookDependencies,
): Promise<Response> {
  const { config, repository, logger } = deps;

  const requestId = resolveRequestId(request);
  const log = logger.child({ request_id: requestId });
  const startedAt = performance.now();

  try {
    methodGuard(request);

    // --- 1. Authentication ------------------------------------------------
    // Throws AppError.unauthorized, which the catch below turns into a 401.
    await assertWebhookSecret(request, config.webhookSecret);

    // --- 2. Body ----------------------------------------------------------
    const { update, digest, byteLength } = await readUpdate(request);

    const parsed = TelegramUpdateSchema.safeParse(update);
    if (!parsed.success) {
      throw AppError.validation(`telegram update schema: ${describeIssues(parsed.error.issues)}`);
    }

    // --- 3. Classification ------------------------------------------------
    const classification = classifyUpdate(parsed.data);

    if (classification.kind === "ignored") {
      // A deliberate, documented drop. It is acknowledged with a success so
      // Telegram does not redeliver something Notinn will always decline.
      log.info("webhook.ignored", {
        update_id: classification.updateId,
        reason: classification.reason,
        source: classification.detail,
        byte_length: byteLength,
      });
      return acceptedResponse();
    }

    if (classification.kind === "rejected") {
      if (deps.phase1 !== undefined) {
        const claimed = await deps.phase1.rejectedChats.claimReply(
          classification.chat.telegramChatId,
        );
        if (claimed) {
          await deps.phase1.telegram.sendMessage(
            classification.chat.telegramChatId,
            definitionFor(ERROR_CODES.NON_PRIVATE_CHAT).publicMessage,
          );
        }
      }
      log.info("webhook.rejected", {
        update_id: classification.chat.updateId,
        chat_id: classification.chat.telegramChatId,
        reason: "non_private_chat",
        source: classification.chat.chatType,
      });
      return acceptedResponse();
    }

    if (classification.kind === "command") {
      if (deps.phase1 !== undefined) {
        await handleCommand(classification.message, {
          users: repository,
          notes: deps.phase1.notes,
          telegram: deps.phase1.telegram,
          embeddings: deps.phase1.embeddings,
          answers: deps.phase1.answers,
          usage: deps.phase1.usage,
          quota: deps.phase1.quota,
          preferences: deps.phase1.preferences,
          templates: deps.phase1.templates,
          access: deps.phase1.access,
          lifecycle: deps.phase1.lifecycle,
          authLinks: deps.phase1.authLinks,
          dashboard: deps.config.dashboard,
          plans: deps.phase1.plans,
        });
      }
      log.info("webhook.command", {
        update_id: classification.message.updateId,
        chat_id: classification.message.telegramChatId,
      });
      return acceptedResponse();
    }

    if (classification.kind === "callback") {
      if (deps.phase1 !== undefined) {
        await handleCallback(classification.callback, {
          users: repository,
          notes: deps.phase1.notes,
          workflow: deps.phase1.workflow,
          templates: deps.phase1.templates,
          usage: deps.phase1.usage,
          quota: deps.phase1.quota,
          preferences: deps.phase1.preferences,
          provider: deps.phase1.provider,
          telegram: deps.phase1.telegram,
          logger: log,
          access: deps.phase1.access,
          lifecycle: deps.phase1.lifecycle,
          plans: deps.phase1.plans,
        });
      }
      return acceptedResponse();
    }

    // --- 4. Ingestion -----------------------------------------------------
    const ingestion = await ingestMessage(classification.message, digest, {
      repository,
      logger: log,
    });

    if (ingestion.outcome === "user_not_active" && deps.phase1 !== undefined) {
      const access = await deps.phase1.access.getAccess(ingestion.userId);
      await deps.phase1.telegram.sendMessage(
        classification.message.telegramChatId,
        access?.status === "pending" || access?.status === "suspended"
          ? closedAlphaAccessMessage(access.status)
          : AppError.userNotActive().publicMessage,
      );
    }

    if (ingestion.outcome === "accepted" && ingestion.jobId !== null && deps.phase1 !== undefined) {
      try {
        const status = await deps.phase1.telegram.sendMessage(
          classification.message.telegramChatId,
          classification.message.inputType === "voice" ||
            classification.message.inputType === "audio"
            ? "Got it — transcribing your audio now."
            : "Got it — organizing your note now.",
        );
        await deps.phase1.jobs.setStatusMessage(
          ingestion.userId,
          ingestion.jobId,
          status.messageId,
        );
      } catch (thrown) {
        const error = toAppError(thrown);
        // The job is already durable and queued. A status-message failure must
        // not make Telegram redeliver the original update and cannot lose the
        // work; the worker falls back to sending a fresh result message.
        log[error.logLevel]("job.status_message_failed", {
          update_id: classification.message.updateId,
          job_id: ingestion.jobId,
          user_id: ingestion.userId,
          error_code: error.code,
          error_detail: error.internalDetail,
        });
      }

      // The queue write committed before this point. This call is only the
      // low-latency nudge; if the isolate disappears or the request fails, the
      // recovery scheduler will read the same durable pgmq message later.
      deps.phase1.triggerWorker?.(ingestion.jobId);
    }

    log.info("webhook.accepted", {
      update_id: classification.message.updateId,
      duration_ms: Math.round(performance.now() - startedAt),
      byte_length: byteLength,
    });

    return acceptedResponse();
  } catch (thrown) {
    const error = toAppError(thrown);

    // The severity comes from the taxonomy, not from the fact that an exception
    // reached here. A malformed payload is a warning; a failed database write is
    // an error. Splitting them is what keeps the error-level signal worth
    // alerting on.
    log[error.logLevel]("webhook.failed", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
      duration_ms: Math.round(performance.now() - startedAt),
    });

    return errorResponse(error);
  }
}

/** Exported for the tests, which exercise the parsing guards in isolation. */
export const __testing = { methodGuard, readUpdate, describeIssues };
