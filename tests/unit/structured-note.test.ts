import { assertEquals, assertThrows } from "@std/assert";
import {
  describeIssues,
  MAX_NOTE_TAGS,
  parseStructuredNote,
  STRUCTURED_NOTE_FIELDS,
  StructuredNoteSchema,
} from "../../supabase/functions/_shared/schemas/structured-note.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import type { SourceReferenceKind } from "../../supabase/functions/_shared/config/constants.ts";
import { SOURCE_REFERENCE_KINDS } from "../../supabase/functions/_shared/config/constants.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

/**
 * The structured note contract (blueprint 12.4).
 *
 * Each of blueprint 12.4's five "required schema rules" is asserted here, because
 * each is a rule the model is asked to follow and the application has to be able
 * to check. The schema is the check.
 *
 * Two properties deserve their own note.
 *
 * The first is that a violation fails the whole output. This module repairs
 * nothing — see its header for why — so a note with one bad field produces no note
 * at all. That is asserted rather than described, since it is the property a
 * future change is most likely to erode by "helpfully" clamping a number.
 *
 * The second is that the error a violation produces never contains the offending
 * value. `internalDetail` reaches a log, and a note is user content.
 */

/** A validator that records the detail it was handed. */
function collector(): { fail: (detail: string) => Error; detail: () => string } {
  let captured = "";
  return {
    fail: (detail) => {
      captured = detail;
      return AppError.outputValidationFailed(detail);
    },
    detail: () => captured,
  };
}

function parse(value: unknown) {
  const { fail, detail } = collector();
  return { note: parseStructuredNote(value, fail), detail: detail() };
}

// --- The happy path ---------------------------------------------------------

Deno.test("a well-formed note parses with its values intact", () => {
  const fixture = structuredNoteFixture();
  const { note } = parse(fixture);

  assertEquals(note.title, fixture.title);
  assertEquals(note.language, "en");
  assertEquals(note.template_key, "clean_note");
  assertEquals(note.sections.length, 2);
  assertEquals(note.action_items[0]?.owner, "Synthetic Owner");
  assertEquals(note.action_items[1]?.owner, null);
  assertEquals(note.tags, ["synthetic", "planning"]);
});

Deno.test("an empty array is accepted wherever the source had nothing to say", () => {
  // The contract's way of saying "none of these" is an empty array, not a missing
  // key: the key is required, its emptiness is information.
  const { note } = parse(
    structuredNoteFixture({
      summary: "",
      sections: [],
      key_points: [],
      action_items: [],
      decisions: [],
      tags: [],
      uncertainties: [],
      source_references: [],
    }),
  );

  assertEquals(note.summary, "");
  assertEquals(note.sections, []);
  assertEquals(note.tags, []);
});

// --- Rule 1: unknown values are null, never fabricated ----------------------

Deno.test("an empty optional string becomes null rather than an empty value", () => {
  // Blueprint 12.4's first rule. A model that cannot find an owner has two ways to
  // say so, and "" is the common one. Normalising it to null enforces the rule
  // instead of bending it.
  const { note } = parse(
    structuredNoteFixture({
      action_items: [
        {
          task: "Do the synthetic thing",
          owner: "",
          due_date_text: "   ",
          due_date_iso: "",
          confidence: 0.5,
        },
      ],
    }),
  );

  assertEquals(note.action_items[0]?.owner, null);
  assertEquals(note.action_items[0]?.due_date_text, null);
  assertEquals(note.action_items[0]?.due_date_iso, null);
});

// --- Rule 2: dates are normalised only when the source is clear -------------

Deno.test("a due date may be text without an ISO date, which is the honest pairing", () => {
  // "Friday" is clear to a human and not normalisable without knowing the
  // reference date. Storing the text and leaving the ISO form null is the correct
  // outcome, not a failure.
  const { note } = parse(
    structuredNoteFixture({
      action_items: [
        {
          task: "Do the synthetic thing",
          owner: null,
          due_date_text: "end of the month",
          due_date_iso: null,
          confidence: 0.6,
        },
      ],
    }),
  );

  assertEquals(note.action_items[0]?.due_date_text, "end of the month");
  assertEquals(note.action_items[0]?.due_date_iso, null);
});

