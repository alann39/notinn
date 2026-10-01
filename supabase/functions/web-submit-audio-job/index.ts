import { createClient } from "@supabase/supabase-js";
import { Secret } from "../_shared/config/env.ts";
import { createLogger } from "../_shared/observability/logger.ts";
import { scheduleWorkerInvocation } from "../_shared/worker/invoker.ts";
import { toAppError } from "../_shared/errors/app-error.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WebSubmitJobRequest {
  input_type?: "audio" | "voice" | "pdf" | "image" | "text";
  storage_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  duration_seconds?: number | null;
  source_text?: string | null;
  template_key?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: CORS_HEADERS });
  }

  const logger = createLogger({
    level: "info",
    context: { function_name: "web-submit-audio-job" },
  });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const internalWorkerSecret = Deno.env.get("INTERNAL_WORKER_SECRET");

    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Missing server environment configuration" }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

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
    const body: WebSubmitJobRequest = await req.json().catch(
      () => ({} as WebSubmitJobRequest),
    );
    const {
      input_type = "audio",
      storage_path,
      mime_type,
      size_bytes,
      duration_seconds,
      source_text,
      template_key,
    } = body;

    if (!["audio", "voice", "pdf", "image", "text"].includes(input_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid input_type: must be audio, pdf, image, or text" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    if (input_type === "text") {
      if (!source_text || typeof source_text !== "string" || source_text.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing or empty source_text" }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          },
        );
      }
      if (source_text.length > 50000) {
        return new Response(
          JSON.stringify({ error: "source_text exceeds maximum length of 50,000 characters" }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          },
        );
      }
    } else {
      if (!storage_path || typeof storage_path !== "string") {
        return new Response(
          JSON.stringify({ error: "Missing or invalid storage_path" }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          },
        );
      }

      if (!mime_type || typeof mime_type !== "string") {
        return new Response(
          JSON.stringify({ error: "Missing or invalid mime_type" }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          },
        );
      }

      if (typeof size_bytes !== "number" || size_bytes <= 0) {
        return new Response(
          JSON.stringify({ error: "Missing or invalid size_bytes" }),
          {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          },
        );
      }
    }

    // 3. Call web_submit_job RPC
    const { data: rpcData, error: rpcError } = await userClient.rpc(
      "web_submit_job",
      {
        p_input_type: input_type,
        p_storage_path: storage_path ?? null,
        p_mime_type: mime_type ?? null,
        p_size_bytes: size_bytes ?? null,
        p_duration_seconds: duration_seconds ?? null,
        p_source_text: source_text ?? null,
        p_template_key: template_key ?? null,
      },
    );

    if (rpcError) {
      logger.error("web_submit_audio_job.rpc_failed", {
        error_code: rpcError.code,
      });
      return new Response(
        JSON.stringify({
          error: rpcError.message || "Failed to enqueue processing job",
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    let jobId: string | null = null;
    if (Array.isArray(rpcData) && rpcData.length > 0) {
      const first = rpcData[0];
      if (
        first && typeof first === "object" && "job_id" in first &&
        typeof first.job_id === "string"
      ) {
        jobId = first.job_id;
      }
    } else if (
      rpcData && typeof rpcData === "object" && "job_id" in rpcData &&
      typeof rpcData.job_id === "string"
    ) {
      jobId = rpcData.job_id;
    }

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Failed to obtain job_id from RPC" }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 4. Trigger worker execution immediately
    if (internalWorkerSecret) {
      scheduleWorkerInvocation(
        supabaseUrl,
        new Secret(internalWorkerSecret),
        jobId,
        logger,
      );
    } else {
      logger.warn("web_submit_audio_job.worker_secret_missing", {
        job_id: jobId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        state: "QUEUED",
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
