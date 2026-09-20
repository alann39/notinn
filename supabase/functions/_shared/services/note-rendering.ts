import { TELEGRAM_MAX_MESSAGE_LENGTH, type TemplateKey } from "../config/constants.ts";
import { AppError } from "../errors/app-error.ts";
import { encodeCallbackPayload } from "../schemas/callback.ts";
import type { StructuredNote } from "../schemas/structured-note.ts";
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "../telegram/client.ts";

/** The rows inside Telegram's reply_markup object. */
type InlineKeyboard = InlineKeyboardMarkup["inline_keyboard"];

/**
 * Deterministic Telegram rendering of a structured note (blueprint 16.2).
 *
 * Blueprint 16.2 asks for four things, and this module is where all four happen:
 * render Telegram-safe HTML, escape every piece of user and model text, split at
 * semantic boundaries, and never break an HTML entity while splitting.
 *
 * The last two pull against each other, and the resolution is the reason this
 * module is arranged the way it is. Splitting escaped HTML is the obvious
 * approach and it is wrong: `&amp;` can be cut in half, and the result is a
 * message that either renders literally or is rejected by Telegram. So nothing
 * here is escaped until the split is already decided.
 *
 *   * A note becomes a list of BLOCKS, each holding plain text and a style.
 *   * Blocks are grouped into pages.
 *   * Each page is escaped, per block, at the very end.
 *
 * Escaping last means an entity cannot span a cut, because at the moment of the
 * cut there are no entities. The same block list produces both outputs a caller
 * needs — the whole message for `note_outputs.rendered_text`, and the pages that
 * are actually sent — so the stored rendering and the delivered messages cannot
 * disagree.
 *
 * A consequence worth stating: `rendered_text` is the whole message, not one
 * page. A note that splits into three messages is stored once.
 *
 * WHAT IS NOT HERE. Model output is never trusted to be markup. Nothing in this
 * module emits an `<a href>`: a URL presented by a model or a user would become a
 * link whose destination the text does not reveal, and blueprint 12.1 is explicit
 * that generated content is never fed into Telegram markup. A URL in a note is
 * rendered as escaped text, and what a client does with it is the client's
 * business. There is also no Markdown anywhere: blueprint 12.3's adapter returns a
 * structured object and this module is the only thing that decides what a reader
 * sees.
 */

// --- Escaping ---------------------------------------------------------------

/**
 * Escape the three characters that carry meaning in Telegram's HTML parse mode.
 *
 * The ampersand is replaced first, and the order is the whole reason this is a
 * function rather than three inline calls at each site. Escaping `<` before `&`
 * turns a literal `&lt;` into `&amp;lt;` — a bug that is invisible until someone's
 * note contains the text "&lt;". Quotes are not escaped because nothing here emits
 * an attribute; if that ever changes, escaping must too, and this comment is where
 * to notice.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- The block model --------------------------------------------------------

export type BlockStyle = "bold" | "plain" | "bullet";

/**
 * A line of the message, before escaping.
 *
 * `text` is plain and may not contain a newline: a newline is a block boundary,
 * which is what makes "split at a semantic boundary" mean something. Model text
 * that contains newlines is divided into blocks when the block list is built.
 */
export interface Block {
  readonly style: BlockStyle;
  readonly text: string;
}

/** Markup added at render time. Never part of `text`, so it is never escaped. */
const BOLD_OPEN = "<b>";
const BOLD_CLOSE = "</b>";
const BULLET = "• ";

function prefixOf(style: BlockStyle): string {
  return style === "bullet" ? BULLET : "";
}

/**
 * The length of a block as Telegram counts it.
 *
 * Telegram documents the message limit as "4096 characters after entities
 * parsing", so bold markup is not counted and the bullet is. `String.length`
 * counts UTF-16 code units, which over-counts an emoji as two; that error is in
 * the safe direction, since it can only make a message shorter than the limit.
 */
