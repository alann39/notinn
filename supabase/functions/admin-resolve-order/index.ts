import { createClient } from "@supabase/supabase-js";
import { sendMessage } from "../_shared/telegram/client.ts";
import { Secret } from "../_shared/config/env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const body: ResolveOrderRequest = await req.json().catch(() => ({}));
    const { order_id, action, notes, notify_user = false } = body;

    if (!order_id || (action !== "cancel" && action !== "expire")) {
      return new Response(
        JSON.stringify({
          error: "Invalid payload: order_id and action ('cancel' | 'expire') required",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 3. Resolve order via RPC
    const { data, error: rpcError } = await userClient.rpc("admin_resolve_payment_order", {
      p_order_id: order_id,
      p_action: action,
      p_notes: notes ?? null,
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    const telegramUserId = result?.telegram_user_id ? Number(result.telegram_user_id) : null;
    const orderCode = result?.order_code ?? "NOTINN";
    const newStatus = result?.new_status ?? (action === "cancel" ? "cancelled" : "expired");

    // 4. Send Telegram notification to user if requested
    let notified = false;
    const botTokenStr = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (notify_user && telegramUserId && botTokenStr) {
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
        await sendMessage(new Secret(botTokenStr), telegramUserId, message, {
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
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
