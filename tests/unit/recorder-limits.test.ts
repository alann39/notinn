import { assertEquals } from "@std/assert";
import {
  MAX_AUDIO_BYTES,
  MIN_RECORDING_SECONDS,
  RECORDER_MIME_CANDIDATES,
  estimateBytesPerSecond,
  formatDuration,
  formatBytes,
  maxDurationForPlan,
  pickRecorderMime,
  secondsUntilCap,
} from "../../dashboard/src/components/dashboard/recorder-limits.ts";

Deno.test("MIN_RECORDING_SECONDS is positive", () => {
  assertEquals(MIN_RECORDING_SECONDS, 1);
});

Deno.test("formatDuration renders mm:ss and hh:mm:ss", () => {
  assertEquals(formatDuration(0), "00:00");
  assertEquals(formatDuration(59), "00:59");
  assertEquals(formatDuration(60), "01:00");
  assertEquals(formatDuration(3600), "01:00:00");
  assertEquals(formatDuration(7325), "02:02:05");
});

Deno.test("formatDuration floors fractional seconds and clamps negatives", () => {
  assertEquals(formatDuration(59.9), "00:59");
  assertEquals(formatDuration(-5), "00:00");
});

Deno.test("formatBytes renders B, KB and MB", () => {
  assertEquals(formatBytes(512), "512 B");
  assertEquals(formatBytes(2048), "2.0 KB");
  assertEquals(formatBytes(MAX_AUDIO_BYTES), "45.0 MB");
});

Deno.test("maxDurationForPlan mirrors the backend AUDIO_DURATION_BY_PLAN", () => {
  assertEquals(maxDurationForPlan(null), 1800);
  assertEquals(maxDurationForPlan("free"), 1800);
  assertEquals(maxDurationForPlan("pro"), 7200);
  assertEquals(maxDurationForPlan("alpha"), 7200);
  assertEquals(maxDurationForPlan("unknown-plan"), 1800);
});

Deno.test("pickRecorderMime returns the first supported candidate", () => {
  const supported = (type: string) => type === "audio/mp4";
  assertEquals(pickRecorderMime(supported).mimeType, "audio/mp4");
  assertEquals(pickRecorderMime(supported).extension, "mp4");
});

Deno.test("pickRecorderMime falls back to the last entry when nothing matches", () => {
  assertEquals(pickRecorderMime(() => false), RECORDER_MIME_CANDIDATES.at(-1));
});

Deno.test("estimateBytesPerSecond derives bitrate from a recorded blob", () => {
  assertEquals(estimateBytesPerSecond(1024 * 60, 30), 2048);
  assertEquals(estimateBytesPerSecond(0, 0), 0);
});

Deno.test("secondsUntilCap returns null until bytes are observed", () => {
  assertEquals(secondsUntilCap(0, 10), null);
});

Deno.test("secondsUntilCap reports zero once already over the cap", () => {
  assertEquals(secondsUntilCap(MAX_AUDIO_BYTES + 1, 30), 0);
});

Deno.test("secondsUntilCap projects from the observed byte rate", () => {
  assertEquals(secondsUntilCap(1024 * 1024, 1024, MAX_AUDIO_BYTES), 45056);
});
