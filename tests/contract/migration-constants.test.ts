import { assert, assertEquals } from "@std/assert";
import {
  GENERATION_REASONS,
  INPUT_TYPES,
  JOB_CREATION_STATES,
  JOB_STATE_TRANSITIONS,
  JOB_STATES,
  PRIVACY_MODES,
  SYSTEM_TEMPLATE_KEYS,
  TERMINAL_JOB_STATES,
  USAGE_OPERATIONS,
  USER_STATUSES,
} from "../../supabase/functions/_shared/config/constants.ts";

/**
 * Drift guard: the TypeScript mirrors against the migration SQL.
 *
 * `_shared/config/constants.ts` states the arrangement — the database is the
 * source of truth and the mirror exists so the application can reason about
 * these values without a round trip. That arrangement is only safe if something
 * checks the mirror, and this is that check.
 *
 * The tests read the migration files as text and parse the values out of them,
 * rather than connecting to a database. That is deliberate: it makes the check
 * runnable with `--allow-read` and nothing else, so it runs on every commit
 * rather than only where a database happens to be reachable. A live-database
 * comparison is a different and complementary test — it verifies what was
 * actually applied; this one verifies what is actually committed. Both are
 * needed, and the second is the one that catches a hand-edited migration.
 *
 * Migrations are located by filename suffix rather than by full filename, so
 * adding a timestamp prefix does not break the suite. A missing file is an
 * error, not a skip: a silently-skipped drift guard is worse than no guard.
 */

const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);
const REPOSITORY_DIR = new URL(
  "../../supabase/functions/_shared/repositories/",
  import.meta.url,
);
const INGESTION_REPOSITORY = new URL("ingestion.repository.ts", REPOSITORY_DIR);
const NOTES_REPOSITORY = new URL("notes.repository.ts", REPOSITORY_DIR);
const REJECTED_CHATS_REPOSITORY = new URL("rejected-chats.repository.ts", REPOSITORY_DIR);
const TEMPLATES_REPOSITORY = new URL("templates.repository.ts", REPOSITORY_DIR);
const PROCESSING_JOBS_REPOSITORY = new URL("processing-jobs.repository.ts", REPOSITORY_DIR);
const USER_PREFERENCES_REPOSITORY = new URL("user-preferences.repository.ts", REPOSITORY_DIR);

/** Read every migration, concatenated, with its filename attached for messages. */
async function loadMigrations(): Promise<{ name: string; sql: string }[]> {
  const files: { name: string; sql: string }[] = [];

  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    files.push({
      name: entry.name,
      sql: await Deno.readTextFile(new URL(entry.name, MIGRATIONS_DIR)),
    });
  }

  assert(files.length > 0, "no migrations found");
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

const FILE_SUFFIXES = [
  "phase0_enums_and_helpers.sql",
  "phase0_users.sql",
  "phase0_templates.sql",
  "phase0_user_preferences.sql",
  "phase0_telegram_updates.sql",
  "phase0_processing_jobs.sql",
  "phase0_notes.sql",
  "phase0_usage_events.sql",
  "phase0_ingestion_functions.sql",
  "phase1_rejected_chats.sql",
  "phase1_template_schemas.sql",
  "phase1_note_functions.sql",
  "phase1_pipeline_functions.sql",
  "phase2_durable_queue_worker.sql",
  "phase2_recovery_extensions.sql",
  "phase2_pg_net_least_privilege.sql",
  "fix_retry_wait_visibility.sql",
  "phase4_full_text_library.sql",
  "phase4_semantic_library.sql",
  "phase4_embedding_fk_index.sql",
  "phase5_user_preference_contract.sql",
  "phase5_scrub_staged_job_payload.sql",
] as const;

/** Read the one migration whose filename ends with `suffix`. */
async function loadMigration(suffix: string): Promise<string> {
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && entry.name.endsWith(suffix)) {
      return await Deno.readTextFile(new URL(entry.name, MIGRATIONS_DIR));
    }
  }

  throw new Error(`no migration matching ${suffix}`);
}

