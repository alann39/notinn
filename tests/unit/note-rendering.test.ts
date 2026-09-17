import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  buildDeleteConfirmationKeyboard,
  buildNoteKeyboard,
  escapeHtml,
  formatActionItem,
  NOTE_LABELS,
  renderNoteOutput,
} from "../../supabase/functions/_shared/services/note-rendering.ts";
import {
  SYSTEM_TEMPLATE_KEYS,
  TELEGRAM_MAX_CALLBACK_DATA_BYTES,
} from "../../supabase/functions/_shared/config/constants.ts";
import { decodeCallbackPayload } from "../../supabase/functions/_shared/schemas/callback.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { ERROR_CODES } from "../../supabase/functions/_shared/errors/taxonomy.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

/**
 * Rendering (blueprint 16.2, 23.1).
 *
 * Blueprint 23.1 asks for unit tests covering "Telegram HTML escaping and message
 * splitting" by name, and it is right to single them out: this module is the only
 * place where text a user or a model produced becomes markup, and the only place
 * where one note becomes several messages.
 *
 * Three properties are asserted rather than assumed.
 *
 *   * Nothing a user or a model wrote can become markup. A note whose every field
 *     is hostile is rendered, and the output is checked for any angle bracket this
 *     module did not emit itself.
 *
 *   * No page breaks an entity. This is the failure a naive splitter has and that a
 *     test on short inputs never sees, so it is asserted on pages cut through text
 *     that is full of ampersands.
 *
 *   * Splitting loses nothing. The pages are reassembled and compared with the
 *     whole message, so a splitter that dropped a line at each break would fail
 *     rather than merely look tidy.
 */

/** The fixture, as the renderer receives it. */
const note = structuredNoteFixture();

const NOTE_ID = "8f4c1e2a-1234-4abc-89de-0123456789ab";

/** Template display names, in the shape the repository returns them. */
const LABELS: ReadonlyMap<string, string> = new Map([
  ["clean_note", "Clean Note"],
  ["short_summary", "Short Summary"],
  ["detailed_summary", "Detailed Summary"],
  ["key_points", "Key Points"],
  ["action_items", "Action Items"],
  ["meeting_notes", "Meeting Notes"],
  ["study_notes", "Study Notes"],
  ["decision_log", "Decision Log"],
  ["sop_procedure", "SOP / Procedure"],
  ["research_note", "Research Note"],
  ["extract_and_summarize", "Extract & Summarize"],
]);

// --- Escaping ---------------------------------------------------------------

Deno.test("the three characters that carry markup are escaped", () => {
  assertEquals(escapeHtml("a < b > c"), "a &lt; b &gt; c");
  assertEquals(escapeHtml("Bread & butter"), "Bread &amp; butter");
  assertEquals(escapeHtml("<b>not bold</b>"), "&lt;b&gt;not bold&lt;/b&gt;");
});

Deno.test("the ampersand is escaped first, so an entity is not double-escaped", () => {
  // The classic version of this bug: escaping `<` before `&` turns the literal text
  // "&lt;" into "&amp;lt;", which renders as "&lt;". The escape appears to work
  // everywhere except the one input that looks like an entity already.
  assertEquals(escapeHtml("&lt;"), "&amp;lt;");
  assertEquals(escapeHtml("&amp;"), "&amp;amp;");
});

Deno.test("quotes are left alone, because nothing here writes an attribute", () => {
  assertEquals(escapeHtml(`He said "hello" and 'goodbye'`), `He said "hello" and 'goodbye'`);
});

// --- The message ------------------------------------------------------------

Deno.test("a note renders with its title, summary, sections and lists", () => {
  const { html } = renderNoteOutput(note);
  const lines = html.split("\n");

  assertEquals(lines[0], "<b>Synthetic weekly sync</b>");
  assert(lines.includes("A synthetic note used by tests only."));
  assert(lines.includes("<b>Context</b>"));
  assert(lines.includes("The synthetic team met to discuss nothing real."));
  assert(lines.includes(`<b>${NOTE_LABELS.keyPoints}</b>`));
  assert(lines.includes("• Synthetic point one."));
  assert(lines.includes(`<b>${NOTE_LABELS.actionItems}</b>`));
  assert(lines.includes("• Draft the synthetic document — Synthetic Owner, Friday"));
  assert(lines.includes(`<b>${NOTE_LABELS.decisions}</b>`));
});

Deno.test("groups are separated by exactly one blank line", () => {
  // Two would be as wrong as none. A test that only checked for "contains" would
  // pass on a message with ragged spacing, and the layout is meant to be
  // deterministic.
  const { html } = renderNoteOutput(note);

  assert(!html.includes("\n\n\n"), "the message contains a double blank line");
  assert(html.includes("\n\n"), "the message contains no blank line at all");
  assert(!html.startsWith("\n"), "the message starts with a blank line");
  assert(!html.endsWith("\n"), "the message ends with a blank line");
});

