import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Secret } from "../config/env.ts";

/**
 * The server-side Supabase client.
 *
 * Three properties matter here and each is deliberate:
 *
 *   * It authenticates with the service-role key, which bypasses row level
 *     security. That is not a shortcut — it is the point. Every table in the
 *     schema has RLS enabled with no policies, so anon and authenticated callers
 *     can read nothing at all. The only way in is through the server-side
 *     functions this client is allowed to call. See docs/ADR/0005-access-model.md.
 *
 *   * It is constructed once per request and never cached across requests. A
 *     Supabase client holds its authorisation header; sharing one between
 *     requests would share that header, which is how a service-role key leaks
 *     into a context that should not have it.
 *
 *   * Every request carries a timeout. A database call that never returns would
 *     hold the webhook open until Supabase kills the function, which Telegram
 *     would eventually treat as a delivery failure. Failing fast and letting
 *     Telegram redeliver is strictly better, because redelivery is safe: the
 *     update_id deduplication makes a second delivery a no-op.
 */

/**
 * How long a single database call may take.
 *
 * Telegram's webhook timeout is generous, and Supabase Edge Functions allow far
 * more than this. The bound exists so that a struggling database produces a fast
 * failure and a redelivery rather than a stalled function.
 */
export const DATABASE_TIMEOUT_MS = 8_000;

export type ServiceClient = SupabaseClient;

/**
 * Build a service-role client for one request.
 *
 * The key is revealed here and nowhere else. `reveal()` is deliberately the only
 * accessor on `Secret`, so this call is the single point in the codebase where
 * the service-role credential is passed to a library.
 */
export function createServiceClient(
  supabaseUrl: string,
  serviceRoleKey: Secret,
  options: { timeoutMs?: number } = {},
): ServiceClient {
  const timeoutMs = options.timeoutMs ?? DATABASE_TIMEOUT_MS;

  return createClient(supabaseUrl, serviceRoleKey.reveal(), {
    auth: {
      // No session to persist or refresh: this is a server identity, not a user.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        // Identifies Notinn's own traffic in Supabase's logs.
        "x-application-name": "notinn-telegram-webhook",
      },
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
        }),
    },
  });
}
