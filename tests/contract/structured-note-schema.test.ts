import { assert, assertEquals } from "@std/assert";
import {
  MAX_NOTE_TAGS,
  STRUCTURED_NOTE_CONTRACT,
  STRUCTURED_NOTE_FIELDS,
  STRUCTURED_NOTE_VERSION,
  StructuredNoteSchema,
} from "../../supabase/functions/_shared/schemas/structured-note.ts";
import {
  SOURCE_REFERENCE_KINDS,
  SYSTEM_TEMPLATE_KEYS,
} from "../../supabase/functions/_shared/config/constants.ts";
import { structuredNoteFixtureFor } from "../fixtures/notes/builders.ts";

/**
 * Drift guard: the provider-facing JSON Schema against the Zod contract.
 *
 * Blueprint 12.4's contract exists in two copies, and both are needed:
 *
 *   * The JSON Schema in migration `20260917120100_phase1_template_schemas.sql` is
 *     what the Gemini adapter hands the model as `responseSchema`. It constrains
 *     generation, which is cheap, and it is written in a dialect that cannot
 *     express a pattern or a numeric range — so it is deliberately the weaker of
 *     the two.
 *
 *   * The Zod schema in `_shared/schemas/structured-note.ts` is what the
 *     application believes and the only one of the two that can reject anything.
 *
 * A weaker copy is only safe while it is a *subset* of the stronger one. The two
 * failure modes are opposite and both quiet: a provider schema naming a field that
 * Zod does not require lets the model omit something the application insists on,
 * and the whole generation then fails validation for a reason no one can see; a
 * provider schema silently dropping a bound Zod enforces costs a round trip and
 * looks like a model that periodically misbehaves. This file makes both loud.
 *
 * Everything here reads the migration as text and parses it with `JSON.parse`
 * rather than querying a database, so it runs on the committed migration — which
 * is the copy that can be hand-edited — with `--allow-read` and nothing else.
 */

const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);

const TEMPLATE_SCHEMAS_MIGRATION = "phase1_template_schemas.sql";

/**
 * Read the one migration whose filename ends with `suffix`.
 *
 * A missing file throws rather than skips. A drift guard that quietly does not run
 * is worse than no drift guard, because it is believed.
 */
async function loadMigration(suffix: string): Promise<string> {
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && entry.name.endsWith(suffix)) {
      return await Deno.readTextFile(new URL(entry.name, MIGRATIONS_DIR));
    }
  }

  throw new Error(`no migration matching ${suffix}`);
}

interface StoredTemplateSchema {
  readonly contract: string;
  readonly version: number;
  readonly schema: Record<string, unknown>;
}

/**
 * Extract the `$json$…$json$` literal the migration writes and parse it.
 *
 * Reading the stored value through the same parser PostgreSQL will use is the
 * point: a JSON literal that does not parse fails here rather than at migration
 * time against a shared project.
 */
function extractStoredSchema(sql: string): StoredTemplateSchema {
  const match = /\$json\$([\s\S]*?)\$json\$::jsonb/.exec(sql);
  assert(match !== null, "the migration contains no $json$…$json$::jsonb literal");

  return JSON.parse(match[1] ?? "") as StoredTemplateSchema;
}

/** Every key that appears anywhere in a JSON Schema, at any depth. */
function allKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, found);
    return found;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      allKeys(nested, found);
    }
  }

  return found;
}

const sql = await loadMigration(TEMPLATE_SCHEMAS_MIGRATION);
const stored = extractStoredSchema(sql);
const schema = stored.schema as {
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  items?: unknown;
};

// --- Identity ---------------------------------------------------------------

Deno.test("the stored schema declares the contract and version the application does", () => {
  // `notes` records which contract produced its output, so this string is a join
  // key rather than a label. Changing it on one side only would orphan every note
  // written before the change.
  assertEquals(stored.contract, STRUCTURED_NOTE_CONTRACT);
  assertEquals(stored.version, STRUCTURED_NOTE_VERSION);
});

Deno.test("the migration updates system templates only", () => {
  // `where owner_user_id is null` is the difference between "give the system
  // templates the contract" and "overwrite every user's custom template". Phase 5
  // adds custom templates that supply their own schema (blueprint 6.2), and this
  // migration must not still be claiming them when it does.
  assert(
    /update\s+public\.templates[\s\S]*?where\s+owner_user_id\s+is\s+null\s*;/i.test(sql),
    "the update is not scoped to rows with no owner",
  );
});

// --- The field set ----------------------------------------------------------

Deno.test("the required array is exactly the contract's field set, in order", () => {
  // Order matters because the two lists are compared by eye as well as by test,
  // and blueprint 12.4 lists the fields in this order.
  assertEquals(schema.required, [...STRUCTURED_NOTE_FIELDS]);
});

