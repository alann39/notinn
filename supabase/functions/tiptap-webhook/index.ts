/**
 * TipTap Webhook Edge Function.
 *
 * Receives payment notifications from TipTap (QRIS/E-Wallet), extracts the
 * reference order code (NOTINN-XXXX) from the payment message, completes
 * the order, upgrades the user to Pro (stacking 30 days), and notifies the user via Telegram.
 *
 * Privacy rule: Never log the message body or user note content.
 */

import { Secret } from "../_shared/config/env.ts";
import { createServiceClient } from "../_shared/db/client.ts";
import { PaymentRepository } from "../_shared/repositories/payment.repository.ts";
import { constantTimeEquals } from "../_shared/security/webhook-secret.ts";
import { sendMessage } from "../_shared/telegram/client.ts";

const ORDER_CODE_REGEX = /NOTINN-[A-Z0-9]{4,6}/i;

interface TipTapPayload {
  message?: string;
  pesan?: string;
  note?: string;
  description?: string;
  amount?: number | string;
  nominal?: number | string;
  gross_amount?: number | string;
  id?: string;
  payment_id?: string;
  transaction_id?: string;
  data?: {
    message?: string;
    pesan?: string;
    note?: string;
    description?: string;
    amount?: number | string;
    nominal?: number | string;
    gross_amount?: number | string;
    id?: string;
    payment_id?: string;
    transaction_id?: string;
  };
}

function extractMessage(payload: TipTapPayload): string {
  return (
    payload.message ??
      payload.pesan ??
      payload.note ??
      payload.description ??
      payload.data?.message ??
      payload.data?.pesan ??
      payload.data?.note ??
      payload.data?.description ??
      ""
  );
}

function extractAmount(payload: TipTapPayload): number {
  const raw = payload.amount ??
    payload.nominal ??
    payload.gross_amount ??
    payload.data?.amount ??
    payload.data?.nominal ??
    payload.data?.gross_amount ??
    0;
  const num = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function extractPaymentId(payload: TipTapPayload): string | undefined {
  const raw = payload.id ??
    payload.payment_id ??
    payload.transaction_id ??
    payload.data?.id ??
    payload.data?.payment_id ??
    payload.data?.transaction_id;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
}

function formatIndonesianDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return isoString;
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse body
  let payload: TipTapPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify webhook secret if configured
  const expectedSecret = Deno.env.get("TIPTAP_WEBHOOK_SECRET");
  if (expectedSecret && expectedSecret.trim() !== "") {
    const url = new URL(request.url);
    const querySecret = url.searchParams.get("secret") ??
      url.searchParams.get("token") ??
      url.searchParams.get("key");

    const headerSecret = request.headers.get("x-tiptap-secret") ??
      request.headers.get("x-tiptap-token") ??
      request.headers.get("x-tiptap-signature") ??
      request.headers.get("x-webhook-secret") ??
      request.headers.get("x-api-key") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const rawPayload = payload as Record<string, unknown>;
    const bodySecret = typeof rawPayload.secret === "string"
      ? rawPayload.secret
      : typeof rawPayload.token === "string"
      ? rawPayload.token
      : typeof rawPayload.key === "string"
      ? rawPayload.key
      : typeof rawPayload.webhook_secret === "string"
      ? rawPayload.webhook_secret
      : undefined;

    const providedSecret = headerSecret ?? querySecret ?? bodySecret;
    if (!providedSecret || !(await constantTimeEquals(providedSecret, expectedSecret.trim()))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const rawMessage = extractMessage(payload);
  const amount = extractAmount(payload);
  const paymentId = extractPaymentId(payload);

  const match = rawMessage.match(ORDER_CODE_REGEX);
  if (!match) {
    // Return 200 OK with ok: true so TipTap test webhook verification passes,
    // and unrelated donations are safely acknowledged without retry loops.
    return new Response(
      JSON.stringify({
        ok: true,
        outcome: "acknowledged",
        description: "Webhook received successfully (test or no order code)",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const orderCode = match[0].toUpperCase();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const client = createServiceClient(supabaseUrl, new Secret(serviceRoleKey));
  const paymentRepo = new PaymentRepository(client);

  try {
    const result = await paymentRepo.processTipTapPayment(
      orderCode,
      amount,
      paymentId,
      payload,
    );

    if (result.outcome === "success") {
      // Notify Telegram user if telegram_user_id is available
      const botTokenStr = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (botTokenStr && result.telegramUserId) {
        const expiryFormatted = result.subscriptionExpiresAt
          ? formatIndonesianDate(result.subscriptionExpiresAt)
          : "30 hari ke depan";

        const notification = [
          "🎉 <b>Pembayaran Berhasil Dikonfirmasi!</b>",
          "",
          "Akun Anda telah aktif berlangganan <b>Notinn Pro</b> 🚀",
          `📅 <b>Masa Aktif Hingga:</b> ${expiryFormatted}`,
          "",
          "Terima kasih atas dukungannya! Sekarang Anda dapat menikmati kuota catatan yang lebih besar dan pemrosesan prioritas.",
        ].join("\n");

        try {
          await sendMessage(
            new Secret(botTokenStr),
            result.telegramUserId,
            notification,
            { parseMode: "HTML" },
          );
        } catch {
          // Swallow delivery error to not fail the webhook acknowledgment
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          outcome: "success",
          user_id: result.userId,
          new_plan: result.newPlan,
          subscription_expires_at: result.subscriptionExpiresAt,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (result.outcome === "amount_insufficient" && result.telegramUserId) {
      const botTokenStr = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (botTokenStr) {
        const formattedReceived = `Rp ${Number(amount).toLocaleString("id-ID")}`;
        const notification = [
          "⚠️ <b>Pembayaran Kurang / Nominal Tidak Sesuai</b>",
          "",
          `Sistem mendeteksi pembayaran masuk sebesar <b>${formattedReceived}</b> untuk pesanan <code>${orderCode}</code>.`,
          "",
          "Biaya upgrade Notinn Pro adalah <b>Rp 10.000</b>. Karena nominal yang ditransfer kurang dari biaya yang ditentukan, akun Pro belum dapat diaktifkan.",
          "",
          "💡 Silakan lakukan pembayaran ulang dengan nominal yang sesuai (<b>Rp 10.000</b>) melalui menu /upgrade untuk mendapatkan kode pembayaran baru.",
        ].join("\n");

        try {
          await sendMessage(
            new Secret(botTokenStr),
            result.telegramUserId,
            notification,
            { parseMode: "HTML" },
          );
        } catch {
          // Swallow delivery error
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: false,
        outcome: result.outcome,
        amount_paid: result.amountPaid,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (_thrown) {
    return new Response(
      JSON.stringify({ error: "Failed to process payment" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
