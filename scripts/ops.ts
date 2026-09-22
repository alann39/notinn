import { loadOperatorConfig } from "../supabase/functions/_shared/config/env.ts";
import { createServiceClient } from "../supabase/functions/_shared/db/client.ts";
import {
  type CancelOutcome,
  type OpsHealth,
  OpsMetricsRepository,
  type OpsUserStatus,
  type ProblematicJob,
  type RequeueOutcome,
} from "../supabase/functions/_shared/repositories/ops-metrics.repository.ts";
import { assertProjectRef } from "./lib/project-ref.ts";
import { requireConfirmation } from "./lib/prompt.ts";

// --- Helpers ----------------------------------------------------------------

function usage(): never {
  console.error(
    [
      "Usage:",
      "  deno task ops health",
      "  deno task ops jobs [--state <STATE>]",
      "  deno task ops usage",
      "  deno task ops user <telegram-user-id>",
      "  deno task ops requeue <job-id> [--allow-provider-call]",
      "  deno task ops cancel <job-id>",
      "",
      "Add --yes for non-interactive execution.",
    ].join("\n"),
  );
  Deno.exit(1);
}

function positiveInteger(value: string | undefined, label: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

function telegramId(value: string | undefined): number {
  return positiveInteger(value, "telegram-user-id", Number.MAX_SAFE_INTEGER);
}

function parseUuid(value: string | undefined, label: string): string {
  if (
    value === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`${label} is not a valid UUID.`);
  }
  return value;
}

function truncateUuid(uuid: string): string {
  return `${uuid.slice(0, 8)}…`;
}

function formatAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function healthStatus(health: OpsHealth): string {
  if (health.staleJobs > 0 || health.deletionBacklog > 0) return "CRITICAL";
  if (health.failedJobs > 0) return "WARNING";
  return "OK";
}

function healthActions(health: OpsHealth): string {
  const count = health.staleJobs + health.deletionBacklog + (health.failedJobs > 0 ? 1 : 0);
  if (count === 0) return "no action needed";
  return `${count} action(s) needed`;
}

// --- Subcommands ------------------------------------------------------------

function cmdHealth(health: OpsHealth, ref: string): void {
  const status = healthStatus(health);
  const statusIcon = status === "CRITICAL" ? "🔴" : status === "WARNING" ? "🟡" : "🟢";

  console.log(`Notinn System Health — ${ref}`);
  console.log("─".repeat(50));
  console.log(`Queue depth:        ${health.queueDepth} job(s)`);
  console.log(`Stale jobs (>10m):  ${health.staleJobs}`);
  console.log(`Failed jobs:        ${health.failedJobs}`);
  console.log(`Deletion backlog:   ${health.deletionBacklog} (past deadline)`);
  console.log(`Active users:       ${health.activeUsers}`);
  console.log(`Total notes:        ${health.totalNotes}`);
  console.log("─".repeat(50));
  console.log(`${statusIcon} Status: ${status} (${healthActions(health)})`);
}

function cmdJobs(jobs: readonly ProblematicJob[]): void {
  if (jobs.length === 0) {
    console.log("No problematic jobs found.");
    return;
  }

  console.log(`Found ${jobs.length} problematic job(s):`);
  console.log("");
  for (const job of jobs) {
    console.log(`  Job:     ${truncateUuid(job.jobId)} (${job.jobId})`);
    console.log(`  User:    ${job.userId !== null ? truncateUuid(job.userId) : "—"}`);
    console.log(`  State:   ${job.state}`);
    console.log(`  Attempts: ${job.attemptCount}`);
    console.log(`  Age:     ${formatAge(job.createdAt)}`);
    console.log(`  Error:   ${job.lastErrorCode ?? "—"}`);
    console.log("");
  }
}

function cmdUser(status: OpsUserStatus): void {
  console.log("User status:");
  console.log("");
  console.log(`  Internal ID:     ${status.internalUserId}`);
  console.log(`  Status:          ${status.status}`);
  console.log(`  Alpha access:    ${status.alphaAccessStatus ?? "—"}`);
  console.log(`  Plan:            ${status.planKey ?? "—"}`);
  console.log(`  Notes:           ${status.notesCount}`);
  console.log(`  Active jobs:     ${status.activeJobs}`);
  console.log(`  Failed jobs:     ${status.failedJobs}`);
}