function displayLength(block: Block): number {
  return block.text.length + prefixOf(block.style).length;
}

/** A blank line. Costs nothing to display and one separator to pack. */
const SPACER: Block = { style: "plain", text: "" };

/** Read-only, so a caller cannot mutate the shared instance. */
function spacer(): Block {
  return SPACER;
}

function trimSpacers(blocks: readonly Block[]): Block[] {
  let start = 0;
  let end = blocks.length;

  while (start < end && blocks[start]?.text === "") start += 1;
  while (end > start && blocks[end - 1]?.text === "") end -= 1;

  return blocks.slice(start, end);
}

// --- Building the block list ------------------------------------------------

/**
 * The labels the application owns.
 *
 * Blueprint 6.1's templates vary the note's content, not the message's shape, so
 * these labels are the same for every template and live in one place. The title
 * and custom section headings are not here: those come from the note. Summary is
 * labeled too, giving the output one predictable title → section → body hierarchy.
 */
export const NOTE_LABELS = {
  summary: "Summary",
  keyPoints: "Key points",
  actionItems: "Action items",
  decisions: "Decisions",
  uncertainties: "Uncertainties",
  sources: "Sources",
} as const;

/**
 * A paragraph of model prose as blocks, one per line, blank-separated.
 *
 * `sections[].content` is documented as possibly containing newlines. Splitting
 * on runs of newlines keeps each line a separate block, which gives the packer a
 * semantic boundary to break at and preserves the author's paragraph breaks as
 * blank lines.
 */
function pushParagraphs(blocks: Block[], content: string): void {
  const paragraphs = content.split(/\n+/).map((line) => line.trim()).filter((line) => line !== "");

  paragraphs.forEach((text, index) => {
    if (index > 0) blocks.push(spacer());
    blocks.push({ style: "plain", text });
  });
}

/**
 * One action item as a line of text.
 *
 * The owner and the due date are appended only when they exist, and the due date
 * prefers the source's own wording over the normalised form: "Friday" is what the
 * speaker said, and `due_date_iso` is the application's reading of it. When a
 * field is null the line simply loses a clause — there is no placeholder, because
 * a placeholder would be the fabrication blueprint 12.4 forbids.
 *
 * The owner is shown rather than suppressed. A model that set one did so because
 * the source named somebody (blueprint 12.4's third rule), so the owner is
 * information the user asked for; hiding it would make extraction invisible.
 */
export function formatActionItem(item: StructuredNote["action_items"][number]): string {
  const attribution = [item.owner, item.due_date_text ?? item.due_date_iso].filter(
    (part): part is string => part !== null,
  );

  return attribution.length === 0 ? item.task : `${item.task} — ${attribution.join(" · ")}`;
}

/** One source reference, in the form a reader can act on: "page 4". */
export function formatSourceReference(
  reference: StructuredNote["source_references"][number],
): string {
  return `${reference.type} ${reference.value}`;
}

/**
 * The note as blocks.
 *
 * Order follows blueprint 12.4's contract: title, summary, sections, key points,
 * action items, decisions, uncertainties, sources. Tags are deliberately absent.
 * A tag is a search affordance for the knowledge library rather than something a
 * reader needs inline, and twelve of them would crowd out the note they describe;
 * blueprint 16.2's "one concise primary result" is the rule being kept.
 */
