import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "../_shared/db/client.ts";
import { type AiConfig, Secret } from "../_shared/config/env.ts";
import { NotesRepository } from "../_shared/repositories/notes.repository.ts";
import { TemplatesRepository } from "../_shared/repositories/templates.repository.ts";
import { QuotaRepository } from "../_shared/repositories/quota.repository.ts";
import { UsageRepository } from "../_shared/repositories/usage.repository.ts";
import { resolveProviderConfig } from "../_shared/repositories/provider-config.repository.ts";
import { createNoteProvider } from "../_shared/providers/note-provider.factory.ts";
import { withConsumedQuota } from "../_shared/services/quota.service.ts";
import { renderNoteOutput } from "../_shared/services/note-rendering.ts";
import { STRUCTURED_NOTE_VERSION } from "../_shared/schemas/structured-note.ts";
import { AppError, toAppError } from "../_shared/errors/app-error.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import type { TemplateKey } from "../_shared/config/constants.ts";
import {
  loadWebFunctionConfig,
  type WebFunctionConfig,
} from "../_shared/config/env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RegenerateRequest {
  note_id: string;
  template_key: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: CORS_HEADERS });
  }

  let config: WebFunctionConfig;
  try {
    config = await loadWebFunctionConfig(Deno.env.toObject(), {
      requireAi: true,
    });
  } catch (thrown) {
    const error = toAppError(thrown);
    createLogger({
      level: "error",
      context: { function_name: "web-regenerate-note" },
    }).error("web-regenerate-note.configuration_failed", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return new Response(
      JSON.stringify({ error: "Missing server environment configuration" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = config.supabaseUrl;
  const anonKey = config.anonKey;
  const serviceRoleKey = config.serviceRoleKey.reveal();
  // Non-null after requireAi.
  const aiDefaults = config.ai!;

  try {
    // 1. Authorize caller via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Authorization header" }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userId, error: userError } = await userClient.rpc(
      "get_linked_user_id",
    );
    if (userError || !userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or unlinked session" }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Parse and validate body
    const body: RegenerateRequest = await req.json().catch(() => ({}));
    const { note_id, template_key } = body;

    if (
      !note_id || typeof note_id !== "string" || !template_key ||
      typeof template_key !== "string"
    ) {
      return new Response(
        JSON.stringify({
          error: "Missing note_id or template_key in request body",
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Initialize server repositories
    const serviceSecret = new Secret(serviceRoleKey);
    const serviceClient = createServiceClient(supabaseUrl, serviceSecret);
    const notesRepo = new NotesRepository(serviceClient);
    const templatesRepo = new TemplatesRepository(serviceClient);
    const quotaRepo = new QuotaRepository(serviceClient);
    const usageRepo = new UsageRepository(serviceClient);

    // 4. Find note and verify user ownership & source text availability
    const source = await notesRepo.findNoteForRegeneration(userId, note_id);
    if (
      !source || !source.sourceText || source.sourceText.trim().length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: "Note or source transcript not found for regeneration",
        }),
        {
          status: 404,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 5. Fetch template specification
    const template = await templatesRepo.findForGeneration(
      userId,
      template_key as TemplateKey,
      source.sourceType,
    );

    // 6. Resolve AI provider with vaulted credentials.
    // P3+P7: the validated AI config doubles as the DB-vault fallback —
    // no direct reads, no hardcoded nulls. resolveProviderConfig below lets
    // the DB-vaulted runtime config win when present.
    const fallbackAi: AiConfig = aiDefaults;
    const aiConfig = await resolveProviderConfig(serviceClient, fallbackAi);
    const provider = createNoteProvider(aiConfig);

    // 7. Execute generation under quota reservation
    const reservationKey = `web:${crypto.randomUUID()}:regeneration`;
    const { generation, output } = await withConsumedQuota(
      quotaRepo,
      {
        userId,
        metric: "regeneration",
        reservationKey,
      },
      async () => {
        const gen = await provider.generateText({
          sourceText: source.sourceText!,
          template,
          templateKey: template_key as TemplateKey,
          reason: "custom",
          outputLanguage: source.language,
        });

        const rendered = renderNoteOutput(gen.note);

        await usageRepo.recordGeneration({
          userId,
          jobId: null,
          provider: gen.provider,
          model: gen.model,
          inputTokens: gen.inputTokens,
          outputTokens: gen.outputTokens,
          providerRequestId: gen.providerRequestId,
        });

        const out = await notesRepo.regenerateNoteOutput({
          userId,
          noteId: note_id,
          templateKey: template_key as TemplateKey,
          schemaVersion: STRUCTURED_NOTE_VERSION,
          contentJson: gen.note,
          renderedText: rendered.html,
          provider: gen.provider,
          model: gen.model,
          generationReason: "custom",
        });

        if (out.outcome !== "created" || out.outputId === null) {
          throw AppError.internal("Generated edit could not be staged");
        }

        const currentResult = await notesRepo.setCurrentOutput(
          userId,
          note_id,
          out.outputId,
        );
        if (currentResult.outcome !== "updated") {
          throw AppError.internal("Could not set note output as current");
        }

        return { generation: gen, output: out };
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        note_id,
        output_id: output.outputId,
        content: generation.note,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (thrown) {
    const error = toAppError(thrown);
    return new Response(
      JSON.stringify({
        error: error.publicMessage,
        code: error.code,
      }),
      {
        status: error.retryable ? 503 : 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