Deno.test("a date that is not a date is refused", () => {
  for (
    const dueDate of [
      "next Friday",
      "18/09/2026",
      "2026-9-1",
      "2026-13-01",
      "2026-02-30",
      "9999-99-99",
    ]
  ) {
    assertThrows(
      () =>
        parse(structuredNoteFixture({
          action_items: [
            {
              task: "Do the synthetic thing",
              owner: null,
              due_date_text: dueDate,
              due_date_iso: dueDate,
              confidence: 0.5,
            },
          ],
        })),
      AppError,
      undefined,
      `${dueDate} was accepted as an ISO date`,
    );
  }
});

Deno.test("a leap day is a real date and a non-leap 29 February is not", () => {
  // The reason the date check round-trips through the calendar rather than
  // matching a pattern: both of these match `YYYY-MM-DD`.
  const withDate = (due_date_iso: string) =>
    structuredNoteFixture({
      action_items: [
        { task: "Synthetic task", owner: null, due_date_text: null, due_date_iso, confidence: 0.5 },
      ],
    });

  parse(withDate("2028-02-29"));
  assertThrows(() => parse(withDate("2027-02-29")), AppError);
});

// --- Rule 3: owners are not inferred ----------------------------------------

Deno.test("a null owner is a first-class value, not an absence to be filled in", () => {
  // The schema cannot tell whether a model invented an owner — that is the prompt's
  // job and blueprint 25's evaluation. What the schema can do, and does, is keep
  // null representable all the way to the database, so that "not stated" has
  // somewhere to live and a model has no reason to invent something.
  const { note } = parse(
    structuredNoteFixture({
      action_items: [
        {
          task: "A synthetic task",
          owner: null,
          due_date_text: null,
          due_date_iso: null,
          confidence: 1,
        },
      ],
    }),
  );

  assertEquals(note.action_items[0]?.owner, null);
});

// --- Rule 4: confidence is a product signal ---------------------------------

Deno.test("confidence is bounded, because it is a number the application will read", () => {
  const withConfidence = (confidence: number) =>
    structuredNoteFixture({
      action_items: [
        {
          task: "Synthetic task",
          owner: null,
          due_date_text: null,
          due_date_iso: null,
          confidence,
        },
      ],
    });

  parse(withConfidence(0));
  parse(withConfidence(1));
  parse(withConfidence(0.5));

  for (const confidence of [-0.1, 1.1, 42, Number.NaN]) {
    assertThrows(
      () => parse(withConfidence(confidence)),
      AppError,
      undefined,
      `${confidence} passed`,
    );
  }
});

// --- Rule 5: tags have length and count limits ------------------------------

Deno.test("too many tags are refused rather than truncated", () => {
  const tags = Array.from({ length: MAX_NOTE_TAGS }, (_, index) => `tag${index}`);
  parse(structuredNoteFixture({ tags }));

  const oneTooMany = [...tags, `tag${MAX_NOTE_TAGS}`];
  assertThrows(() => parse(structuredNoteFixture({ tags: oneTooMany })), AppError);
});

Deno.test("a tag that is a sentence is refused", () => {
  assertThrows(
    () => parse(structuredNoteFixture({ tags: ["this tag is far too long to be a tag at all"] })),
    AppError,
  );
});

Deno.test("tags are lower-cased and deduplicated", () => {
  // Both are normalisations the contract already asks for — the stored JSON Schema
  // says "lowercase topical tags" — rather than repairs of a violation.
  const { note } = parse(
    structuredNoteFixture({ tags: ["Planning", "planning", "SYNTHETIC"] }),
  );

  assertEquals(note.tags, ["planning", "synthetic"]);
});

// --- Field-level bounds -----------------------------------------------------

Deno.test("a blank or oversized title is refused", () => {
  // `notes.title` is at most 300 characters and not blank. Validating here turns a
  // constraint violation at insert time into a validation failure that names the
  // field, which is the difference between a diagnosable error and an opaque one.
  assertThrows(() => parse(structuredNoteFixture({ title: "" })), AppError);
  assertThrows(() => parse(structuredNoteFixture({ title: "   " })), AppError);
  assertThrows(() => parse(structuredNoteFixture({ title: "x".repeat(301) })), AppError);

  parse(structuredNoteFixture({ title: "x".repeat(300) }));
});

Deno.test("a title is trimmed rather than stored with its padding", () => {
  const { note } = parse(structuredNoteFixture({ title: "  Synthetic title  " }));
  assertEquals(note.title, "Synthetic title");
});

