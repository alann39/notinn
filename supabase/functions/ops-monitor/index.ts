/**
 * Ops Monitor — Edge Function for automated operational alerts.
 *
 * Runs on a pg_cron schedule. Checks queue health, failed jobs, deletion
 * backlog, and sends alerts to a configurable Telegram chat.
 *
 * Authenticates via `X-Notinn-Worker-Secret`, same boundary as `process-job`.
 */

import { loadWorkerConfig } from "../_shared/config/env.ts";
import { createServiceClient } from "../_shared/db/client.ts";
import { OpsMetricsRepository } from "../_shared/repositories/ops-metrics.repository.ts";
import { constantTimeEquals } from "../_shared/security/webhook-secret.ts";

// --- Alert deduplication ----------------------------------------------------

interface AlertEntry {
  lastAlertedAt: number;
}

const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const alertCache = new Map<string, AlertEntry>();

function shouldAlert(key: string): boolean {
  const entry = alertCache.get(key);
  if (entry === undefined) return true;
  return Date.now() - entry.lastAlertedAt > ALERT_COOLDOWN_MS;
}

function recordAlert(key: string): void {
  alertCache.set(key, { lastAlertedAt: Date.now() });
}

// --- Telegram alert sending -------------------------------------------------

async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  message: string,
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// --- Health checks ----------------------------------------------------------

interface AlertCheck {
  readonly key: string;
  readonly condition: boolean;
  readonly message: string;
}

function buildAlerts(
  health: {
    queueDepth: number;
    staleJobs: number;
    failedJobs: number;
    deletionBacklog: number;
  },
  environment: string,
): AlertCheck[] {
  const prefix = `🚨 ALERT [${environment}]`;

  return [
    {
      key: "stale_jobs",
      condition: health.staleJobs > 0,
      message: `${prefix} stale_jobs: ${health.staleJobs} stale active job(s)`,
    },
    {
      key: "failed_jobs",
      condition: health.failedJobs > 0,
      message: `${prefix} failed_jobs: ${health.failedJobs} failed job(s)`,
    },
    {
      key: "deletion_backlog",
      condition: health.deletionBacklog > 0,
      message: `${prefix} deletion_backlog: ${health.deletionBacklog} overdue deletion(s)`,
    },
    {
      key: "queue_depth",
      condition: health.queueDepth > 20,
      message: `${prefix} queue_depth: ${health.queueDepth} jobs in queue`,
    },
  ];
}

// --- Edge Function entry point ----------------------------------------------

const WORKER_SECRET_HEADER = "x-notinn-worker-secret";

Deno.serve(async (request: Request): Promise<Response> => {
  // Authenticate with the same secret boundary as process-job.
  const config = await loadWorkerConfig();
  const providedSecret = request.headers.get(WORKER_SECRET_HEADER);
  if (providedSecret === null) {
    return new Response(null, { status: 401 });
  }
  if (!await constantTimeEquals(providedSecret, config.internalWorkerSecret.reveal())) {
    return new Response(null, { status: 401 });
  }

  // Health checks.
  const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);
  const repo = new OpsMetricsRepository(client);

  let health;
  try {
    health = await repo.getHealth();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "health query failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const alerts = buildAlerts(health, config.environment);

  // Send alerts for conditions that are triggered and not on cooldown.
  const opsChatId = Deno.env.get("OPS_ALERT_CHAT_ID");
  const botToken = config.botToken.reveal();
  const sentAlerts: string[] = [];

  if (opsChatId !== undefined && opsChatId.trim() !== "") {
    for (const alert of alerts) {
      if (alert.condition && shouldAlert(alert.key)) {
        const ok = await sendTelegramAlert(botToken, opsChatId, alert.message);
        if (ok) {
          recordAlert(alert.key);
          sentAlerts.push(alert.key);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      environment: config.environment,
      health: {
        queueDepth: health.queueDepth,
        staleJobs: health.staleJobs,
        failedJobs: health.failedJobs,
        deletionBacklog: health.deletionBacklog,
        activeUsers: health.activeUsers,
        totalNotes: health.totalNotes,
      },
      alertsSent: sentAlerts,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