function noteToBlocks(note: StructuredNote): Block[] {
  const blocks: Block[] = [{ style: "bold", text: note.title }];

  if (note.summary.trim() !== "") {
    blocks.push(spacer());
    blocks.push({ style: "bold", text: NOTE_LABELS.summary });
    pushParagraphs(blocks, note.summary);
  }

  for (const section of note.sections) {
    blocks.push(spacer());
    blocks.push({ style: "bold", text: section.heading });
    pushParagraphs(blocks, section.content);
  }

  const lists: readonly (readonly [string, readonly string[]])[] = [
    [NOTE_LABELS.keyPoints, note.key_points],
    [NOTE_LABELS.actionItems, note.action_items.map(formatActionItem)],
    [NOTE_LABELS.decisions, note.decisions],
    [NOTE_LABELS.uncertainties, note.uncertainties],
  ];

  for (const [label, items] of lists) {
    if (items.length === 0) continue;
    blocks.push(spacer());
    blocks.push({ style: "bold", text: label });
    for (const item of items) blocks.push({ style: "bullet", text: item });
  }

  if (note.source_references.length > 0) {
    blocks.push(spacer());
    blocks.push({
      style: "plain",
      text: `${NOTE_LABELS.sources}: ${
        note.source_references.map(formatSourceReference).join(", ")
      }`,
    });
  }

  return trimSpacers(blocks);
}

// --- Splitting --------------------------------------------------------------

/**
 * The shortest page this module will produce.
 *
 * A guard rather than a tuning knob. `splitBlock` measures each piece against
 * `limit`, and a limit at or below the bullet prefix would leave a width of zero
 * and a wrap loop that never advances. Values that small are a caller's mistake,
 * and blueprint 29 is explicit that a mistake must not be swallowed — so this
 * throws, and `AppError.internal` is non-retryable because the same call fails the
 * same way next time.
 */
const MIN_PAGE_LENGTH = 32;

/**
 * Break one over-long line at word boundaries.
 *
 * `width` must be at least 1; `splitNoteBlocks` establishes that before calling.
 * A line with no whitespace in a whole page-width is cut mid-word, which is the
 * only alternative to looping — and it does happen: a pasted URL or a base64 blob
 * can be thousands of characters with no space in it.
 */
function wrapText(text: string, width: number): string[] {
  const pieces: string[] = [];
  let rest = text;

  while (rest.length > width) {
    let cut = -1;
    for (let index = width; index > 0; index -= 1) {
      if (/\s/.test(rest[index] ?? "")) {
        cut = index;
        break;
      }
    }

    if (cut === -1) {
      pieces.push(rest.slice(0, width));
      rest = rest.slice(width);
      continue;
    }

    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }

  if (rest !== "") pieces.push(rest);

  return pieces;
}

/**
 * Expand a block that cannot fit a page on its own into blocks that can.
 *
 * Continuation pieces keep the block's style, so a wrapped bullet stays a bullet.
 * That is a cosmetic choice — `MAX_ACTION_TASK_CHARS` is 500, so a bullet that
 * reaches this path is already unusual — and repeating the marker is less
 * confusing than silently changing it to prose.
 */
function splitBlock(block: Block, limit: number): Block[] {
  const width = limit - prefixOf(block.style).length;
  if (block.text.length <= width) return [block];

  return wrapText(block.text, width).map((text): Block => ({ style: block.style, text }));
}

function splitNoteBlocks(blocks: readonly Block[], limit: number): Block[][] {
  if (limit < MIN_PAGE_LENGTH) {
    throw AppError.internal(
      `message limit ${limit} is below the ${MIN_PAGE_LENGTH}-character floor`,
    );
  }

  const expanded = blocks.flatMap((block) => splitBlock(block, limit));
  const pages: Block[][] = [];
  let page: Block[] = [];
  let used = 0;

  for (const block of expanded) {
    const length = displayLength(block);
    // One character for the newline that will join this block to the previous one.
    const separator = page.length > 0 ? 1 : 0;

    if (page.length > 0 && used + separator + length > limit) {
      pages.push(page);
      page = [block];
      used = length;
      continue;
    }

    page.push(block);
    used += separator + length;
  }

  if (page.length > 0) pages.push(page);

  return pages;
}

/**
 * Escape and join one page.
 *
 * Strips the spacers first: a page that begins or ends with a blank line is the
 * visible scar of a split, and it is why the page list is built from blocks rather
 * than from the finished string.
 */
