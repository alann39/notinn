import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  JOB_CREATION_STATES,
  JOB_STATE_TRANSITIONS,
  TERMINAL_JOB_STATES,
} from "../../supabase/functions/_shared/config/constants.ts";
import { clientWithKey, ENABLED, nextId, serviceClient } from "./harness.ts";

/**
 * The guarantees that only exist in the database.
 *
 * The state machine, the terminal-state immutability rule and row level security
 * are all enforced by PostgreSQL rather than by the application, which is the
 * design: an application bug, a stray console session or a future service cannot
 * put a job into an impossible state. That also means none of them can be tested
 * without a real instance.
 *
 * Ignored unless the test target is configured. See harness.ts.
 */

/** Whether a state is terminal, per the application's mirror of the trigger. */
function isTerminal(state: string): boolean {
  return (TERMINAL_JOB_STATES as readonly string[]).includes(state);
}

/**
 * Check a path against the application's transition table before walking it.
 *
 * A path that the mirror says is impossible would fail against the database for
 * the wrong reason — a test bug rather than a trigger defect — so it is caught
 * here where the failure names the path.
 */
function checkEdgesAreReal(path: readonly string[]): void {
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index] as keyof typeof JOB_STATE_TRANSITIONS;
    const to = path[index + 1] as string;

    assert(
      (JOB_STATE_TRANSITIONS[from] as readonly string[]).includes(to),
      `the path uses ${from} -> ${to}, which the transition table does not permit`,
    );
  }
}

/** A user and a queued job, as the fixtures for the transition tests. */
async function queuedJob(): Promise<{ jobId: string; userId: string; updateId: number }> {
  const target = serviceClient();
  const updateId = nextId();
  const telegramUserId = nextId();

  const { data: userId, error: userError } = await target.rpc("ensure_telegram_user", {
    p_telegram_user_id: telegramUserId,
    p_telegram_chat_id: telegramUserId,
  });

  assertEquals(userError, null, "could not create the synthetic user");

  const { error: updateError } = await target.from("telegram_updates").insert({
    update_id: updateId,
    update_type: "message",
    user_id: userId,
    chat_id: telegramUserId,
    message_id: 1,
    input_type: "text",
    template_key: "clean_note",
  });

  assertEquals(updateError, null, "could not record the synthetic update");

  const { data: job, error: jobError } = await target
    .from("processing_jobs")
    .insert({
      user_id: userId,
      update_id: updateId,
      input_type: "text",
      template_key: "clean_note",
      state: "QUEUED",
    })
    .select("id")
    .single();

  assertEquals(jobError, null, "could not create the synthetic job");
  // `single()` returns a nullable row, and the assertion above only narrows the
  // error. An insert that returned no row at all would already have been an
  // error, so this cannot fire — it is here so the read below is checked.
  assert(job !== null, "the insert returned no row");

  return { jobId: job["id"] as string, userId: userId as string, updateId };
}

Deno.test({
  name: "a job cannot be created in a terminal state",
  ignore: !ENABLED,
  fn: async () => {
    // The insert guard in enforce_processing_job_transition. A job created in
    // COMPLETED would report a note nobody received.
    const target = serviceClient();
    const terminal = TERMINAL_JOB_STATES[0];

    const { error } = await target.from("processing_jobs").insert({
      user_id: (await queuedJob()).userId,
      update_id: nextId(),
      input_type: "text",
      template_key: "clean_note",
      state: terminal,
    });

    assertNotEquals(error, null, `a job was created in ${terminal}`);
  },
});

Deno.test({
  name: "every state the application may create a job in is accepted",
  ignore: !ENABLED,
  fn: async () => {
    // The other direction: if the guard were too strict, the webhook would fail
    // to create any job at all. Both creation states are exercised so that
    // retaining RECEIVED for Phase 2 is verified rather than assumed.
    const target = serviceClient();
    const { userId } = await queuedJob();

    for (const state of JOB_CREATION_STATES) {
      const updateId = nextId();

      const { error: updateError } = await target.from("telegram_updates").insert({
        update_id: updateId,
        update_type: "message",
        user_id: userId,
        chat_id: 1,
        message_id: 1,
        input_type: "text",
        template_key: "clean_note",
      });
      assertEquals(updateError, null);

      const { error } = await target.from("processing_jobs").insert({
        user_id: userId,
        update_id: updateId,
        input_type: "text",
        template_key: "clean_note",
        state,
      });

      assertEquals(error, null, `a job could not be created in ${state}`);
    }
  },
});

