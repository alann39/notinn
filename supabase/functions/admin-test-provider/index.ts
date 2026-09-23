import { createClient } from "@supabase/supabase-js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Missing configuration" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 1. Authorize caller: requires Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: isAdmin, error: adminCheckError } = await userClient.rpc("is_current_user_admin");
    if (adminCheckError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Caller is not an admin" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 2. Parse request body
    const body = await req.json().catch(() => ({}));
    const provider = body.provider;
    if (provider !== "gemini" && provider !== "openrouter") {
      return new Response(
        JSON.stringify({ error: "Invalid provider. Must be 'gemini' or 'openrouter'" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 3. Service-role client to access vaulted credentials securely
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const isCandidate = typeof body.api_key === "string";
    if (isCandidate && (body.api_key.length < 8 || body.api_key.length > 4096)) {
      return new Response(JSON.stringify({ error: "Invalid API key length" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const { data: rows, error: keyError } = isCandidate
      ? { data: null, error: null }
      : await serviceClient.rpc("get_provider_runtime_config");
    const keyRow = (rows ?? []).find((row: { provider: string }) => row.provider === provider);
    const environmentKey = provider === "gemini"
      ? Deno.env.get("GEMINI_API_KEY")
      : Deno.env.get("OPENROUTER_API_KEY");
    if (
      keyError || (!isCandidate && (keyRow?.is_active === false ||
        !(keyRow?.api_key || environmentKey)))
    ) {
      return new Response(
        JSON.stringify({
          status: "unhealthy",
          latency_ms: 0,
          error_message:
            "No custom API key vaulted yet for this provider. Please use 'Rotate Key' to set an active key.",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const apiKey = isCandidate
      ? body.api_key.trim()
      : (keyRow?.api_key || environmentKey || "").trim();
    const startTime = performance.now();

    let testStatus: "healthy" | "unhealthy" = "unhealthy";
    let testLatency = 0;
    let testError: string | null = null;

    if (provider === "gemini") {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${
            encodeURIComponent(apiKey)
          }`,
          { signal: AbortSignal.timeout(8000) },
        );
        testLatency = Math.round(performance.now() - startTime);
        if (res.ok) {
          testStatus = "healthy";
        } else {
          testError = `Google API returned HTTP ${res.status}`;
        }
      } catch {
        testLatency = Math.round(performance.now() - startTime);
        testError = "Network timeout connecting to Google Gemini API";
      }
    } else {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://notinn.app",
            "X-Title": "Notinn Note Assistant",
          },
          signal: AbortSignal.timeout(8000),
        });
        testLatency = Math.round(performance.now() - startTime);
        if (res.ok) {
          testStatus = "healthy";
        } else {
          testError = `OpenRouter API returned HTTP ${res.status}`;
        }
      } catch {
        testLatency = Math.round(performance.now() - startTime);
        testError = "Network timeout connecting to OpenRouter API";
      }
    }

    // 4. Record the test result in the database vault
    if (!isCandidate) {
      const { error: recordError } = await userClient.rpc("admin_record_provider_test", {
        p_provider: provider,
        p_status: testStatus,
        p_latency_ms: testLatency,
        p_error: testError,
      });
      if (recordError) throw recordError;
    }

    return new Response(
      JSON.stringify({
        status: testStatus,
        latency_ms: testLatency,
        error_message: testError,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (_err: unknown) {
    return new Response(
      JSON.stringify({ error: "Provider test failed" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
