/**
 * Dashboard Auth — Edge Function for magic-link account linking.
 *
 * Flow:
 * 1. Telegram bot generates a signed, time-limited token containing user_id + nonce
 * 2. User clicks the magic link which calls this function with { token }
 * 3. This function validates the HMAC, consumes the nonce, creates/retrieves
 *    the Supabase Auth user, links it to the internal user, and returns a session.
 *
 * Authentication: The token itself is the authentication factor. verify_jwt is
 * disabled because the caller is a browser redirect, not a Supabase client.
 *
 * Privacy: The token payload contains only the internal user UUID and a random
 * nonce — no Telegram identity, no content.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { verifyMagicToken } from "../_shared/security/magic-token.ts";
import {
  loadWebFunctionConfig,
  type WebFunctionConfig,
} from "../_shared/config/env.ts";
import { toAppError } from "../_shared/errors/app-error.ts";
import { createLogger } from "../_shared/observability/logger.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Handle GET request from Telegram inline keyboard button: redirect browser to dashboard
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token parameter", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }
    // GET redirect only: POST loads the full validated config below.
    // The localhost default is dev-only; production sets DASHBOARD_URL.
    const dashboardUrl =
      (Deno.env.get("DASHBOARD_URL") || "http://localhost:5173").replace(
        /\/+$/,
        "",
      );
    return Response.redirect(
      `${dashboardUrl}/auth/callback?token=${encodeURIComponent(token)}`,
      302,
    );
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: CORS_HEADERS });
  }

  let config: WebFunctionConfig;
  try {
    // P3: centralized loader — fail-fast, Secret-wrapped, no raw reads.
    // requireDashboard: the magic-link flow is meaningless without it.
    config = await loadWebFunctionConfig(Deno.env.toObject(), {
      requireDashboard: true,
    });
  } catch (thrown) {
    const error = toAppError(thrown);
    createLogger({
      level: "error",
      context: { function_name: "dashboard-auth" },
    }).error("dashboard-auth.configuration_failed", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return new Response(null, { status: 500, headers: CORS_HEADERS });
  }

  // Non-null after requireDashboard: linkSecret + url both present.
  const dashboard = config.dashboard!;
  const supabaseUrl = config.supabaseUrl;
  const serviceRoleKey = config.serviceRoleKey.reveal();
  const dashboardLinkSecret = dashboard.linkSecret.reveal();
  const anonKey = config.anonKey;

  try {
    const log = createLogger({
      level: "error",
      context: { function_name: "dashboard-auth" },
    });

    const body = await req.json().catch(() => null);
    if (!body || typeof body.token !== "string" || body.token.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid token" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const { token } = body;
    const verified = await verifyMagicToken(token, dashboardLinkSecret);
    if (verified === null) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const { user_id, nonce } = verified;

    // Service-role client for database operations
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Consume the nonce (single-use)
    const { data: consumedUserId, error: consumeError } = await supabase.rpc(
      "consume_auth_link_token",
      { p_nonce: nonce },
    );

    if (consumeError || !consumedUserId) {
      return new Response(
        JSON.stringify({
          error:
            "This link has already been used or has expired. Please generate a new one with /web in Telegram.",
        }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    if (consumedUserId !== user_id) {
      return new Response(
        JSON.stringify({ error: "Token mismatch" }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // Deterministic email based on internal UUID
    const syntheticEmail = `${user_id}@notinn.internal`;

    // Try to find existing auth user via get_auth_link RPC
    const { data: existingAuthUserId } = await supabase.rpc("get_auth_link", {
      p_user_id: user_id,
    });

    let authUserId: string | null = existingAuthUserId ?? null;

    if (!authUserId) {
      // Create new Supabase Auth user
      const { data: newAuthUser, error: createError } = await supabase.auth
        .admin.createUser({
          email: syntheticEmail,
          email_confirm: true,
          user_metadata: { notinn_user_id: user_id },
        });

      if (createError) {
        if (
          createError.message?.toLowerCase().includes("already been registered")
        ) {
          // User already exists in auth.users, proceed to generateLink
        } else {
          log.error("dashboard-auth.create_user_failed", {
            error_code: "AUTH_CREATE_USER_FAILED",
            error_name: createError.name,
            error_detail: toAppError(createError).internalDetail,
          });
          return new Response(
            JSON.stringify({ error: "Failed to create session" }),
            {
              status: 500,
              headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            },
          );
        }
      } else if (newAuthUser?.user) {
        authUserId = newAuthUser.user.id;

        // Link auth user to internal user
        const { error: linkError } = await supabase.rpc("upsert_auth_link", {
          p_auth_user_id: authUserId,
          p_user_id: user_id,
        });

        if (linkError) {
          log.error("dashboard-auth.create_link_failed", {
            error_code: "AUTH_LINK_FAILED",
            error_name: linkError.name,
            error_detail: toAppError(linkError).internalDetail,
          });
          return new Response(
            JSON.stringify({ error: "Failed to link account" }),
            {
              status: 500,
              headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    // Generate link/session for the auth user
    const { data: session, error: sessionError } = await supabase.auth.admin
      .generateLink({
        type: "magiclink",
        email: syntheticEmail,
      });

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // Verify token hash if available to obtain access & refresh tokens
    const hashedToken =
      ("properties" in session && session.properties?.hashed_token) || null;
    if (hashedToken) {
      // P3: anonKey comes from the loader — no service-role fallback.
      const verifyRes = await fetch(
        `${supabaseUrl}/auth/v1/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({
            type: "magiclink",
            token_hash: hashedToken,
          }),
        },
      );

      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        return new Response(
          JSON.stringify({
            access_token: verifyData.access_token,
            refresh_token: verifyData.refresh_token,
          }),
          {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          },
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Failed to create session" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const error = toAppError(err);
    createLogger({
      level: "error",
      context: { function_name: "dashboard-auth" },
    }).error("dashboard-auth.unhandled", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return new Response(null, { status: 500, headers: CORS_HEADERS });
  }
});
