import { assertEquals, assertRejects } from "@std/assert";
import { OpsMetricsRepository } from "../../supabase/functions/_shared/repositories/ops-metrics.repository.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";

// --- Test harness -----------------------------------------------------------

function harness(rpcData: unknown = null, rpcError: unknown = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];

  const client = {
    rpc: (
      fn: string,
      args: Record<string, unknown> = {},
    ) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpcData, error: rpcError });
    },
  } as never;

  const repo = new OpsMetricsRepository(client);
  return { repo, calls };
}

function dbError() {
  return { code: "42P01", message: "relation does not exist" };
}

// --- Tests ------------------------------------------------------------------

Deno.test("getHealth returns parsed health metrics", async () => {
  const { repo, calls } = harness({
    queue_depth: 5,
    stale_jobs: 1,
    failed_jobs: 2,
    deletion_backlog: 0,
    active_users: 10,
    total_notes: 47,
  });

  const health = await repo.getHealth();

  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.fn, "get_ops_health");
  assertEquals(health.queueDepth, 5);
  assertEquals(health.staleJobs, 1);
  assertEquals(health.failedJobs, 2);
  assertEquals(health.deletionBacklog, 0);
  assertEquals(health.activeUsers, 10);
  assertEquals(health.totalNotes, 47);
});

Deno.test("getHealth throws on unexpected shape", async () => {
  const { repo } = harness({ not_a_valid_row: true });

  await assertRejects(() => repo.getHealth(), AppError);
});

Deno.test("getHealth throws on database error", async () => {
  const { repo } = harness(null, dbError());

  await assertRejects(() => repo.getHealth(), AppError);
});

const JOB_UUID = "550e8400-e29b-41d4-a716-446655440001";
const USER_UUID = "550e8400-e29b-41d4-a716-446655440002";

Deno.test("getProblematicJobs returns parsed job list", async () => {
  const { repo, calls } = harness([
    {
      job_id: JOB_UUID,
      user_id: USER_UUID,
      state: "retryable_failed",
      attempt_count: 3,
      created_at: "2026-09-22T00:00:00Z",
      last_error_code: "provider_error",
    },
  ]);

  const jobs = await repo.getProblematicJobs();

  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.fn, "get_ops_problematic_jobs");
  assertEquals(jobs.length, 1);
  assertEquals(jobs[0]!.jobId, JOB_UUID);
  assertEquals(jobs[0]!.state, "retryable_failed");
  assertEquals(jobs[0]!.attemptCount, 3);
  assertEquals(jobs[0]!.lastErrorCode, "provider_error");
});

Deno.test("getProblematicJobs returns empty array for no problems", async () => {
  const { repo } = harness([]);

  const jobs = await repo.getProblematicJobs();

  assertEquals(jobs.length, 0);
});

Deno.test("getUserStatus returns user details when found", async () => {
  const { repo } = harness({
    internal_user_id: USER_UUID,
    status: "active",
    alpha_access_status: "active",
    plan_key: "alpha",
    notes_count: 5,
    active_jobs: 1,
    failed_jobs: 0,
  });

  const status = await repo.getUserStatus(123456);

  assertEquals(status?.internalUserId, USER_UUID);
  assertEquals(status?.status, "active");
  assertEquals(status?.alphaAccessStatus, "active");
  assertEquals(status?.planKey, "alpha");
  assertEquals(status?.notesCount, 5);
  assertEquals(status?.activeJobs, 1);
  assertEquals(status?.failedJobs, 0);
});

Deno.test("getUserStatus returns null when user not found", async () => {
  const { repo } = harness([]);

  const status = await repo.getUserStatus(999999);

  assertEquals(status, null);
});

Deno.test("requeueJob returns requeued on success", async () => {
  const { repo } = harness("requeued");

  const outcome = await repo.requeueJob(
    "00000000-0000-0000-0000-000000000001",
  );

  assertEquals(outcome, "requeued");
});

Deno.test("requeueJob returns no_note_yet when note is null", async () => {
  const { repo } = harness("no_note_yet");

  const outcome = await repo.requeueJob(
    "00000000-0000-0000-0000-000000000001",
  );

  assertEquals(outcome, "no_note_yet");
});

Deno.test("requeueJob returns terminal for completed job", async () => {
  const { repo } = harness("terminal");

  const outcome = await repo.requeueJob(
    "00000000-0000-0000-0000-000000000001",
  );

  assertEquals(outcome, "terminal");
});

Deno.test("requeueJob returns not_found for missing job", async () => {
  const { repo } = harness("not_found");

  const outcome = await repo.requeueJob(
    "00000000-0000-0000-0000-000000000001",
  );

  assertEquals(outcome, "not_found");
});

Deno.test("cancelJob returns cancelled on success", async () => {
  const { repo } = harness("cancelled");

  const outcome = await repo.cancelJob(
    "00000000-0000-0000-0000-000000000001",
  );

  assertEquals(outcome, "cancelled");
});

Deno.test("cancelJob returns already_terminal for completed job", async () => {
  const { repo } = harness("already_terminal");

  const outcome = await repo.cancelJob(
    "00000000-0000-0000-0000-000000000001",
  );

  assertEquals(outcome, "already_terminal");
});

Deno.test("cancelJob returns not_found for missing job", async () => {
  const { repo } = harness("not_found");

  const outcome = await repo.cancelJob(
    "00000000-0000-0000-0000-000000000001",
  );

  assertEquals(outcome, "not_found");
});

Deno.test("all methods throw AppError on database error", async () => {
  const { repo: repoHealth } = harness(null, dbError());
  await assertRejects(() => repoHealth.getHealth(), AppError);

  const { repo: repoJobs } = harness(null, dbError());
  await assertRejects(() => repoJobs.getProblematicJobs(), AppError);

  const { repo: repoUser } = harness(null, dbError());
  await assertRejects(() => repoUser.getUserStatus(1), AppError);

  const { repo: repoRequeue } = harness(null, dbError());
  await assertRejects(
    () => repoRequeue.requeueJob("00000000-0000-0000-0000-000000000001"),
    AppError,
  );

  const { repo: repoCancel } = harness(null, dbError());
  await assertRejects(
    () => repoCancel.cancelJob("00000000-0000-0000-0000-000000000001"),
    AppError,
  );
});