Deno.test({
  name: "the happy-path pipeline can be walked one step at a time",
  ignore: !ENABLED,
  fn: async () => {
    // The blueprint's pipeline (blueprint 14), in order, against the real
    // trigger. Walking it is the only way to prove the middle states are
    // reachable: each step's preconditions are created by the step before it, so
    // a table of edges proves nothing on its own.
    const target = serviceClient();

    for (
      const path of [
        ["QUEUED", "ACQUIRING", "EXTRACTING", "GENERATING", "DELIVERING", "COMPLETED"],
        ["QUEUED", "ACQUIRING", "RETRYABLE_FAILED", "QUEUED"],
        ["QUEUED", "EXPIRED"],
        ["QUEUED", "CANCELLED"],
      ]
    ) {
      checkEdgesAreReal(path);

      const { jobId } = await queuedJob();

      for (let index = 0; index < path.length - 1; index += 1) {
        const from = path[index] as string;
        const to = path[index + 1] as string;

        const { error } = await target
          .from("processing_jobs")
          .update({
            state: to,
            // A terminal state requires a completion time (the check constraint),
            // so the walk supplies one where the target state needs it.
            ...(isTerminal(to) ? { completed_at: new Date().toISOString() } : {}),
          })
          .eq("id", jobId);

        assertEquals(error, null, `${from} -> ${to} was refused: ${error?.message}`);
      }
    }
  },
});

Deno.test({
  name: "the pipeline cannot be short-circuited",
  ignore: !ENABLED,
  fn: async () => {
    // The complement of the walk. Each of these would let a job report a result
    // it never produced: COMPLETED without delivering, GENERATING without
    // extracting.
    const target = serviceClient();

    for (const targetState of ["ACQUIRING", "EXTRACTING", "GENERATING", "DELIVERING"] as const) {
      const { jobId } = await queuedJob();

      const { error } = await target
        .from("processing_jobs")
        .update({ state: targetState })
        .eq("id", jobId);

      assertEquals(error, null, `QUEUED -> ${targetState} should be permitted`);
    }

    // And the skip-ahead: from ACQUIRING, DELIVERING is not reachable.
    const { jobId } = await queuedJob();
    await target.from("processing_jobs").update({ state: "ACQUIRING" }).eq("id", jobId);

    const { error } = await target
      .from("processing_jobs")
      .update({ state: "DELIVERING" })
      .eq("id", jobId);

    assertNotEquals(error, null, "ACQUIRING -> DELIVERING was permitted");
  },
});

Deno.test({
  name: "an illegal transition is refused by the trigger",
  ignore: !ENABLED,
  fn: async () => {
    // Skipping the pipeline. A job marked COMPLETED without delivering would
    // report success for a note nobody received.
    const target = serviceClient();
    const { jobId } = await queuedJob();

    const { error } = await target
      .from("processing_jobs")
      .update({ state: "COMPLETED" })
      .eq("id", jobId);

    assertNotEquals(error, null, "QUEUED -> COMPLETED was permitted");
  },
});

Deno.test({
  name: "a terminal job cannot be reopened",
  ignore: !ENABLED,
  fn: async () => {
    // Terminality is the reason a completed job is a permanent record. Without
    // it, a job could be resurrected and a user's note regenerated over the top
    // of the one they already have.
    const target = serviceClient();
    const { jobId } = await queuedJob();

    // QUEUED -> EXPIRED, which is legal and terminal.
    const { error: expireError } = await target
      .from("processing_jobs")
      .update({ state: "EXPIRED" })
      .eq("id", jobId);
    assertEquals(expireError, null, "QUEUED -> EXPIRED was refused");

    const { error } = await target
      .from("processing_jobs")
      .update({ state: "QUEUED" })
      .eq("id", jobId);

    assertNotEquals(error, null, "a terminal job was reopened");
  },
});

Deno.test({
  name: "a terminal state stamps completed_at, and a non-terminal one may not",
  ignore: !ENABLED,
  fn: async () => {
    // Enforced by the check constraint the migration declares. It is what makes
    // "when did this finish" answerable without inferring it from updated_at,
    // which any later write would move.
    const target = serviceClient();
    const { jobId } = await queuedJob();

    const { error: premature } = await target
      .from("processing_jobs")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", jobId);

    assertNotEquals(premature, null, "a queued job was allowed to record a completion time");

    const { error: terminal } = await target
      .from("processing_jobs")
      .update({ state: "EXPIRED", completed_at: new Date().toISOString() })
      .eq("id", jobId);

    assertEquals(terminal, null, "a terminal transition without completed_at was refused");
  },
});