Deno.test("the language tag is normalised to lower case and validated", () => {
  // `notes.language` carries a check constraint with exactly this pattern, so a
  // tag that would fail it must fail here instead.
  // Normalised first, so case and surrounding space are not failures.
  assertEquals(parse(structuredNoteFixture({ language: "ID" })).note.language, "id");
  assertEquals(parse(structuredNoteFixture({ language: " pt-br " })).note.language, "pt-br");
  assertEquals(parse(structuredNoteFixture({ language: "zh-Hant" })).note.language, "zh-hant");
  assertEquals(parse(structuredNoteFixture({ language: "en " })).note.language, "en");

  // Not normalisable into a tag, so refused.
  for (const language of ["indonesian", "i", "", "   ", "en_US", "123", "e", "english-"]) {
    assertThrows(
      () => parse(structuredNoteFixture({ language })),
      AppError,
      undefined,
      `${language} passed`,
    );
  }
});

Deno.test("a section with no heading is refused, and one with no body is not", () => {
  assertThrows(
    () => parse(structuredNoteFixture({ sections: [{ heading: "  ", content: "body" }] })),
    AppError,
  );

  const { note } = parse(structuredNoteFixture({ sections: [{ heading: "Empty", content: "" }] }));
  assertEquals(note.sections[0]?.content, "");
});

Deno.test("a source reference must use one of the three address kinds", () => {
  const reference = (type: SourceReferenceKind) =>
    structuredNoteFixture({ source_references: [{ type, value: "4" }] });

  for (const type of SOURCE_REFERENCE_KINDS) parse(reference(type));

  // Cast because the point of the loop is values the type system already refuses;
  // a provider's answer arrives as `unknown`, so the runtime check is the one that
  // matters and it is what is being tested.
  for (const type of ["line", "PAGE", "", "paragraph"]) {
    assertThrows(
      () => parse(reference(type as SourceReferenceKind)),
      AppError,
      undefined,
      `${type} was accepted`,
    );
  }
});

// --- Structural strictness --------------------------------------------------

Deno.test("every field of the contract is required", () => {
  for (const field of STRUCTURED_NOTE_FIELDS) {
    const note: Record<string, unknown> = { ...structuredNoteFixture() };
    delete note[field];

    assertThrows(
      () => parse(note),
      AppError,
      undefined,
      `a note without ${field} was accepted`,
    );
  }
});

Deno.test("an unknown field is dropped rather than rejected", () => {
  // The provider is asked for this shape and usually gives it. An extra key is
  // inert noise in `content_json`, and losing a usable note over it would be the
  // wrong trade.
  const { note } = parse({
    ...structuredNoteFixture(),
    invented_field: "never requested",
    nested: { deeply: { suspicious: true } },
  });

  assertEquals(Object.keys(note).includes("invented_field"), false);
  assertEquals(Object.keys(note).includes("nested"), false);
  assertEquals(
    Object.keys(note).sort(),
    [...STRUCTURED_NOTE_FIELDS].sort(),
  );
});

Deno.test("a non-object is refused", () => {
  for (const value of [null, undefined, "a string", 42, [], [{ title: "x" }]]) {
    assertThrows(() => parse(value), AppError);
  }
});

// --- The failure itself -----------------------------------------------------

Deno.test("the failure names the offending fields and quotes none of them", () => {
  const { detail } = (() => {
    const { fail, detail } = collector();
    try {
      parseStructuredNote(
        structuredNoteFixture({ title: "", language: "SECRET-USER-CONTENT" }),
        fail,
      );
    } catch {
      // The throw is the point of the call; the detail is what is under test.
    }
    return { detail: detail() };
  })();

  assertEquals(detail.includes("title"), true);
  assertEquals(detail.includes("language"), true);
  assertEquals(detail.includes("SECRET-USER-CONTENT"), false);
});

Deno.test("the issue description is bounded, so a pathological output cannot flood a log", () => {
  // A model that returned an array of 50 malformed action items produces hundreds
  // of issues. The detail is truncated rather than written whole.
  const items = Array.from({ length: 50 }, () => ({ task: "", confidence: 5 }));
  const error = StructuredNoteSchema.safeParse(
    structuredNoteFixture({ action_items: items as never }),
  );

  assertEquals(error.success, false);
  if (!error.success) {
    const described = describeIssues(error.error);
    assertEquals(described.split("; ").length <= 20, true);
    assertEquals(described.length < 1_000, true);
  }
});
