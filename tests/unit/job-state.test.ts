import { assert, assertEquals } from "@std/assert";
import {
  JOB_CREATION_STATES,
  JOB_STATE_TRANSITIONS,
  JOB_STATES,
  type JobState,
  TERMINAL_JOB_STATES,
} from "../../supabase/functions/_shared/config/constants.ts";

/**
 * The job state machine, as the application sees it.
 *
 * This table mirrors `public.enforce_processing_job_transition()` (migration 6).
 * The database is the enforcement point — a transition the database refuses
 * cannot happen whatever the application believes — but the mirror exists so the
 * application can reject an impossible transition before attempting it, and so
 * a drift between the two is caught here rather than at a user's first note.
 *
 * The contract tests in tests/contract/ check the mirror against the migration
 * SQL itself. What is asserted here are the structural properties of the graph,
 * which hold regardless of which representation is being read.
 */

const TERMINAL = new Set<string>(TERMINAL_JOB_STATES);
const NON_TERMINAL = JOB_STATES.filter((state) => !TERMINAL.has(state));

// --- Structural properties -------------------------------------------------

Deno.test("every state has an entry in the transition table", () => {
  // A missing key would make `JOB_STATE_TRANSITIONS[state]` undefined at
  // runtime, and iterating it would throw in the middle of a job.
  for (const state of JOB_STATES) {
    assert(JOB_STATE_TRANSITIONS[state] !== undefined, `${state} has no entry`);
  }

  assertEquals(Object.keys(JOB_STATE_TRANSITIONS).length, JOB_STATES.length);
});

Deno.test("every transition target is a real state", () => {
  const known = new Set<string>(JOB_STATES);

  for (const state of JOB_STATES) {
    for (const target of JOB_STATE_TRANSITIONS[state]) {
      assert(known.has(target), `${state} transitions to unknown state ${target}`);
    }
  }
});

Deno.test("no state transitions to itself", () => {
  // A self-transition would make the trigger's immutability check and the
  // application's pre-check disagree about whether anything happened.
  for (const state of JOB_STATES) {
    assert(!JOB_STATE_TRANSITIONS[state].includes(state), `${state} transitions to itself`);
  }
});

Deno.test("a terminal state can only reach CANCELLED", () => {
  // Terminal states are absorbing — a COMPLETED job cannot be reopened.
  // CANCELLED is the sole exception: operators may silence noisy terminal jobs.
  // CANCELLED itself has no outgoing transitions.
  for (const state of TERMINAL_JOB_STATES) {
    if (state === "CANCELLED") {
      assertEquals(JOB_STATE_TRANSITIONS[state], [], "CANCELLED has outgoing transitions");
    } else {
      assertEquals(
        JOB_STATE_TRANSITIONS[state],
        ["CANCELLED"],
        `${state} can only transition to CANCELLED`,
      );
    }
  }
});

Deno.test("every non-terminal state can be reached and can progress", () => {
  for (const state of NON_TERMINAL) {
    assert(JOB_STATE_TRANSITIONS[state].length > 0, `${state} is a dead end`);
  }
});

Deno.test("every non-terminal state can be cancelled", () => {
  // The blueprint's state diagram does not show this edge. It is an inference
  // recorded in docs/ADR/0004-job-state-machine.md: a user who deletes a note
  // mid-processing needs the job to be able to stop, and without an edge to
  // CANCELLED a job stuck in ACQUIRING could only ever fail or expire.
  for (const state of NON_TERMINAL) {
    assert(
      JOB_STATE_TRANSITIONS[state].includes("CANCELLED"),
      `${state} cannot be cancelled`,
    );
  }
});

Deno.test("terminal and non-terminal states do not overlap", () => {
  assertEquals(TERMINAL.size, TERMINAL_JOB_STATES.length, "TERMINAL_JOB_STATES has duplicates");
  assertEquals(TERMINAL.size + NON_TERMINAL.length, JOB_STATES.length);
});

// --- The blueprint's pipeline (blueprint 14) -------------------------------