const ENUMS_SQL = await loadMigration("phase0_enums_and_helpers.sql");
const TEMPLATES_SQL = await loadMigration("phase0_templates.sql");
const JOBS_SQL = await loadMigration("phase0_processing_jobs.sql");
const INGESTION_SQL = await loadMigration("phase0_ingestion_functions.sql");
const REJECTED_CHATS_SQL = await loadMigration("phase1_rejected_chats.sql");
const NOTE_FUNCTIONS_SQL = await loadMigration("phase1_note_functions.sql");
const PIPELINE_FUNCTIONS_SQL = await loadMigration("phase1_pipeline_functions.sql");
const PHASE2_WORKER_SQL = await loadMigration("phase2_durable_queue_worker.sql");
const PHASE4_LIBRARY_SQL = await loadMigration("phase4_full_text_library.sql");
const PHASE4_SEMANTIC_SQL = await loadMigration("phase4_semantic_library.sql");
const PHASE5_PREFERENCES_SQL = await loadMigration("phase5_user_preference_contract.sql");
const ALL_MIGRATIONS = await loadMigrations();
const ALL_SQL = ALL_MIGRATIONS.map((migration) => migration.sql).join("\n");

/**
 * Collapse runs of whitespace to a single space.
 *
 * The SQL is hand-formatted for readability — the transition table aligns its
 * `when` arms into a column — so an assertion written against the file's layout
 * would fail on a reformat that changed nothing. Normalising means the tests
 * assert the semantics and not the indentation.
 */
function normalise(sql: string): string {
  return sql.replace(/\s+/g, " ");
}

Deno.test("an early retry read is made visible again at its due time", () => {
  const sql = normalise(ALL_SQL);

  assert(
    sql.includes("perform pgmq.set_vt('notinn_jobs', v_queue_message_id, v_retry_delay_seconds)"),
    "claim_processing_job leaves an early retry hidden for the full processing timeout",
  );
});

// --- Extracting values from SQL --------------------------------------------

/**
 * Read the members of one enum type declaration.
 *
 * Matches `create type public.<name> as enum (...)` and pulls the quoted
 * members out of the parenthesised list.
 */
function enumMembers(sql: string, typeName: string): string[] {
  const declaration = normalise(sql).match(
    new RegExp(`create type public\\.${typeName} as enum \\(([^)]*)\\)`),
  );
  assert(declaration !== null, `no declaration for enum ${typeName}`);

  const members = [...(declaration[1] ?? "").matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert(members.length > 0, `enum ${typeName} declared no members`);

  return members as string[];
}

/**
 * Read the transition table out of the trigger function.
 *
 * The function is a `case old.state::text when 'X' then new.state::text in (…)`
 * chain ending in `else false`. A state absent from the chain therefore has no
 * permitted transitions, which is how the terminal states are expressed — so
 * the parser returns only the arms it finds and lets the comparison notice that
 * the terminal states are missing, rather than inventing entries for them.
 */
function declaredTransitions(sql: string): Map<string, string[]> {
  const body = normalise(sql);
  const transitions = new Map<string, string[]>();
  const armPattern = /when '(\w+)' then new\.state::text in \(([^)]*)\)/g;

  for (const arm of body.matchAll(armPattern)) {
    const from = arm[1] as string;
    const targets = [...(arm[2] ?? "").matchAll(/'([^']+)'/g)].map((match) => match[1]) as string[];

    assert(!transitions.has(from), `transition table declares ${from} twice`);
    transitions.set(from, targets);
  }

  assert(transitions.size > 0, "no transition table found");
  return transitions;
}

/** Read a `sql_array` literal such as `array['A', 'B']`. */
function arrayLiteral(sql: string, pattern: RegExp): string[] {
  const match = normalise(sql).match(pattern);
  assert(match !== null, `no array literal matched ${pattern}`);

  return [...(match[1] ?? "").matchAll(/'([^']+)'/g)].map((entry) => entry[1]) as string[];
}

/**
 * The index of the first `;` that is not inside a single-quoted string.
 *
 * Splitting a statement on `;` is wrong, and the way it is wrong here is worth
 * recording: the Short Summary description reads "A concise TL;DR and a few key
 * points", so the semicolon in `TL;DR` truncates a naive parse halfway through
 * the catalogue. Any SQL text being parsed by position needs this, and any test
 * that slices SQL by delimiter instead is asserting against a fragment.
 *
 * Doubled quotes (`''`) are an escaped quote inside a literal, not a terminator.
 *
 * This does not understand dollar-quoted strings (`$$ … $$`), which function
 * bodies use. It is only safe on statements that do not contain them — the
 * template seed does not. Do not reuse it on a function body.
 */