function renderPage(blocks: readonly Block[]): string {
  return trimSpacers(blocks)
    .map((block) =>
      block.style === "bold"
        ? `${BOLD_OPEN}${escapeHtml(block.text)}${BOLD_CLOSE}`
        : `${prefixOf(block.style)}${escapeHtml(block.text)}`
    )
    .join("\n");
}

export interface RenderedNote {
  /**
   * The whole note as one HTML string — what `note_outputs.rendered_text` stores.
   *
   * Stored as one value even when delivery needs several messages, so that the
   * note's rendering is a property of the note rather than of the transport.
   */
  readonly html: string;
  /** The messages Telegram will receive, in order. One, unless the note is long. */
  readonly pages: readonly string[];
}

/**
 * Render a validated note for Telegram.
 *
 * `limit` is `sendMessage`'s per-message cap. It is a parameter so that tests can
 * exercise splitting with a limit a human can read; every production caller uses
 * the default.
 */
export function renderNoteOutput(
  note: StructuredNote,
  limit: number = TELEGRAM_MAX_MESSAGE_LENGTH,
): RenderedNote {
  const blocks = noteToBlocks(note);

  return {
    html: renderPage(blocks),
    pages: splitNoteBlocks(blocks, limit).map(renderPage),
  };
}

/** Render a provider transcript as escaped, length-bounded Telegram pages. */
export function renderTranscriptPages(
  transcript: string,
  limit: number = TELEGRAM_MAX_MESSAGE_LENGTH,
): readonly string[] {
  const blocks: Block[] = [{ style: "bold", text: "Transcript" }];
  if (transcript.trim() !== "") {
    blocks.push(spacer());
    pushParagraphs(blocks, transcript);
  }
  return splitNoteBlocks(blocks, limit).map(renderPage);
}

// --- The inline keyboard ----------------------------------------------------

/**
 * The keyboard types are the transport's, imported rather than restated.
 *
 * `_shared/telegram/client.ts` is where `sendMessage` declares what it accepts, and
 * a second structurally identical pair of interfaces here would compile happily
 * while being a different type — so the day one of them gained a field, the two
 * would diverge in silence. Reaching upward into `telegram/` for a wire shape is
 * not the inversion the layering rule forbids: this module renders *for Telegram*
 * and says so in its own heading, and what it imports is a type, not a call.
 */

/** A compact format picker: three short rows before navigation. */
export const FORMAT_PAGE_SIZE = 6;

export interface NoteKeyboardOptions {
  /** The note the buttons act on. Encoded, never sent raw. */
  readonly noteId: string;
  /** Selects between the Save and Unsave labels. */
  readonly isSaved: boolean;
}

export interface FormatKeyboardOptions {
  /** The note the buttons act on. Encoded, never sent raw. */
  readonly noteId: string;
  /** The format the note is currently in, so it is not offered as an alternative. */
  readonly templateKey: TemplateKey;
  /** Template display names, keyed by template key. See `labelFor`. */
  readonly templateLabels: ReadonlyMap<string, string>;
  /** Zero-based picker page. Out-of-range values are clamped safely. */
  readonly page: number;
}

/**
 * A template's display name, or its key if the lookup missed.
 *
 * Falling back to the key keeps every format reachable when a label is missing,
 * at the cost of an ugly button. Dropping the button instead would mean a
 * database read that returned fewer rows than expected silently removed a feature
 * from the user's screen, which is the harder failure to notice.
 */
function labelFor(templateLabels: ReadonlyMap<string, string>, key: string): string {
  return templateLabels.get(key) ?? key;
}

function button(
  text: string,
  action: Parameters<typeof encodeCallbackPayload>[0]["action"],
  noteId: string,
  revision = 0,
): InlineKeyboardButton {
  return {
    text,
    callback_data: encodeCallbackPayload({ action, resourceId: noteId, revision }),
  };
}

