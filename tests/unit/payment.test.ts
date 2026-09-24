import { assertEquals, assertRejects } from "@std/assert";
import { PaymentRepository } from "../../supabase/functions/_shared/repositories/payment.repository.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { sendNavigationCommand } from "../../supabase/functions/_shared/services/navigation.service.ts";
import type { CommandMessage } from "../../supabase/functions/_shared/telegram/parse-update.ts";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";

function paymentHarness(rpcData: unknown = null, rpcError: unknown = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];

  const client = {
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpcData, error: rpcError });
    },
  } as never;

  const repo = new PaymentRepository(client);
  return { repo, calls };
}

function dbError() {
  return { code: "42P01", message: "relation does not exist" };
}

// --- createUpgradeOrder tests -----------------------------------------------

Deno.test("createUpgradeOrder returns parsed order with early bird quota", async () => {
  const { repo, calls } = paymentHarness([
    {
      order_code: "NOTINN-7A8B",
      amount_idr: 10000,
      is_early_bird: true,
      early_bird_remaining: 87,
      expires_at: "2026-09-24T12:00:00Z",
    },
  ]);

  const order = await repo.createUpgradeOrder(USER_ID);

  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.fn, "create_upgrade_order");
  assertEquals(calls[0]!.args, { p_user_id: USER_ID });
  assertEquals(order.orderCode, "NOTINN-7A8B");
  assertEquals(order.amountIdr, 10000);
  assertEquals(order.isEarlyBird, true);
  assertEquals(order.earlyBirdRemaining, 87);
  assertEquals(order.expiresAt, "2026-09-24T12:00:00Z");
});

Deno.test("createUpgradeOrder handles regular price tier when early bird sold out", async () => {
  const { repo } = paymentHarness([
    {
      order_code: "NOTINN-9F2C",
      amount_idr: 20000,
      is_early_bird: false,
      early_bird_remaining: 0,
      expires_at: "2026-09-24T12:00:00Z",
    },
  ]);

  const order = await repo.createUpgradeOrder(USER_ID);

  assertEquals(order.orderCode, "NOTINN-9F2C");
  assertEquals(order.amountIdr, 20000);
  assertEquals(order.isEarlyBird, false);
  assertEquals(order.earlyBirdRemaining, 0);
});

Deno.test("createUpgradeOrder throws AppError on database failure", async () => {
  const { repo } = paymentHarness(null, dbError());

  await assertRejects(() => repo.createUpgradeOrder(USER_ID), AppError);
});

// --- processTipTapPayment tests ---------------------------------------------

Deno.test("processTipTapPayment handles successful payment confirmation", async () => {
  const { repo, calls } = paymentHarness([
    {
      outcome: "success",
      user_id: USER_ID,
      telegram_user_id: 123456789,
      new_plan: "pro",
      subscription_expires_at: "2026-10-24T12:00:00Z",
      amount_paid: 10000,
    },
  ]);

  const result = await repo.processTipTapPayment(
    "NOTINN-7A8B",
    10000,
    "tiptap_tx_123",
    { message: "Donation NOTINN-7A8B" },
  );

  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.fn, "process_tiptap_payment");
  assertEquals(result.outcome, "success");
  assertEquals(result.userId, USER_ID);
  assertEquals(result.telegramUserId, 123456789);
  assertEquals(result.newPlan, "pro");
  assertEquals(result.subscriptionExpiresAt, "2026-10-24T12:00:00Z");
  assertEquals(result.amountPaid, 10000);
});

Deno.test("processTipTapPayment handles amount_insufficient outcome", async () => {
  const { repo } = paymentHarness([
    {
      outcome: "amount_insufficient",
      user_id: USER_ID,
      telegram_user_id: null,
      new_plan: null,
      subscription_expires_at: null,
      amount_paid: 5000,
    },
  ]);

  const result = await repo.processTipTapPayment("NOTINN-7A8B", 5000);

  assertEquals(result.outcome, "amount_insufficient");
  assertEquals(result.amountPaid, 5000);
});

Deno.test("processTipTapPayment handles order_not_found outcome", async () => {
  const { repo } = paymentHarness([
    {
      outcome: "order_not_found",
      user_id: null,
      telegram_user_id: null,
      new_plan: null,
      subscription_expires_at: null,
      amount_paid: 10000,
    },
  ]);

  const result = await repo.processTipTapPayment("NOTINN-XXXX", 10000);

  assertEquals(result.outcome, "order_not_found");
});

// --- getUserSubscription tests ----------------------------------------------

