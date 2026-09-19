import { AppError } from "../errors/app-error.ts";
import type { StructuredNote } from "../schemas/structured-note.ts";

export const NOTE_EXPORT_FORMATS = ["markdown", "text"] as const;
export type NoteExportFormat = (typeof NOTE_EXPORT_FORMATS)[number];

export interface NoteExport {
  readonly filename: string;
  readonly mimeType: "text/markdown;charset=utf-8" | "text/plain;charset=utf-8";
  readonly bytes: Uint8Array;
}

const MAX_EXPORT_BYTES = 2 * 1024 * 1024;

function markdown(value: string): string {
  return value.replace(/([\\`*_[\]{}()#+\-.!|<>])/g, "\\$1");
}

function filenameStem(title: string): string {
  const stem = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return stem === "" ? "notinn-note" : stem;
}

function markdownAction(item: StructuredNote["action_items"][number]): string[] {
  const details = [
    item.owner === null ? null : `  - Owner: ${markdown(item.owner)}`,
    item.due_date_text === null ? null : `  - Due: ${markdown(item.due_date_text)}`,
    item.due_date_iso === null ? null : `  - Due date: ${markdown(item.due_date_iso)}`,
    `  - Confidence: ${Math.round(item.confidence * 100)}%`,
  ].filter((line): line is string => line !== null);
  return [`- [ ] ${markdown(item.task)}`, ...details];
}

function textAction(item: StructuredNote["action_items"][number]): string {
  const details = [
    item.owner === null ? null : `Owner: ${item.owner}`,
    item.due_date_text === null ? null : `Due: ${item.due_date_text}`,
    item.due_date_iso === null ? null : `Due date: ${item.due_date_iso}`,
    `Confidence: ${Math.round(item.confidence * 100)}%`,
  ].filter((value): value is string => value !== null);
  return `- ${item.task}${details.length === 0 ? "" : `\n  ${details.join(" | ")}`}`;
}

function markdownExport(note: StructuredNote): string {
  const blocks: string[] = [`# ${markdown(note.title)}`];
  if (note.summary !== "") blocks.push(`## Summary\n\n${markdown(note.summary)}`);
  for (const section of note.sections) {
    blocks.push(
      `## ${markdown(section.heading)}${
        section.content === "" ? "" : `\n\n${markdown(section.content)}`
      }`,
    );
  }
  if (note.key_points.length > 0) {
    blocks.push(
      `## Key Points\n\n${note.key_points.map((item) => `- ${markdown(item)}`).join("\n")}`,
    );
  }
  if (note.action_items.length > 0) {
    blocks.push(`## Action Items\n\n${note.action_items.flatMap(markdownAction).join("\n")}`);
  }
  if (note.decisions.length > 0) {
    blocks.push(
      `## Decisions\n\n${note.decisions.map((item) => `- ${markdown(item)}`).join("\n")}`,
    );
  }
  if (note.uncertainties.length > 0) {
    blocks.push(
      `## Uncertainties\n\n${note.uncertainties.map((item) => `- ${markdown(item)}`).join("\n")}`,
    );
  }
  if (note.source_references.length > 0) {
    blocks.push(
      `## Source References\n\n${
        note.source_references.map((item) => `- ${markdown(item.type)}: ${markdown(item.value)}`)
          .join("\n")
      }`,
    );
  }
  if (note.tags.length > 0) {
    blocks.push(`## Tags\n\n${note.tags.map((tag) => `- ${markdown(tag)}`).join("\n")}`);
  }
  blocks.push(
    `---\nLanguage: ${markdown(note.language)}  \nTemplate: ${markdown(note.template_key)}`,
  );
  return `${blocks.join("\n\n")}\n`;
}

function textExport(note: StructuredNote): string {
  const blocks: string[] = [note.title];
  if (note.summary !== "") blocks.push(`SUMMARY\n${note.summary}`);
  for (const section of note.sections) {
    blocks.push(
      `${section.heading.toUpperCase()}${section.content === "" ? "" : `\n${section.content}`}`,
    );
  }
  if (note.key_points.length > 0) {
    blocks.push(`KEY POINTS\n${note.key_points.map((item) => `- ${item}`).join("\n")}`);
  }
  if (note.action_items.length > 0) {
    blocks.push(`ACTION ITEMS\n${note.action_items.map(textAction).join("\n")}`);
  }
  if (note.decisions.length > 0) {
    blocks.push(`DECISIONS\n${note.decisions.map((item) => `- ${item}`).join("\n")}`);
  }
  if (note.uncertainties.length > 0) {
    blocks.push(`UNCERTAINTIES\n${note.uncertainties.map((item) => `- ${item}`).join("\n")}`);
  }
  if (note.source_references.length > 0) {
    blocks.push(
      `SOURCE REFERENCES\n${
        note.source_references.map((item) => `- ${item.type}: ${item.value}`).join("\n")
      }`,
    );
  }
  if (note.tags.length > 0) blocks.push(`TAGS\n${note.tags.join(", ")}`);
  blocks.push(`Language: ${note.language}\nTemplate: ${note.template_key}`);
  return `${blocks.join("\n\n")}\n`;
}

/** Render the validated current note into one bounded, in-memory download. */
export function renderNoteExport(note: StructuredNote, format: NoteExportFormat): NoteExport {
  const content = format === "markdown" ? markdownExport(note) : textExport(note);
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength > MAX_EXPORT_BYTES) {
    throw AppError.inputTooLarge("rendered note export exceeded the in-memory limit");
  }
  const markdownFormat = format === "markdown";
  return {
    filename: `${filenameStem(note.title)}.${markdownFormat ? "md" : "txt"}`,
    mimeType: markdownFormat ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
    bytes,
  };
}