function cmdRequeueOutcome(
  outcome: RequeueOutcome,
  jobId: string,
  allowProviderCall: boolean,
): void {
  switch (outcome) {
    case "requeued":
      console.log(`Job ${jobId} requeued successfully.`);
      break;
    case "no_note_yet":
      if (!allowProviderCall) {
        console.log(
          `Job ${jobId} has no note yet — the provider has not been called.\n` +
            `Requeuing would trigger a new AI generation.\n` +
            `Use --allow-provider-call to proceed, and confirm with --yes.`,
        );
      } else {
        console.log(`Job ${jobId} requeued (provider will be called).`);
      }
      break;
    case "not_found":
      console.log(`Job ${jobId} not found.`);
      break;
    case "terminal":
      console.log(`Job ${jobId} is already in a terminal state.`);
      break;
  }
}

function cmdCancelOutcome(outcome: CancelOutcome, jobId: string): void {
  switch (outcome) {
    case "cancelled":
      console.log(`Job ${jobId} cancelled.`);
      break;
    case "not_found":
      console.log(`Job ${jobId} not found.`);
      break;
    case "already_terminal":
      console.log(`Job ${jobId} is already in a terminal state.`);
      break;
  }
}

// --- Main -------------------------------------------------------------------

async function main(): Promise<void> {
  const rawArgs = Deno.args;
  const args = rawArgs.filter((arg) => arg !== "--yes" && arg !== "--allow-provider-call");
  const hasAllowProviderCall = rawArgs.includes("--allow-provider-call");

  const action = args[0];
  if (action === undefined) usage();

  const config = await loadOperatorConfig();
  if (config.environment === "production") {
    throw new Error("Operator commands are disabled for NOTINN_ENV=production.");
  }

  const ref = assertProjectRef(config.supabaseUrl);
  const client = createServiceClient(config.supabaseUrl, config.serviceRoleKey);
  const repo = new OpsMetricsRepository(client);

  if (action === "health") {
    const health = await repo.getHealth();
    cmdHealth(health, ref);
    return;
  }

  if (action === "jobs") {
    const jobs = await repo.getProblematicJobs();
    cmdJobs(jobs);
    return;
  }

  if (action === "usage") {
    // Aggregate usage across all users via direct postgrest query.
    // get_user_usage_summary is per-user; this gives an operator-level view.
    const result = await client
      .from("quota_buckets")
      .select("metric, used_units, period_start");
    if (result.error !== null) {
      throw new Error(`Usage query failed: ${result.error.message}`);
    }
    const buckets = (result.data ?? []) as {
      metric: string;
      used_units: number;
      period_start: string;
    }[];
    const byMetric: Record<string, number> = {};
    for (const b of buckets) {
      byMetric[b.metric] = (byMetric[b.metric] ?? 0) + b.used_units;
    }
    const rows = Object.entries(byMetric).map(([metric, used]) => ({
      metric,
      used_units: used,
    }));
    if (rows.length === 0) {
      console.log("No usage data found.");
    } else {
      console.log("Usage summary (all users, current period):");
      console.log("");
      for (const row of rows) {
        console.log(`  ${row.metric}: ${row.used_units} unit(s)`);
      }
    }
    return;
  }

  if (action === "user") {
    const id = telegramId(args[1]);
    const status = await repo.getUserStatus(id);
    if (status === null) {
      console.log(`No user found with Telegram ID ${id}.`);
      return;
    }
    cmdUser(status);
    return;
  }

  if (action === "requeue") {
    const jobId = parseUuid(args[1], "job-id");
    const outcome = await repo.requeueJob(jobId);

    // If the provider has not been called yet and the operator did not
    // explicitly allow it, refuse the requeue.
    if (outcome === "no_note_yet" && !hasAllowProviderCall) {
      cmdRequeueOutcome(outcome, jobId, false);
      return;
    }

    if (hasAllowProviderCall) {
      await requireConfirmation(
        rawArgs,
        `Requeue job ${jobId}? This will trigger a new AI generation.`,
      );
    }

    // If we get here, either the note exists or the operator confirmed.
    // Re-call to actually perform the requeue.
    const finalOutcome = await repo.requeueJob(jobId);
    cmdRequeueOutcome(finalOutcome, jobId, hasAllowProviderCall);
    return;
  }

  if (action === "cancel") {
    const jobId = parseUuid(args[1], "job-id");
    await requireConfirmation(rawArgs, `Cancel job ${jobId}?`);
    const outcome = await repo.cancelJob(jobId);
    cmdCancelOutcome(outcome, jobId);
    return;
  }

  usage();
}

if (import.meta.main) {
  try {
    await main();
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    console.error(`\nops: ${message}`);
    Deno.exit(1);
  }
}