Deno.test("getUserSubscription returns active subscription info", async () => {
  const { repo, calls } = paymentHarness([
    {
      plan_key: "pro",
      starts_at: "2026-09-24T00:00:00Z",
      expires_at: "2026-10-24T00:00:00Z",
      status: "active",
      days_remaining: 30,
    },
  ]);

  const sub = await repo.getUserSubscription(USER_ID);

  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.fn, "get_user_subscription");
  assertEquals(sub?.planKey, "pro");
  assertEquals(sub?.status, "active");
  assertEquals(sub?.daysRemaining, 30);
});

Deno.test("getUserSubscription returns null when user has no active subscription", async () => {
  const { repo } = paymentHarness([]);

  const sub = await repo.getUserSubscription(USER_ID);

  assertEquals(sub, null);
});

// --- Navigation upgrade view tests ------------------------------------------

Deno.test("upgrade view renders payment details and TipTap link for free user", async () => {
  const command: CommandMessage = {
    updateId: 1,
    messageId: 100,
    telegramUserId: 12345,
    telegramChatId: 12345,
    telegramUsername: "testuser",
    displayName: "Test User",
    command: "upgrade",
    argumentsText: null,
  };

  const fakePayments = {
    createUpgradeOrder: (_uid: string) =>
      Promise.resolve({
        orderCode: "NOTINN-TEST",
        amountIdr: 10000,
        isEarlyBird: true,
        earlyBirdRemaining: 42,
        expiresAt: "2026-09-24T12:00:00Z",
      }),
    getUserSubscription: (_uid: string) => Promise.resolve(null),
  };

  const fakeNotes = {
    listRecentSavedNotes: () => Promise.resolve([]),
  };

  let sentText = "";
  let sentKeyboard: unknown = null;

  const fakeTelegram = {
    sendMessage: (
      _chatId: number,
      text: string,
      options?: { inlineKeyboard?: unknown },
    ) => {
      sentText = text;
      sentKeyboard = options?.inlineKeyboard;
      return Promise.resolve(true as never);
    },
  };

  await sendNavigationCommand(command, USER_ID, {
    notes: fakeNotes,
    payments: fakePayments,
    telegram: fakeTelegram,
    userPlanKey: "free",
  });

  assertEquals(sentText.includes("NOTINN-TEST"), true);
  assertEquals(sentText.includes("Rp 10.000"), true);
  assertEquals(sentText.includes("42/100 slot"), true);
  assertEquals(sentText.includes("https://tiptap.gg/notinn"), true);

  // Check URL button in keyboard
  const keyboard = sentKeyboard as { inline_keyboard: { text: string; url?: string }[][] };
  const firstButton = keyboard.inline_keyboard[0]![0]!;
  assertEquals(firstButton.text.includes("Bayar via TipTap"), true);
  assertEquals(firstButton.url, "https://tiptap.gg/notinn");
});

Deno.test("upgrade view renders extension info when user already has active Pro subscription", async () => {
  const command: CommandMessage = {
    updateId: 2,
    messageId: 101,
    telegramUserId: 12345,
    telegramChatId: 12345,
    telegramUsername: "testuser",
    displayName: "Test User",
    command: "upgrade",
    argumentsText: null,
  };

  const fakePayments = {
    createUpgradeOrder: (_uid: string) =>
      Promise.resolve({
        orderCode: "NOTINN-EXTD",
        amountIdr: 10000,
        isEarlyBird: true,
        earlyBirdRemaining: 15,
        expiresAt: "2026-09-24T12:00:00Z",
      }),
    getUserSubscription: (_uid: string) =>
      Promise.resolve({
        planKey: "pro",
        startsAt: "2026-09-20T00:00:00Z",
        expiresAt: "2026-10-20T00:00:00Z",
        status: "active",
        daysRemaining: 26,
      }),
  };

  const fakeNotes = {
    listRecentSavedNotes: () => Promise.resolve([]),
  };

  let sentText = "";
  let sentKeyboard: unknown = null;

  const fakeTelegram = {
    sendMessage: (
      _chatId: number,
      text: string,
      options?: { inlineKeyboard?: unknown },
    ) => {
      sentText = text;
      sentKeyboard = options?.inlineKeyboard;
      return Promise.resolve(true as never);
    },
  };

  await sendNavigationCommand(command, USER_ID, {
    notes: fakeNotes,
    payments: fakePayments,
    telegram: fakeTelegram,
    userPlanKey: "pro",
  });

  assertEquals(sentText.includes("Anda Sedang Berlangganan Notinn Pro!"), true);
  assertEquals(sentText.includes("+30 hari"), true);
  assertEquals(sentText.includes("NOTINN-EXTD"), true);

  // Check URL button in keyboard
  const keyboard = sentKeyboard as { inline_keyboard: { text: string; url?: string }[][] };
  const firstButton = keyboard.inline_keyboard[0]![0]!;
  assertEquals(firstButton.text.includes("Perpanjang via TipTap"), true);
  assertEquals(firstButton.url, "https://tiptap.gg/notinn");
});