Deno.test("a note with only a title renders as a title", () => {
  // Every group but the title is optional. A renderer that emitted an empty "Key
  // points" heading for an empty array would be inventing structure the note does
  // not have.
  const { html } = renderNoteOutput(
    structuredNoteFixture({
      summary: "",
      sections: [],
      key_points: [],
      action_items: [],
      decisions: [],
      uncertainties: [],
      source_references: [],
    }),
  );

  assertEquals(html, "<b>Synthetic weekly sync</b>");
});

Deno.test("tags are not rendered", () => {
  // A deliberate omission, not an oversight: a tag is a library affordance
  // (blueprint 13) and a dozen of them would crowd out the note they describe.
  // Asserted so that adding them later is a decision somebody takes rather than a
  // line that quietly appeared.
  const { html } = renderNoteOutput(structuredNoteFixture({ tags: ["alpha", "beta"] }));

  assert(!html.includes("alpha"));
  assert(!html.includes("beta"));
});

Deno.test("a source reference renders as a line a reader can act on", () => {
  const { html } = renderNoteOutput(
    structuredNoteFixture({ source_references: [{ type: "page", value: "4" }] }),
  );

  assert(html.includes(`${NOTE_LABELS.sources}: page 4`), html);
});

Deno.test("paragraphs inside a section keep their break as a blank line", () => {
  const { html } = renderNoteOutput(
    structuredNoteFixture({
      summary: "",
      sections: [{ heading: "Context", content: "First paragraph.\n\nSecond paragraph." }],
      key_points: [],
      action_items: [],
      decisions: [],
      uncertainties: [],
    }),
  );

  assertEquals(
    html,
    "<b>Synthetic weekly sync</b>\n\n<b>Context</b>\nFirst paragraph.\n\nSecond paragraph.",
  );
});

Deno.test("an action item loses a clause rather than gaining a placeholder", () => {
  // Blueprint 12.4: unknown values are null, never fabricated. Rendering a null
  // owner as "unassigned" would put a value where the contract says there is none.
  assertEquals(
    formatActionItem({
      task: "Do the thing",
      owner: null,
      due_date_text: null,
      due_date_iso: null,
      confidence: 0.5,
    }),
    "Do the thing",
  );

  assertEquals(
    formatActionItem({
      task: "Do the thing",
      owner: "Andi",
      due_date_text: null,
      due_date_iso: "2026-09-18",
      confidence: 0.5,
    }),
    "Do the thing — Andi, 2026-09-18",
  );

  // The source's own wording wins over the normalised form: "Friday" is what the
  // speaker said, and the ISO date is the application's reading of it.
  assertEquals(
    formatActionItem({
      task: "Do the thing",
      owner: null,
      due_date_text: "Friday",
      due_date_iso: "2026-09-18",
      confidence: 0.5,
    }),
    "Do the thing — Friday",
  );
});

// --- Hostile content --------------------------------------------------------

/** The message with this module's own markup removed, so only content remains. */
function contentOnly(html: string): string {
  return html.replace(/<\/?b>/g, "");
}

/** True if a page contains a `<`, a `>` or an `&` that is not an entity. */
function hasStrayMarkup(html: string): boolean {
  const content = contentOnly(html);
  return content.includes("<") || content.includes(">") || /&(?!(amp|lt|gt);)/.test(content);
}

