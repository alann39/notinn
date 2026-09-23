import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

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

    if (!supabaseUrl || !serviceRoleKey) {
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

    const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
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

    const { data: keyRow, error: keyError } = await serviceClient
      .from("system_provider_keys")
      .select("api_key, selected_model")
      .eq("provider", provider)
      .single();

    if (keyError || !keyRow || !keyRow.api_key || keyRow.api_key === "configured_via_env") {
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

    const apiKey = keyRow.api_key.trim();
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
          const errBody = await res.json().catch(() => ({}));
          testError = errBody?.error?.message || `Google API returned HTTP ${res.status}`;
        }
      } catch (err: unknown) {
        testLatency = Math.round(performance.now() - startTime);
        testError = err instanceof Error
          ? err.message
          : "Network timeout connecting to Google Gemini API";
      }
    } else {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
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
          const errBody = await res.json().catch(() => ({}));
          testError = errBody?.error?.message || `OpenRouter API returned HTTP ${res.status}`;
        }
      } catch (err: unknown) {
        testLatency = Math.round(performance.now() - startTime);
        testError = err instanceof Error
          ? err.message
          : "Network timeout connecting to OpenRouter API";
      }
    }

    // 4. Record the test result in the database vault
    await serviceClient.rpc("admin_record_provider_test", {
      p_provider: provider,
      p_status: testStatus,
      p_latency_ms: testLatency,
      p_error: testError,
    });

    return new Response(
      JSON.stringify({
        status: testStatus,
        latency_ms: testLatency,
        error_message: testError,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
