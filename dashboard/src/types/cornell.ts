export interface CornellNoteEntry {
  cue: string | null;
  content: string;
}

export interface CornellNote {
  title: string;
  language: string;
  cues: string[];
  notes: CornellNoteEntry[];
  summary: string;
  tags: string[];
}

export const CORNELL_NOTE_CONTRACT = "cornell_note";

export const CORNELL_NOTE_VERSION = 1;

export function isCornellNote(value: unknown): value is CornellNote {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.title === "string" &&
    typeof note.language === "string" &&
    Array.isArray(note.cues) &&
    note.cues.every((cue) => typeof cue === "string") &&
    Array.isArray(note.notes) &&
    note.notes.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        ((entry as Record<string, unknown>).cue === null ||
          typeof (entry as Record<string, unknown>).cue === "string") &&
        typeof (entry as Record<string, unknown>).content === "string",
    ) &&
    typeof note.summary === "string" &&
    Array.isArray(note.tags) &&
    note.tags.every((tag) => typeof tag === "string")
  );
}