/**
 * The compact keyboard attached to every delivered note.
 *
 * The three primary intents stay visible; regeneration, format selection and
 * export live behind Edit. Progressive disclosure keeps the result itself in
 * focus and prevents eleven system templates plus custom templates from taking
 * over the conversation.
 *
 * Save and Unsave are one button whose label and payload always agree. The payload
 * is chosen from the state at render time, so a stale button on an old message
 * carries `save` and is idempotent, which is why Phase 1 does not need the
 * revision field to protect it.
 *
 * Delete still requires a confirmation click, so the compact row cannot execute
 * a destructive action accidentally.
 */
export function buildNoteKeyboard(options: NoteKeyboardOptions): InlineKeyboard {
  const { noteId, isSaved } = options;
  return [[
    button(isSaved ? "Unsave" : "Save", isSaved ? { kind: "unsave" } : { kind: "save" }, noteId),
    button("Edit", { kind: "edit" }, noteId),
    button("Delete", { kind: "delete" }, noteId),
  ]];
}

/** The first level revealed after Edit. */
export function buildEditKeyboard(noteId: string): InlineKeyboard {
  return [
    [
      button("Shorter", { kind: "shorter" }, noteId),
      button("More detailed", { kind: "detailed" }, noteId),
    ],
    [
      button("Change format", { kind: "edit_format" }, noteId),
      button("Export", { kind: "edit_export" }, noteId),
    ],
    [button("Back", { kind: "edit_back" }, noteId)],
  ];
}

/** Export choices stay out of sight until the user asks for them. */
export function buildExportKeyboard(noteId: string): InlineKeyboard {
  return [
    [
      button("Markdown", { kind: "export_md" }, noteId),
      button("Text", { kind: "export_txt" }, noteId),
      button("PDF", { kind: "export_pdf" }, noteId),
    ],
    [button("Back", { kind: "edit" }, noteId)],
  ];
}

/** Paginated format choices, two per row, followed by navigation and Back. */
export function buildFormatKeyboard(options: FormatKeyboardOptions): InlineKeyboard {
  const alternatives = [...options.templateLabels.keys()].filter((key) =>
    key !== options.templateKey
  );
  const pageCount = Math.max(1, Math.ceil(alternatives.length / FORMAT_PAGE_SIZE));
  const page = Math.min(Math.max(0, options.page), pageCount - 1);
  const visible = alternatives.slice(page * FORMAT_PAGE_SIZE, (page + 1) * FORMAT_PAGE_SIZE);
  const rows: InlineKeyboardButton[][] = [];

  for (let index = 0; index < visible.length; index += 2) {
    rows.push(
      visible.slice(index, index + 2).map((key) =>
        button(
          labelFor(options.templateLabels, key),
          { kind: "format", templateKey: key },
          options.noteId,
        )
      ),
    );
  }

  const navigation: InlineKeyboardButton[] = [];
  if (page > 0) {
    navigation.push(button("‹ Previous", { kind: "format_prev" }, options.noteId, page - 1));
  }
  if (page < pageCount - 1) {
    navigation.push(button("Next ›", { kind: "format_next" }, options.noteId, page + 1));
  }
  if (navigation.length > 0) rows.push(navigation);
  rows.push([button("Back", { kind: "edit" }, options.noteId)]);
  return rows;
}

/**
 * The keyboard on the "delete this note?" prompt.
 *
 * Confirmation is a second click rather than a second message, so the prompt
 * replaces the note's keyboard on the message the user just read — there is no way
 * to be looking at one note and confirming the deletion of another.
 *
 * Cancel has its own idempotent action so it can restore this message's normal
 * keyboard. Reusing `show` would leave the confirmation buttons active on the old
 * message and send a duplicate note instead of actually cancelling.
 */
export function buildDeleteConfirmationKeyboard(noteId: string): InlineKeyboard {
  return [[
    button("Yes, delete", { kind: "delete_confirm" }, noteId),
    button("Cancel", { kind: "cancel_delete" }, noteId),
  ]];
}
