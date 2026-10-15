/**
 * Pure helpers for the in-browser recorder.
 * Kept free of React and DOM APIs so Deno can unit-test it directly
 * (mirrors the pattern used by cornell-note-draft.ts).
 */

/** Supabase Free-tier Storage hard ceiling, shared by every plan. */
export const MAX_AUDIO_BYTES = 45 * 1024 * 1024; // 45 MB

/** Safety ceiling where multi-part auto-cut begins to prevent single-file overflow. */
export const MULTIPART_AUTO_CUT_BYTES = 44.5 * 1024 * 1024; // 44.5 MB

/** A clip shorter than this is almost certainly an accidental tap. */
export const MIN_RECORDING_SECONDS = 1;

export interface RecorderMime {
  mimeType: string;
  extension: string;
}

/**
 * Ordered by preference: WebM/Opus first, then Safari/iOS fallbacks.
 * The final entry is the "nothing matched" default and has an empty
 * mimeType so MediaRecorder picks the browser default.
 */
export const RECORDER_MIME_CANDIDATES: readonly RecorderMime[] = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/mp4", extension: "mp4" },
  { mimeType: "audio/aac", extension: "aac" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "", extension: "webm" },
] as const;

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isProOrAlpha(planKey: string | null | undefined): boolean {
  return planKey === "pro" || planKey === "alpha";
}

/**
 * Mirrors AUDIO_DURATION_BY_PLAN on the backend
 * (tests/contract/migration-constants.test.ts asserts free=1800, pro=7200, alpha=7200).
 */
export function maxDurationForPlan(planKey: string | null | undefined): number {
  return isProOrAlpha(planKey) ? 7200 : 1800;
}

export function pickRecorderMime(
  isSupported: (mimeType: string) => boolean,
): RecorderMime {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (!candidate.mimeType) break; // never probe the empty default
    if (isSupported(candidate.mimeType)) return candidate;
  }
  return RECORDER_MIME_CANDIDATES.at(-1)!;
}

/** Bytes per second implied by an already-recorded blob. */
export function estimateBytesPerSecond(bytes: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return bytes / seconds;
}

/**
 * Seconds of recording that would push a blob past `cap`, given the observed
 * byte rate. Returns null when the rate is not yet meaningful (empty blob).
 */
export function secondsUntilCap(
  bytes: number,
  seconds: number,
  cap: number = MAX_AUDIO_BYTES,
): number | null {
  const rate = estimateBytesPerSecond(bytes, seconds);
  if (rate <= 0) return null;
  const remaining = cap - bytes;
  if (remaining <= 0) return 0;
  return Math.floor(remaining / rate);
}

/** Determines if a recording part should be cleanly split into the next part. */
export function shouldAutoCutPart(bytes: number, cap: number = MULTIPART_AUTO_CUT_BYTES): boolean {
  return bytes >= cap;
}