function endOfStatement(sql: string, from: number): number {
  let inString = false;

  for (let index = from; index < sql.length; index += 1) {
    const character = sql[index];

    if (character === "'") {
      if (inString && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (character === ";" && !inString) return index;
  }

  throw new Error("the statement is not terminated");
}

// --- Enums -----------------------------------------------------------------

/**
 * Every mirrored enum, paired with the database type it mirrors.
 *
 * `template_status` is deliberately absent: Phase 0 never reasons about a
 * template's status, so there is no mirror to drift.
 */
const MIRRORED_ENUMS = [
  ["job_state", JOB_STATES],
  ["input_type", INPUT_TYPES],
  ["user_status", USER_STATUSES],
  ["privacy_mode", PRIVACY_MODES],
  ["generation_reason", GENERATION_REASONS],
  ["usage_operation", USAGE_OPERATIONS],
] as const;

for (const [typeName, mirrored] of MIRRORED_ENUMS) {
  Deno.test(`the ${typeName} mirror matches the database enum`, () => {
    assertEquals([...enumMembers(ENUMS_SQL, typeName)].sort(), [...mirrored].sort());
  });
}

Deno.test("the mirrored enums are the ones the database defines", () => {
  // Catches the other direction: a new enum added to the database and never
  // mirrored, which is the drift a per-enum test cannot see.
  const declared = [...normalise(ENUMS_SQL).matchAll(/create type public\.(\w+) as enum/g)].map(
    (match) => match[1] as string,
  );

  const mirrored = MIRRORED_ENUMS.map(([typeName]) => typeName) as string[];

  assertEquals(
    declared.filter((name) => name !== "template_status").sort(),
    [...mirrored].sort(),
    "the set of enums differs from the set of mirrors",
  );
});

// --- Templates -------------------------------------------------------------

Deno.test("the template catalogue mirror matches the seeded keys", () => {
  const sql = normalise(TEMPLATES_SQL);
  const start = sql.indexOf("insert into public.templates");
  assert(start !== -1, "no template insert found");

  const statement = sql.slice(start, endOfStatement(sql, start));
  const values = statement.match(/values (.*)$/);
  assert(values !== null, "the template insert has no values clause");

  // The key is the first literal of each `( … )` tuple. Reading it positionally
  // rather than by shape — the key is the only all-lowercase literal — is what
  // stops a description that happens to look like an identifier from being read
  // as a key.
  const seeded = [...(values[1] ?? "").matchAll(/\(\s*'([^']+)'\s*,/g)].map(
    (match) => match[1] as string,
  );

  assertEquals([...SYSTEM_TEMPLATE_KEYS], seeded);
});

Deno.test("every seeded template has a name, a description and an instruction", () => {
  // A tuple with a key and nothing else would parse as a valid catalogue entry
  // above while being an unusable template.
  const sql = normalise(TEMPLATES_SQL);
  const start = sql.indexOf("insert into public.templates");
  const statement = sql.slice(start, endOfStatement(sql, start));

  assertEquals((statement.match(/\(\s*'/g) ?? []).length, SYSTEM_TEMPLATE_KEYS.length);

  for (const key of SYSTEM_TEMPLATE_KEYS) {
    const tuple = statement.slice(statement.indexOf(`'${key}'`));
    const literals = [...tuple.slice(0, tuple.indexOf(")")).matchAll(/'([^']*)'/g)].length;

    assertEquals(literals, 4, `${key} does not have four fields`);
  }
});

Deno.test("the seed is a catalogue and not a duplicate list", () => {
  const seeded = SYSTEM_TEMPLATE_KEYS.length;
  assertEquals(new Set<string>(SYSTEM_TEMPLATE_KEYS).size, seeded);
});

// --- The job state machine -------------------------------------------------

Deno.test("the transition mirror matches the trigger function", () => {
  const declared = declaredTransitions(JOBS_SQL);

  for (const state of JOB_STATES) {
    const fromDatabase = declared.get(state) ?? [];
    const fromMirror = JOB_STATE_TRANSITIONS[state];

    assertEquals(
      [...fromMirror].sort(),
      [...fromDatabase].sort(),
      `${state}: the mirror and the trigger disagree`,
    );
  }
});

Deno.test("the trigger declares no state the mirror does not know", () => {
  const known = new Set<string>(JOB_STATES);

  for (const from of declaredTransitions(JOBS_SQL).keys()) {
    assert(known.has(from), `the trigger declares a transition from unknown state ${from}`);
  }
});

Deno.test("the terminal-state mirror matches the trigger's v_terminal array", () => {
  const declared = arrayLiteral(
    JOBS_SQL,
    /v_terminal constant text\[\] := array\[([^\]]*)\]/,
  );

  assertEquals([...TERMINAL_JOB_STATES].sort(), [...declared].sort());
});

Deno.test("the creation-state mirror matches the trigger's insert guard", () => {
  const declared = arrayLiteral(
    JOBS_SQL,
    /new\.state::text <> all \(array\[([^\]]*)\]\)/,
  );

  assertEquals([...JOB_CREATION_STATES].sort(), [...declared].sort());
});

Deno.test("a state the trigger omits is a state the mirror treats as terminal", () => {
  // The two representations express terminality differently — the mirror lists
  // empty arrays, the trigger simply leaves the state out of the case chain —
  // so this checks that the two encodings agree rather than assuming it.
  const declared = declaredTransitions(JOBS_SQL);
  const omitted = JOB_STATES.filter((state) => !declared.has(state));
  const terminal = new Set<string>(TERMINAL_JOB_STATES);

  for (const state of omitted) {
    assert(terminal.has(state), `${state} has no transitions in the trigger but is not terminal`);
  }

  for (const state of TERMINAL_JOB_STATES) {
    assert(omitted.includes(state), `terminal state ${state} has transitions in the trigger`);
  }
});

// --- Row level security ----------------------------------------------------

Deno.test("every table has row level security enabled and is revoked from the client roles", () => {
  // RLS with no policies is deny-by-default, and the revoke makes the denial
  // explicit at the grant layer as well. Both are asserted for every table,
  // because a table added without them is reachable by anyone holding an anon
  // key while looking, to every other test, exactly like a table that is not.
  const tables = [...normalise(ALL_SQL).matchAll(/create table public\.(\w+)/g)].map((match) =>
    match[1] as string
  );

  assertEquals(tables.length > 0, true, "no tables found");

  for (const table of tables) {
    assert(
      normalise(ALL_SQL).includes(`alter table public.${table} enable row level security`),
      `${table} does not have row level security enabled`,
    );
    assert(
      normalise(ALL_SQL).includes(`revoke all on table public.${table} from anon, authenticated`),
      `${table} is not revoked from anon and authenticated`,
    );
  }
});

Deno.test("no migration grants a table privilege to a client role", () => {
  // A grant would undo the revoke, and the revoke is what makes the denial
  // explicit rather than merely implied by the absence of policies.
  const grants = [
    ...normalise(ALL_SQL).matchAll(/grant [^;]*on table [^;]*to [^;]*/g),
  ].map((match) => match[0]);

  for (const grant of grants) {
    assert(
      !/\b(anon|authenticated)\b/.test(grant),
      `a migration grants a table privilege to a client role: ${grant}`,
    );
  }
});

// --- SECURITY DEFINER functions --------------------------------------------

/** Every function the migrations create, with the migration that creates it. */
function createdFunctions(): { name: string; migration: { name: string; sql: string } }[] {
  const functions: { name: string; migration: { name: string; sql: string } }[] = [];

  for (const migration of ALL_MIGRATIONS) {
    for (
      const match of normalise(migration.sql).matchAll(
        /create or replace function public\.(\w+)\(/g,
      )
    ) {
      functions.push({ name: match[1] as string, migration });
    }
  }

  assert(functions.length > 0, "no functions found");
  return functions;
}

Deno.test("every function pins its search_path", () => {
  // `set search_path = ''` is what makes a function's name resolution its own
  // rather than its caller's. Without it, a caller who can create objects can
  // shadow a table or function the body refers to unqualified — the classic
  // privilege-escalation route through a function that runs with wider rights
  // than its caller. `set_updated_at` is SECURITY INVOKER and would not escalate,
  // but the pin costs nothing and the invariant is simpler held universally than
  // argued case by case.
  for (const { name, migration } of createdFunctions()) {
    const body = normalise(migration.sql);

    assert(
      new RegExp(`function public\\.${name}\\([^)]*\\)[^;]*?set search_path = ''`).test(body),
      `${name} does not pin its search_path`,
    );
  }
});

Deno.test("every function is either SECURITY DEFINER or a trigger function", () => {
  // This is the property that matters, and it is narrower than "every function is
  // SECURITY DEFINER" — which is false of `set_updated_at`, a SECURITY INVOKER
  // trigger that has no reason to be anything else.
  //
  // What must not exist is a function that is callable by a client role and runs
  // with that role's privileges, because that is an API surface nobody designed.
  // A function returning `trigger` cannot be called at all outside the trigger
  // machinery, and PostgREST will not expose one. Everything else must be
  // SECURITY DEFINER, which means it is a deliberate server-side entry point
  // whose privileges are the owner's and whose reach is bounded by the grants
  // asserted below.
  for (const { name, migration } of createdFunctions()) {
    const body = normalise(migration.sql);
    // `returns trigger` specifically. An earlier version of this matched
    // `returns (\w+)`, which is true of every function — so the test asserted
    // nothing and a function that was neither SECURITY DEFINER nor a trigger
    // would have passed. Found by reading in Phase 1; the migrations were
    // already correct, the guard was not. Removing the `security definer` line
    // from a Phase 1 migration now fails this test, which is the only proof that
    // matters.
    //
    // It remains a textual guard, so its blind spot is a *commented-out* phrase
    // matching the pattern. That is the correct trade for a drift guard: it
    // catches the forgotten line, which is the accident, rather than defending
    // against an author who is trying to defeat it.
    const returnsTrigger = new RegExp(
      `function public\\.${name}\\([^)]*\\)[^;]*?returns trigger\\b`,
    ).test(body);
    const isDefiner = new RegExp(
      `function public\\.${name}\\([^)]*\\)[^;]*?security definer`,
    ).test(body);

    if (returnsTrigger) continue;

    assert(
      isDefiner,
      `${name} is neither SECURITY DEFINER nor a trigger function, so it is callable by a client role`,
    );
  }
});

Deno.test("no function is executable by a client role", () => {
  // A SECURITY DEFINER function runs with the owner's privileges, so an execute
  // grant to anon or authenticated would hand a caller the definer's rights —
  // including a bypass of the row level security asserted above. The revoke is
  // asserted for every function, including the trigger one, so that the
  // deny-by-default posture does not depend on a return type.
  for (const { name, migration } of createdFunctions()) {
    const body = normalise(migration.sql);

    assert(
      new RegExp(
        `revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`,
      ).test(body),
      `${name} is not revoked from public, anon and authenticated`,
    );
    assert(
      !new RegExp(
        `grant execute on function public\\.${name}\\([^)]*\\) to [^;]*\\b(anon|authenticated)\\b`,
      ).test(body),
      `${name} is granted to a client role`,
    );
  }
});

Deno.test("every SECURITY DEFINER function is granted to service_role", () => {
  // A definer function with no grant to service_role is unreachable, which for
  // the two ingestion functions means the webhook cannot accept an update at all.
  // A trigger function is reached by the trigger machinery instead, so it needs
  // no grant and this does not require one.
  for (const { name, migration } of createdFunctions()) {
    const body = normalise(migration.sql);
    const isDefiner = new RegExp(
      `function public\\.${name}\\([^)]*\\)[^;]*?security definer`,
    ).test(body);

    if (!isDefiner) continue;

    assert(
      new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`).test(
        body,
      ),
      `${name} is SECURITY DEFINER but is not granted to service_role`,
    );
  }
});

Deno.test("the revoke precedes the grant for every function", () => {
  // Order matters. Reversed, the revoke would strip the service_role grant too
  // and the webhook would fail with a permission error on its first request —
  // a failure that would look like a broken key rather than a reversed pair of
  // statements.
  for (const { name, migration } of createdFunctions()) {
    const body = normalise(migration.sql);
    const revoke = body.indexOf(`revoke all on function public.${name}(`);
    const grant = body.indexOf(`grant execute on function public.${name}(`);

    assert(revoke !== -1, `${name} is never revoked`);
    if (grant === -1) continue;

    assert(revoke < grant, `${name}: the grant precedes the revoke`);
  }
});

// --- Deletion semantics ----------------------------------------------------
//
// `delete_note` is one statement — `delete from public.notes` — and relies on the
// schema for everything else blueprint 11.5 requires it to remove. That reliance
// is only safe while the foreign keys are what they are, so the two that carry
// the requirement are asserted here. Without this, changing a cascade to RESTRICT
// would turn deletion into a runtime 500 with nothing in the test suite
// objecting.

Deno.test("deleting a note cascades to its generated outputs", () => {
  // Blueprint 11.5: "Deleting a note must remove: … Generated outputs and
  // versions." This is the constraint that does it.
  assert(
    normalise(ALL_SQL).includes(
      "note_id uuid not null references public.notes (id) on delete cascade",
    ),
    "note_outputs.note_id no longer cascades, so deleting a note leaves its outputs behind",
  );
});

Deno.test("deleting a note leaves its processing job standing with note_id cleared", () => {
  // The other half of blueprint 11.5's design: the job survives, minus the note
  // it produced, which is what makes the job row the non-content deletion record
  // of blueprint 8.4. A cascade here instead would delete the job and with it the
  // record that the work ever happened.
  assert(
    normalise(ALL_SQL).includes(
      "foreign key (note_id) references public.notes (id) on delete set null",
    ),
    "processing_jobs.note_id no longer clears itself, so a note cannot be deleted",
  );
});

// --- The repository against the function signatures ------------------------

/** The argument names the repository passes to an RPC, read from its source. */
async function rpcArgumentNames(repository: URL, rpcName: string): Promise<string[]> {
  const source = await Deno.readTextFile(repository);
  const call = source.match(new RegExp(`rpc\\("${rpcName}", \\{([\\s\\S]*?)\\}\\)`));

  assert(call !== null, `${repository.pathname} does not call ${rpcName}`);

  return [...(call[1] ?? "").matchAll(/^\s*(p_\w+):/gm)].map((match) => match[1] as string);
}

/** The declared parameters of a function, and whether each has a default. */
function declaredParameters(
  sql: string,
  functionName: string,
): { name: string; required: boolean }[] {
  const signature = normalise(sql).match(
    new RegExp(`create or replace function public\\.${functionName}\\(([^)]*)\\)`),
  );
  assert(signature !== null, `no signature for ${functionName}`);

  return (signature[1] ?? "")
    .split(",")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.length > 0)
    .map((declaration) => {
      const name = declaration.match(/^(p_\w+)/)?.[1];
      assert(name !== undefined, `${functionName}: cannot read a name from "${declaration}"`);

      return { name, required: !declaration.includes(" default ") };
    });
}

/**
 * Every RPC the application calls, with the migration that declares it and the
 * repository file that calls it.
 *
 * The repository is named per entry rather than assumed, because there is more
 * than one now. `rpcArgumentNames` reads the call by regex, so the call must be
 * written as a literal object with one `p_name: value,` per line — a spread or a
 * computed key would be invisible to this test, and the test would then assert
 * that a repository supplying nothing supplies everything.
 */
const RPC_CONTRACTS = [
  [INGESTION_REPOSITORY, "ensure_telegram_user", INGESTION_SQL],
  [INGESTION_REPOSITORY, "accept_and_enqueue_telegram_update_v2", PHASE5_PREFERENCES_SQL],
  [INGESTION_REPOSITORY, "telegram_update_digest_matches", PIPELINE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "persist_note", NOTE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "regenerate_note_output", NOTE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "set_current_output", NOTE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "set_note_saved", NOTE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "delete_note", NOTE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "list_recent_saved_notes", NOTE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "search_saved_notes", PHASE4_LIBRARY_SQL],
  [NOTES_REPOSITORY, "list_saved_notes_for_embedding", PHASE4_SEMANTIC_SQL],
  [NOTES_REPOSITORY, "upsert_note_embedding", PHASE4_SEMANTIC_SQL],
  [NOTES_REPOSITORY, "match_saved_note_embeddings", PHASE4_SEMANTIC_SQL],
  [NOTES_REPOSITORY, "find_note_for_regeneration", NOTE_FUNCTIONS_SQL],
  [NOTES_REPOSITORY, "find_note_for_display", PIPELINE_FUNCTIONS_SQL],
  [REJECTED_CHATS_REPOSITORY, "claim_rejected_chat_reply", REJECTED_CHATS_SQL],
  [TEMPLATES_REPOSITORY, "find_template_for_generation", PIPELINE_FUNCTIONS_SQL],
  [PROCESSING_JOBS_REPOSITORY, "read_processing_queue", PHASE2_WORKER_SQL],
  [PROCESSING_JOBS_REPOSITORY, "find_processing_queue_message_id", PHASE2_WORKER_SQL],
  [PROCESSING_JOBS_REPOSITORY, "claim_processing_job", PHASE5_PREFERENCES_SQL],
  [USER_PREFERENCES_REPOSITORY, "get_user_preferences", PHASE5_PREFERENCES_SQL],
  [USER_PREFERENCES_REPOSITORY, "update_user_preference", PHASE5_PREFERENCES_SQL],
] as const;

for (const [repository, name, sql] of RPC_CONTRACTS) {
  Deno.test(`the repository's ${name} arguments all exist as parameters`, async () => {
    // A renamed parameter or a typo is rejected by PostgREST at runtime, on the
    // first real message, as an opaque error. This catches it at commit time.
    const declared = new Set(declaredParameters(sql, name).map((parameter) => parameter.name));

    for (const argument of await rpcArgumentNames(repository, name)) {
      assert(declared.has(argument), `${name} has no parameter ${argument}`);
    }
  });

  Deno.test(`the repository supplies every required ${name} parameter`, async () => {
    // Omitting one is the failure this exists for: a parameter with no default
    // that the caller never sends is a parameter PostgREST cannot fill, and the
    // call fails at runtime having compiled cleanly.
    const supplied = new Set(await rpcArgumentNames(repository, name));

    for (const parameter of declaredParameters(sql, name)) {
      if (!parameter.required) continue;
      assert(supplied.has(parameter.name), `${name}: ${parameter.name} is required but not sent`);
    }
  });
}

/**
 * The outcome vocabulary of each RPC that reports one.
 *
 * The vocabulary is a contract across the boundary in both directions. An outcome
 * the SQL can return that the repository does not know about surfaces as a schema
 * validation failure on a real user's message — which for `persist_note` would
 * mean a note generated and paid for but never delivered. An outcome the
 * repository handles that the SQL never returns is a branch that cannot run, which
 * is invisible until somebody reads the function and wonders.
 *
 * The strongest form of this check is the per-type assertion below, which pins
 * the members exactly; this one catches an outcome returned by a path the type
 * does not mention, which the type check alone cannot see because it compares the
 * type to a hand-written expectation rather than to the SQL.
 */
const OUTCOME_VOCABULARIES = [
  {
    repository: INGESTION_REPOSITORY,
    fn: "accept_and_enqueue_telegram_update_v2",
    sql: PHASE5_PREFERENCES_SQL,
    outcomes: ["accepted", "duplicate", "user_not_active"],
  },
  {
    repository: NOTES_REPOSITORY,
    fn: "persist_note",
    sql: NOTE_FUNCTIONS_SQL,
    outcomes: ["created", "existing", "not_found", "wrong_state"],
  },
  {
    repository: NOTES_REPOSITORY,
    fn: "regenerate_note_output",
    sql: NOTE_FUNCTIONS_SQL,
    outcomes: ["created", "not_found"],
  },
  {
    repository: NOTES_REPOSITORY,
    fn: "set_current_output",
    sql: NOTE_FUNCTIONS_SQL,
    outcomes: ["updated", "not_found"],
  },
  {
    repository: NOTES_REPOSITORY,
    fn: "set_note_saved",
    sql: NOTE_FUNCTIONS_SQL,
    outcomes: ["updated", "not_found"],
  },
  {
    repository: NOTES_REPOSITORY,
    fn: "delete_note",
    sql: NOTE_FUNCTIONS_SQL,
    outcomes: ["deleted", "not_found"],
  },
] as const;

for (const { repository, fn, sql, outcomes } of OUTCOME_VOCABULARIES) {
  Deno.test(`${fn}'s outcomes are returned by the SQL and handled by the repository`, async () => {
    const source = await Deno.readTextFile(repository);

    for (const outcome of outcomes) {
      assert(sql.includes(`'${outcome}'`), `${fn} never returns '${outcome}'`);
      assert(
        source.includes(`"${outcome}"`),
        `the repository does not handle '${outcome}' from ${fn}`,
      );
    }
  });
}

/**
 * The exported outcome types, against the members the SQL returns.
 *
 * Written out one per type rather than derived, because the point of the test is
 * that a human wrote the expectation down and a change has to disagree with it.
 * A generic version that computed the members from the SQL would agree with any
 * SQL, including one that lost an outcome.
 *
 * The declaration is matched as literal text. Every one of these fits on one line
 * within the formatter's width, so the formatting is stable — and a type alias
 * that had to wrap would be a sign the vocabulary had grown too wide to read.
 */
const OUTCOME_TYPES = [
  {
    repository: INGESTION_REPOSITORY,
    name: "IngestionOutcome",
    declaration: 'export type IngestionOutcome = "accepted" | "duplicate" | "user_not_active";',
  },
  {
    repository: NOTES_REPOSITORY,
    name: "PersistNoteOutcome",
    declaration:
      'export type PersistNoteOutcome = "created" | "existing" | "not_found" | "wrong_state";',
  },
  {
    repository: NOTES_REPOSITORY,
    name: "NoteWriteOutcome",
    declaration: 'export type NoteWriteOutcome = "created" | "not_found";',
  },
  {
    repository: NOTES_REPOSITORY,
    name: "SetCurrentOutputOutcome",
    declaration: 'export type SetCurrentOutputOutcome = "updated" | "not_found";',
  },
  {
    repository: NOTES_REPOSITORY,
    name: "SetNoteSavedOutcome",
    declaration: 'export type SetNoteSavedOutcome = "updated" | "not_found";',
  },
  {
    repository: NOTES_REPOSITORY,
    name: "DeleteNoteOutcome",
    declaration: 'export type DeleteNoteOutcome = "deleted" | "not_found";',
  },
] as const;

for (const { repository, name, declaration } of OUTCOME_TYPES) {
  Deno.test(`the ${name} type matches its outcome set`, async () => {
    const source = await Deno.readTextFile(repository);

    assert(
      source.includes(declaration),
      `${name} has drifted from its outcome set in ${repository.pathname}\n  expected: ${declaration}`,
    );
  });
}

// --- The migration set itself ----------------------------------------------

Deno.test("every migration in the directory is one the suite knows about", () => {
  // An unlisted migration is one no contract test reads. Adding a file should
  // require adding it here, which is the moment to ask what it needs to satisfy.
  assertEquals(
    ALL_MIGRATIONS.map((migration) => migration.name).map((name) => name.replace(/^\d+_/, "")),
    [...FILE_SUFFIXES],
  );
});

Deno.test("every enum and table is created by exactly one migration", () => {
  // Stateful objects must have one creation point. Functions are deliberately
  // excluded: CREATE OR REPLACE is PostgreSQL's supported way to ship a body
  // correction without dropping grants or breaking dependent callers.
  const definitions: [string, RegExp][] = [
    ["enum", /create type public\.(\w+) as enum/g],
    ["table", /create table public\.(\w+)/g],
  ];

  for (const [kind, pattern] of definitions) {
    const seen = new Map<string, string>();

    for (const migration of ALL_MIGRATIONS) {
      for (const match of normalise(migration.sql).matchAll(pattern)) {
        const name = match[1] as string;
        const previous = seen.get(name);

        assert(
          previous === undefined,
          `${kind} ${name} is created by both ${previous} and ${migration.name}`,
        );
        seen.set(name, migration.name);
      }
    }

    assert(seen.size > 0, `no ${kind} definitions found`);
  }
});

Deno.test("no migration disables row level security", () => {
  // The single most consequential line that could be added to this project.
  assert(!/disable row level security/i.test(ALL_SQL));
});

Deno.test("no migration drops or truncates a table", () => {
  // Phase 0 migrations are additive. A drop in a committed migration is either a
  // development convenience that escaped or a destructive operation nobody
  // reviewed.
  assert(!/\bdrop table\b/i.test(ALL_SQL), "a migration drops a table");
  assert(!/\btruncate\b/i.test(ALL_SQL), "a migration truncates a table");
});

Deno.test("the migrations are ordered by their timestamp prefix", () => {
  // Supabase applies migrations in filename order, so a prefix that does not
  // sort correctly silently applies a table before the type it depends on.
  const prefixes = ALL_MIGRATIONS.map((migration) => migration.name.match(/^(\d+)_/)?.[1]);

  for (const prefix of prefixes) {
    assert(prefix !== undefined, "a migration has no timestamp prefix");
  }

  const sorted = [...(prefixes as string[])].sort();
  assertEquals(prefixes, sorted, "migration filenames do not sort in apply order");
});