Deno.test("every field is both declared and required", () => {
  // The two directions of the subset relation. A property that is not required is
  // a field the model may omit — the application would then reject an answer the
  // provider considered complete. A required key with no property is worse: no
  // model can satisfy it, so every generation fails.
  assertEquals(Object.keys(schema.properties).sort(), [...STRUCTURED_NOTE_FIELDS].sort());

  for (const field of STRUCTURED_NOTE_FIELDS) {
    assert(schema.properties[field] !== undefined, `${field} has no property definition`);
    assert(schema.required.includes(field), `${field} is not required`);
  }
});

Deno.test("the dialect stays inside the subset the provider accepts", () => {
  // The reason the provider's copy is weaker than Zod's. Gemini rejects a schema
  // carrying an unrecognised keyword, and a schema the provider refuses is a schema
  // that constrains nothing — the worst outcome, because it fails open.
  //
  // The five below are exactly the constraints `structured-note.ts` names as ones
  // the provider dialect cannot express. If one appears here, either the dialect
  // claim is wrong or a bound has been added to the wrong copy; both need a
  // decision rather than a passing test.
  const unsupported = ["pattern", "minLength", "maxLength", "minimum", "maximum"];
  const present = [...allKeys(schema)].filter((key) => unsupported.includes(key));

  assertEquals(present, []);
});

Deno.test("the tag limit is written in both copies", () => {
  // `maxItems` is the one bound the provider is told about, because a model that
  // knows the limit rarely exceeds it. It is therefore the one bound that must not
  // drift, and the only place the two contracts state the same number.
  assertEquals(schema.properties.tags?.maxItems, MAX_NOTE_TAGS);
});

Deno.test("the tag limit appears exactly once, so it is a decision and not a habit", () => {
  const uses = [...allKeys(schema)].filter((key) => key === "maxItems").length;
  assertEquals(uses, 1);
});

// --- The nested shapes ------------------------------------------------------

Deno.test("the action item's five fields match the contract's", () => {
  const actionItems = schema.properties.action_items as {
    items: { properties: Record<string, unknown>; required: string[] };
  };

  assertEquals(
    actionItems.items.required,
    ["task", "owner", "due_date_text", "due_date_iso", "confidence"],
  );
  assertEquals(
    Object.keys(actionItems.items.properties).sort(),
    [...actionItems.items.required].sort(),
  );
});

Deno.test("the three fields that may be null are the three the contract allows", () => {
  // Blueprint 12.4's first rule reaches the provider as `nullable`. A provider
  // schema that omits it invites a model to invent an owner rather than say null,
  // which is the failure the rule exists to prevent.
  const actionItems = schema.properties.action_items as {
    items: { properties: Record<string, { nullable?: boolean }> };
  };
  const nullable = Object.entries(actionItems.items.properties)
    .filter(([, definition]) => definition.nullable === true)
    .map(([name]) => name)
    .sort();

  assertEquals(nullable, ["due_date_iso", "due_date_text", "owner"]);
});

Deno.test("a section requires a heading and a body", () => {
  const sections = schema.properties.sections as {
    items: { properties: Record<string, unknown>; required: string[] };
  };

  assertEquals(sections.items.required, ["heading", "content"]);
});

Deno.test("the source reference kinds are the ones the constants mirror", () => {
  // A new kind added on one side only is invisible until a Phase 3 document
  // renderer emits it and every such note fails validation.
  const references = schema.properties.source_references as {
    items: { properties: { type: { enum: string[] } }; required: string[] };
  };

  assertEquals(references.items.properties.type.enum, [...SOURCE_REFERENCE_KINDS]);
  assertEquals(references.items.required, ["type", "value"]);
});

// --- Blueprint 23.2 ---------------------------------------------------------

Deno.test("a fixture for every system template passes the contract", () => {
  // Blueprint 23.2 requires "structured output fixtures for every template", and
  // blueprint 12.4 is why they share a shape: templates vary the instructions, not
  // the contract. Validating all eleven stated in one place is what keeps that
  // claim true — if a per-template schema ever appeared, most of these would fail.
  assertEquals(SYSTEM_TEMPLATE_KEYS.length, 11);

  for (const templateKey of SYSTEM_TEMPLATE_KEYS) {
    const result = StructuredNoteSchema.safeParse(structuredNoteFixtureFor(templateKey));

    assertEquals(
      result.success,
      true,
      `${templateKey}: ${result.success ? "" : JSON.stringify(result.error.issues)}`,
    );
    if (result.success) assertEquals(result.data.template_key, templateKey);
  }
});