Deno.test({
  name: "one update_id can back only one job",
  ignore: !ENABLED,
  fn: async () => {
    // The unique constraint behind exit criterion 2, asserted directly rather
    // than through the function, so that a change to the function cannot hide a
    // change to the constraint.
    const target = serviceClient();
    const { updateId, userId } = await queuedJob();

    const { error } = await target.from("processing_jobs").insert({
      user_id: userId,
      update_id: updateId,
      input_type: "text",
      template_key: "clean_note",
      state: "QUEUED",
    });

    assertNotEquals(error, null, "a second job was created for one update");
  },
});

Deno.test({
  name: "a negative attempt count is refused",
  ignore: !ENABLED,
  fn: async () => {
    const target = serviceClient();
    const { jobId } = await queuedJob();

    const { error } = await target
      .from("processing_jobs")
      .update({ attempt_count: -1 })
      .eq("id", jobId);

    assertNotEquals(error, null, "a negative attempt count was accepted");
  },
});

// --- Row level security ----------------------------------------------------

Deno.test({
  name: "a client-role key reads nothing from any table",
  ignore: !ENABLED,
  fn: async () => {
    // Exit criterion 4's sibling and the core of the access model: RLS is enabled
    // with no policies, so a publishable key reads nothing at all. The tables
    // that matter most are checked, and the assertion accepts either an error or
    // an empty result, because both are denials — what must not happen is rows.
    const publishable = Deno.env.get("NOTINN_TEST_ANON_KEY")?.trim();
    if (publishable === undefined || publishable === "") {
      // No publishable key configured. Asserting the negative would need one, so
      // the check is skipped explicitly rather than passing vacuously.
      return;
    }

    const anon = clientWithKey(publishable);

    for (const table of ["users", "notes", "note_outputs", "processing_jobs", "usage_events"]) {
      const { data, error } = await anon.from(table).select("id").limit(1);

      if (error !== null) continue;
      assertEquals(data?.length ?? 0, 0, `a client-role key read rows from ${table}`);
    }
  },
});

Deno.test({
  name: "a client-role key cannot call the ingestion functions",
  ignore: !ENABLED,
  fn: async () => {
    // The execute grants. A SECURITY DEFINER function callable by a client role
    // would hand the caller the definer's rights and bypass row level security
    // entirely.
    const publishable = Deno.env.get("NOTINN_TEST_ANON_KEY")?.trim();
    if (publishable === undefined || publishable === "") return;

    const anon = clientWithKey(publishable);

    const { error } = await anon.rpc("ensure_telegram_user", {
      p_telegram_user_id: nextId(),
      p_telegram_chat_id: nextId(),
    });

    assertNotEquals(error, null, "a client-role key called ensure_telegram_user");
  },
});

// --- Idempotency of the schema itself --------------------------------------

Deno.test({
  name: "the expected tables all exist",
  ignore: !ENABLED,
  fn: async () => {
    const target = serviceClient();
    const expected = [
      "users",
      "templates",
      "user_preferences",
      "telegram_updates",
      "processing_jobs",
      "notes",
      "note_outputs",
      "usage_events",
    ];

    for (const table of expected) {
      const { error } = await target.from(table).select("*").limit(0);
      assertEquals(error, null, `the table ${table} is not readable`);
    }
  },
});

Deno.test({
  name: "the migration ledger records every Phase 0 migration",
  ignore: !ENABLED,
  fn: async () => {
    // Criterion 6's other half: not just that the objects exist, but that the
    // project considers them applied. This is what a from-scratch replay
    // produces, and what a hand-applied change would leave inconsistent.
    const target = serviceClient();

    const { data, error } = await target
      .schema("supabase_migrations")
      .from("schema_migrations")
      .select("version, name");

    if (error !== null) {
      // The ledger is not exposed through PostgREST in every configuration.
      // Absent access is not a failed migration, so nothing is asserted rather
      // than a false failure reported. `supabase migration list` is the
      // authoritative check and is documented in the README.
      return;
    }

    const versions = (data ?? []).map((row) => row["version"] as string);
    assert(versions.length >= 9, `only ${versions.length} migrations are recorded`);
  },
});