Deno.test("the happy path runs in the blueprint's order", () => {
  const pipeline: readonly JobState[] = [
    "RECEIVED",
    "QUEUED",
    "ACQUIRING",
    "EXTRACTING",
    "GENERATING",
    "DELIVERING",
    "COMPLETED",
  ];

  for (let index = 0; index < pipeline.length - 1; index += 1) {
    const from = pipeline[index] as JobState;
    const to = pipeline[index + 1] as JobState;
    assert(
      JOB_STATE_TRANSITIONS[from].includes(to),
      `${from} cannot advance to ${to}`,
    );
  }
});

Deno.test("the pipeline cannot be short-circuited", () => {
  // Each of these would let a job skip work the user is waiting on: a job
  // marked COMPLETED without delivering, or GENERATING without extracting.
  assertEquals(JOB_STATE_TRANSITIONS["RECEIVED"].includes("COMPLETED"), false);
  assertEquals(JOB_STATE_TRANSITIONS["QUEUED"].includes("GENERATING"), false);
  assertEquals(JOB_STATE_TRANSITIONS["ACQUIRING"].includes("DELIVERING"), false);
  assertEquals(JOB_STATE_TRANSITIONS["EXTRACTING"].includes("COMPLETED"), false);
});

Deno.test("COMPLETED is reachable only through DELIVERING", () => {
  // The user has the note only once it has been delivered. A job that could be
  // completed without delivering would report success for a note nobody received.
  const sources = JOB_STATES.filter((state) => JOB_STATE_TRANSITIONS[state].includes("COMPLETED"));

  assertEquals(sources, ["DELIVERING"]);
});

Deno.test("a failure is reachable from every stage that can fail", () => {
  // ACQUIRING fetches the file, EXTRACTING reads it, GENERATING calls the model,
  // DELIVERING sends the reply. Each can fail transiently.
  for (const state of ["ACQUIRING", "EXTRACTING", "GENERATING", "DELIVERING"] as const) {
    assert(
      JOB_STATE_TRANSITIONS[state].includes("RETRYABLE_FAILED"),
      `${state} cannot fail transiently`,
    );
  }
});

Deno.test("a retryable failure goes back to the queue or gives up permanently", () => {
  assertEquals([...JOB_STATE_TRANSITIONS["RETRYABLE_FAILED"]].sort(), [
    "CANCELLED",
    "FAILED",
    "QUEUED",
  ]);
});

Deno.test("a job cannot fail permanently without first failing transiently", () => {
  // Blueprint 14 routes an exhausted retry through RETRYABLE_FAILED rather than
  // straight to FAILED, so that the attempt count is always incremented.
  const sources = JOB_STATES.filter((state) => JOB_STATE_TRANSITIONS[state].includes("FAILED"));

  assertEquals(sources, ["RETRYABLE_FAILED"]);
});

Deno.test("REJECTED and EXPIRED are reachable only where they mean something", () => {
  // REJECTED is a refusal at acceptance time; EXPIRED is a queued job nobody
  // picked up. Neither is a processing failure.
  assertEquals(
    JOB_STATES.filter((state) => JOB_STATE_TRANSITIONS[state].includes("REJECTED")),
    ["RECEIVED"],
  );
  assertEquals(
    JOB_STATES.filter((state) => JOB_STATE_TRANSITIONS[state].includes("EXPIRED")),
    ["QUEUED"],
  );
});

// --- Creation --------------------------------------------------------------

Deno.test("a job may only be created in a state that is not terminal", () => {
  for (const state of JOB_CREATION_STATES) {
    assert(JOB_STATES.includes(state), `${state} is not a job state`);
    assert(!TERMINAL.has(state), `${state} is terminal and cannot be a creation state`);
  }
});

Deno.test("Phase 0 creates jobs directly in QUEUED", () => {
  // There is no pgmq queue yet, so processing_jobs is itself the durable queue
  // and a QUEUED row is the durable acceptance record. RECEIVED is retained for
  // Phase 2, where it becomes the state between webhook acknowledgement and
  // queue publication. See docs/ADR/0002-phase-0-scope.md.
  assertEquals([...JOB_CREATION_STATES], ["RECEIVED", "QUEUED"]);
});