Deno.test("nothing a model or a user wrote can become markup", () => {
  // Every field carries a tag and an ampersand. The assertion is not "these are
  // escaped" but "no angle bracket survives that this module did not emit", which
  // also catches a future edit that emits markup from a field by accident.
  const hostile = "<b>bold</b> & <script>alert(1)</script>";
  const { html } = renderNoteOutput(
    structuredNoteFixture({
      title: hostile,
      summary: hostile,
      sections: [{ heading: hostile, content: hostile }],
      key_points: [hostile],
      action_items: [
        {
          task: hostile,
          owner: hostile,
          due_date_text: hostile,
          due_date_iso: null,
          confidence: 0.5,
        },
      ],
      decisions: [hostile],
      uncertainties: [hostile],
      source_references: [{ type: "segment", value: hostile }],
    }),
  );

  assertEquals(html.includes("<script>"), false);
  assertEquals(html.includes("</script>"), false);
  assertEquals(hasStrayMarkup(html), false, contentOnly(html));
  // The content is present, escaped — this is not passing by rendering nothing.
  assert(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

// --- Splitting --------------------------------------------------------------

/** Reassembly comparison: markup stripped, whitespace collapsed. */
function words(html: string): string {
  return contentOnly(html)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split(/\s+/)
    .filter((word) => word !== "")
    .join(" ");
}

/** A note whose sections are long enough to need several pages. */
function longNote(sentences: number) {
  const body = Array.from(
    { length: sentences },
    (_, index) => `Synthetic sentence number ${index} about nothing in particular.`,
  ).join(" ");

  return structuredNoteFixture({
    summary: "",
    sections: [
      { heading: "First section", content: body },
      { heading: "Second section", content: body },
    ],
    key_points: [],
    action_items: [],
    decisions: [],
    uncertainties: [],
  });
}

Deno.test("a short note is one page, and that page is the stored rendering", () => {
  // The property that keeps `note_outputs.rendered_text` and the delivered message
  // from being two different things.
  const { html, pages } = renderNoteOutput(note);

  assertEquals(pages.length, 1);
  assertEquals(pages[0], html);
});

Deno.test("every page fits the limit", () => {
  for (const limit of [64, 100, 200, 1_000, 4_096]) {
    const { pages } = renderNoteOutput(longNote(60), limit);

    for (const [index, page] of pages.entries()) {
      assert(page.length <= limit, `limit ${limit}: page ${index} is ${page.length} characters`);
    }
  }
});

Deno.test("no page breaks an entity", () => {
  // The failure this module is arranged to prevent. The sections are full of
  // ampersands and the pages are cut through them.
  const { pages } = renderNoteOutput(
    structuredNoteFixture({
      summary: "Bread & butter, salt & pepper, this & that, here & there.",
      sections: Array.from({ length: 12 }, (_, index) => ({
        heading: `Section ${index} & friends`,
        content: "Salt & pepper, bread & butter, up & down, in & out, here & there.",
      })),
      key_points: [],
      action_items: [],
      decisions: [],
      uncertainties: [],
    }),
    64,
  );

  assert(pages.length > 1, "the fixture did not need splitting");
  for (const page of pages) {
    assertEquals(hasStrayMarkup(page), false, JSON.stringify(page));
  }
});

Deno.test("splitting loses nothing", () => {
  // The invariant that makes a multi-page note safe. A splitter that dropped the
  // line containing the break would still produce pages that fit; this is what
  // catches it.
  const { html, pages } = renderNoteOutput(longNote(60), 200);

  assert(pages.length > 1, "the fixture did not need splitting");
  assertEquals(words(pages.join("\n")), words(html));
});

Deno.test("pages break between blocks before they break inside one", () => {
  // Blueprint 16.2's "semantic boundaries". Every block here is short enough to fit
  // a page, so no block may be split: each line of each page must be a whole block
  // rendering and nothing else.
  const { pages } = renderNoteOutput(
    structuredNoteFixture({
      summary: "",
      sections: [],
      key_points: Array.from(
        { length: 40 },
        (_, index) => `Synthetic point number ${index} about nothing.`,
      ),
      action_items: [],
      decisions: [],
      uncertainties: [],
    }),
    100,
  );

  assert(pages.length > 1, "the fixture did not need splitting");

  const whole = new Set([
    "<b>Synthetic weekly sync</b>",
    `<b>${NOTE_LABELS.keyPoints}</b>`,
    "",
    ...Array.from({ length: 40 }, (_, index) => `• Synthetic point number ${index} about nothing.`),
  ]);

  for (const page of pages) {
    for (const line of page.split("\n")) {
      assert(whole.has(line), `a page contains a partial block: ${JSON.stringify(line)}`);
    }
  }
});

Deno.test("a line with no space in it is cut rather than left unsplit", () => {
  // A pasted URL or a blob has no word boundary anywhere in a page's width. The
  // alternative to cutting mid-word is looping forever, so this is the one place the
  // break is not semantic — and the page still fits.
  const blob = "A".repeat(500);
  const fixture = structuredNoteFixture({
    summary: "",
    sections: [{ heading: "Blob", content: blob }],
    key_points: [],
    action_items: [],
    decisions: [],
    uncertainties: [],
  });

  const { html, pages } = renderNoteOutput(fixture, 100);

  assert(pages.length > 1, "the blob did not need splitting");
  for (const page of pages) assert(page.length <= 100, `page is ${page.length} characters`);
  assert(html.includes(blob), "the blob was altered");

  // Compared with spaces removed, which the other reassembly test does not need.
  // A hard cut creates a whitespace boundary the original text did not have, so
  // comparing word for word would fail on a splitter that behaved correctly.
  assertEquals(
    words(pages.join("\n")).replace(/ /g, ""),
    words(html).replace(/ /g, ""),
  );
});

Deno.test("a limit too small to hold a bullet is refused, not looped over", () => {
  // The guard exists because the splitter advances by at most `limit` characters;
  // a limit at or below the bullet prefix would advance by zero. It throws a
  // non-retryable error rather than hanging, because a bad limit is a bug and a bug
  // reproduces on retry.
  const error = assertThrows(() => renderNoteOutput(note, 4), AppError);

  assertEquals(error.code, ERROR_CODES.INTERNAL_ERROR);
});

// --- The inline keyboard ----------------------------------------------------

Deno.test("the keyboard offers the save toggle, the two length actions and delete", () => {
  const keyboard = buildNoteKeyboard({
    noteId: NOTE_ID,
    templateKey: "clean_note",
    isSaved: false,
    templateLabels: LABELS,
  });

  assertEquals(keyboard[0]?.map((button) => button.text), ["Save", "Shorter", "More detailed"]);
  assertEquals(keyboard.at(-1)?.map((button) => button.text), ["Delete"]);
  assert(keyboard.length > 2, "the format buttons are missing");
});

Deno.test("the save button becomes unsave, and its payload changes with it", () => {
  const build = (isSaved: boolean) =>
    buildNoteKeyboard({
      noteId: NOTE_ID,
      templateKey: "clean_note",
      isSaved,
      templateLabels: LABELS,
    });

  const unsaved = build(false)[0]?.[0];
  assertEquals(unsaved?.text, "Save");
  assertEquals(decodeCallbackPayload(unsaved?.callback_data ?? "").action, { kind: "save" });

  const saved = build(true)[0]?.[0];
  assertEquals(saved?.text, "Unsave");
  assertEquals(decodeCallbackPayload(saved?.callback_data ?? "").action, { kind: "unsave" });
});

Deno.test("every other format is offered, and the current one is not", () => {
  const keyboard = buildNoteKeyboard({
    noteId: NOTE_ID,
    templateKey: "clean_note",
    isSaved: false,
    templateLabels: LABELS,
  });

  const offered = keyboard
    .flat()
    .map((button) => decodeCallbackPayload(button.callback_data).action)
    .filter((action) => action.kind === "format")
    .map((action) => (action.kind === "format" ? action.templateKey : ""));

  assertEquals(offered.length, SYSTEM_TEMPLATE_KEYS.length - 1);
  assertEquals(offered.includes("clean_note"), false);
  assertEquals(
    [...offered].sort(),
    SYSTEM_TEMPLATE_KEYS.filter((key) => key !== "clean_note").sort(),
  );
});

Deno.test("every button decodes back to the note it was built for", () => {
  // A button that acts on the wrong note is the failure with the worst blast radius
  // in the system, so the round trip is checked on the real keyboard rather than on
  // a hand-built payload.
  const buttons = [
    ...buildNoteKeyboard({
      noteId: NOTE_ID,
      templateKey: "clean_note",
      isSaved: true,
      templateLabels: LABELS,
    }).flat(),
    ...buildDeleteConfirmationKeyboard(NOTE_ID).flat(),
  ];

  assert(buttons.length > 0);
  for (const item of buttons) {
    assertEquals(decodeCallbackPayload(item.callback_data).resourceId, NOTE_ID);
    assert(item.text.length > 0, "a button has no label");
  }
});

Deno.test("a missing template label falls back to the key rather than dropping the button", () => {
  // Dropping the button would mean a database read returning fewer rows than
  // expected silently removed a format from the user's screen. An ugly label is the
  // easier failure to notice.
  const keyboard = buildNoteKeyboard({
    noteId: NOTE_ID,
    templateKey: "clean_note",
    isSaved: false,
    templateLabels: new Map(),
  });

  const formats = keyboard.flat().filter((button) => button.callback_data.includes("format."));

  assertEquals(formats.length, SYSTEM_TEMPLATE_KEYS.length - 1);
  assert(formats.some((button) => button.text === "short_summary"));
});

Deno.test("every button payload fits Telegram's byte limit", () => {
  // The codec asserts the budget at encode time, but a keyboard built here is what
  // actually reaches the Bot API, so it is checked on the real output — against
  // every template, since the longest name is the one that would break it.
  for (const templateKey of SYSTEM_TEMPLATE_KEYS) {
    const keyboard = buildNoteKeyboard({
      noteId: NOTE_ID,
      templateKey,
      isSaved: false,
      templateLabels: LABELS,
    });

    for (const item of keyboard.flat()) {
      const bytes = new TextEncoder().encode(item.callback_data).length;
      assert(bytes <= TELEGRAM_MAX_CALLBACK_DATA_BYTES, `${item.callback_data} is ${bytes} bytes`);
    }
  }
});

Deno.test("the delete confirmation offers a way back that changes nothing", () => {
  const actions = buildDeleteConfirmationKeyboard(NOTE_ID)
    .flat()
    .map((button) => decodeCallbackPayload(button.callback_data).action);

  assertEquals(actions, [{ kind: "delete_confirm" }, { kind: "show" }]);
});
