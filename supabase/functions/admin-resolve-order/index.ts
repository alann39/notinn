import { createClient } from "@supabase/supabase-js";
import { sendMessage } from "../_shared/telegram/client.ts";
import { type Secret } from "../_shared/config/env.ts";
import { toAppError } from "../_shared/errors/app-error.ts";
import { createLogger } from "../_shared/observability/logger.ts";
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

interface ResolveOrderRequest {
  order_id: string;
  action: "cancel" | "expire";
  notes?: string;
  notify_user?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: CORS_HEADERS });
  }

  let config: WebFunctionConfig;
  try {
    config = await loadWebFunctionConfig(Deno.env.toObject());
  } catch (thrown) {
    const error = toAppError(thrown);
    createLogger({
      level: "error",
      context: { function_name: "admin-resolve-order" },
    }).error("admin-resolve-order.configuration_failed", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return new Response(
      JSON.stringify({ error: "Missing configuration" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = config.supabaseUrl;
  const anonKey = config.anonKey;
  const botToken: Secret | null = config.botToken;

  try {
    // 1. Authorize caller: requires Authorization header
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

    const { data: isAdmin, error: adminCheckError } = await userClient.rpc(
      "is_current_user_admin",
    );
    if (adminCheckError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Caller is not an admin" }),
        {
          status: 403,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Parse request body
    const body: ResolveOrderRequest = await req.json().catch(() => ({}));
    const { order_id, action, notes, notify_user = false } = body;

    if (!order_id || (action !== "cancel" && action !== "expire")) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid payload: order_id and action ('cancel' | 'expire') required",
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Resolve order via RPC
    const { data, error: rpcError } = await userClient.rpc(
      "admin_resolve_payment_order",
      {
        p_order_id: order_id,
        p_action: action,
        p_notes: notes ?? null,
      },
    );

    if (rpcError) {
      // Never echo raw database errors to the caller: they can reveal schema
      // details, table names or constraints. Detail goes to the operator log
      // only (P4).
      createLogger({
        level: "error",
        context: { function_name: "admin-resolve-order" },
      }).error("admin-resolve-order.rpc_failed", {
        error_code: rpcError.code,
        error_name: rpcError.name,
        error_detail: rpcError.message,
      });
      return new Response(
        JSON.stringify({ error: "Failed to resolve order" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    const telegramUserId = result?.telegram_user_id
      ? Number(result.telegram_user_id)
      : null;
    const orderCode = result?.order_code ?? "NOTINN";
    const newStatus = result?.new_status ??
      (action === "cancel" ? "cancelled" : "expired");

    // 4. Send Telegram notification to user if requested
    let notified = false;
    if (notify_user && telegramUserId && botToken !== null) {
      let message = "";
      if (action === "cancel") {
        message = [
          "ℹ️ <b>Pesanan Upgrade Dibatalkan</b>",
          "",
          `Pesanan upgrade Anda dengan kode <code>${orderCode}</code> telah dibatalkan oleh operator.`,
          notes ? `\n<i>Catatan: ${notes}</i>` : "",
          "",
          "Jika Anda masih ingin melakukan upgrade ke Notinn Pro, silakan buat pesanan baru kapan saja melalui perintah /upgrade.",
        ].filter(Boolean).join("\n");
      } else {
        message = [
          "⌛ <b>Pesanan Upgrade Kadaluarsa</b>",
          "",
          `Batas waktu pembayaran untuk pesanan <code>${orderCode}</code> telah berakhir dan ditandai kadaluarsa.`,
          notes ? `\n<i>Catatan: ${notes}</i>` : "",
          "",
          "Silakan buat pesanan baru melalui perintah /upgrade jika Anda ingin melanjutkan upgrade akun ke Notinn Pro.",
        ].filter(Boolean).join("\n");
      }

      try {
        await sendMessage(botToken, telegramUserId, message, {
          parseMode: "HTML",
        });
        notified = true;
      } catch {
        // Logically ignore failure to avoid blocking operator workflow
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        order_id,
        order_code: orderCode,
        new_status: newStatus,
        notified,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const error = toAppError(err);
    createLogger({
      level: "error",
      context: { function_name: "admin-resolve-order" },
    }).error("admin-resolve-order.unhandled", {
      error_code: error.code,
      error_name: error.name,
      error_detail: error.internalDetail,
    });
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
