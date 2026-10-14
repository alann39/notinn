# Notinn Web Audio Recording — Development Plan

> **STATUS: SHIPPED & LIVE IN PRODUCTION (2026-10-14)**
> Deployed via commits `63c9d34`, `db300b7`, `af80e95`, and `c332fa9`.
> All tasks (1 through 6) completed, along with post-audit enhancements:
> - Permissions-Policy `microphone=(self)` configured in `vercel.json`.
> - Clean handoff architecture: Record tab is strictly audio capture & review, handing off to Upload tab for templates & TUS upload.
> - Removed live waveform canvas in favour of Rare UI Thinking Orb visualizer.
> - Responsive mobile UI tailored for small viewports (<360px Galaxy A55).
> - Asynchronous discard cleanup guard (`isDiscardingRef`) preventing unwanted review state creation.
> - Full English localization and form accessibility attributes.

**Goal:** Ship the in-browser audio recording feature (`InBrowserRecorder` + `VoiceNote` player) into the Notinn production dashboard so it is wired end-to-end and tested, without touching Cornell (held).

**Architecture:** The recorder is a self-contained frontend component that produces a `File`; the existing `UploadAudioDialog` already routes that file through the proven TUS → Supabase Storage → `web-submit-audio-job` → job-poll path. Work is therefore: (1) harden the recorder component, (2) wire plan-tier limits + real waveform data, (3) add regression tests, (4) deploy behind Vercel (approval-gated).

**Tech Stack:** Vite 6 + React 19 + TypeScript 5.8 + Tailwind CSS 4 + shadcn/base-ui; Playwright (browser tests); Deno (unit/contract tests); `thinking-orbs` + Rare UI `voice-note`; `tus-js-client` 4.3.1; Supabase Storage/Edge Functions.

**Repo root:** `C:\Users\arkad\Documents\WEB DEV\notinn` (Windows laptop, dev via SSH from VPS).

---

## Current context / assumptions

Verified facts (2026-10-14, read-only inspection):

| Item | Value |
|---|---|
| Recorder component | `dashboard/src/components/dashboard/in-browser-recorder.tsx` (632 lines) |
| Voice note player | `dashboard/src/components/ui/voice-note.tsx` (Rare UI, provenance comment at top) |
| Dialog that hosts it | `dashboard/src/components/dashboard/upload-audio-dialog.tsx` |
| Default tab | `activeTab` state initialised to `"record"` (line 200) |
| Recorder tab JSX | `upload-audio-dialog.tsx:739-756` |
| `onAudioReady` handler | `upload-audio-dialog.tsx:743-756` — sets `selectedFile`, `durationSeconds`, `fileTemplateKey`, then `setActiveTab("upload")` |
| TUS upload | `upload-audio-dialog.tsx:486-522` — endpoint `${SUPABASE_URL}/storage/v1/upload/resumable`, 2 MB chunks, bucket `audio_uploads` |
| Job submission | `upload-audio-dialog.tsx:527` — `POST ${SUPABASE_URL}/functions/v1/web-submit-audio-job` |
| Job polling | `upload-audio-dialog.tsx:394-425` (`pollJobCompletion`, 30 attempts × 1.5 s = 45 s) |
| Ceiling constants | `upload-audio-dialog.tsx:109-112` — `MAX_AUDIO_BYTES = 45 MB`, `MAX_DOC_BYTES = 14 MB`, `FREE_MAX_SECONDS = 1800`, `PRO_MAX_SECONDS = 7200` |
| Plan detection | `upload-audio-dialog.tsx:225` — `profile?.plan_key === "pro" \|\| profile?.plan_key === "alpha"` |
| Backend mirror of limits | `AUDIO_DURATION_BY_PLAN` = `{free: 1800, pro: 7200, alpha: 7200}` (asserted in `tests/contract/migration-constants.test.ts:427-429`) |
| Test harness route | `/test/audio-recorder`, DEV-only in `dashboard/src/app/router.tsx:29-31` |
| Recorder Playwright config | `dashboard/playwright.recorder.config.ts` (baseURL `http://127.0.0.1:5199`, webServer `npx vite --port 5199`) |
| Recorder spec | `dashboard/tests/browser/recorder-flow.spec.ts` (fake mic via `--use-fake-device-for-media-stream`) |
| Unit tests that import dashboard TS | `tests/unit/cornell-draft.test.ts` imports `../../dashboard/src/components/dashboard/cornell-note-draft.ts` — pattern is viable for pure `.ts` modules only |
| Verification commands | `npx tsc --noEmit`, `npx playwright test --config playwright.recorder.config.ts`, `npx deno task check`, `npx deno task test` (from repo root / `dashboard/`) |

**Assumptions that MUST be re-verified before acting:**
1. The user's manual browser test at `http://127.0.0.1:5199/test/audio-recorder` succeeded through Review. It did NOT reach a real TUS upload (that page has no auth session).
2. No `git` commit/push has been made for any recorder work — all changes are uncommitted (`git status` shows `?? dashboard/src/components/dashboard/in-browser-recorder.tsx`, `?? dashboard/src/components/ui/voice-note.tsx`, `?? dashboard/src/app/test-recorder-page.tsx`, `M dashboard/src/components/dashboard/upload-audio-dialog.tsx`, `M dashboard/src/index.css`, `M dashboard/index.html`, `M dashboard/package.json`, `M dashboard/package-lock.json`).
3. Cornell stays on hold. This plan must not modify any `cornell-*` file.

**HARD CONSTRAINT — never violated by any task below:**
> No `git commit`, `git push`, `supabase` deploy, or `vercel` deploy without explicit user approval. Vercel auto-deploys on push. Build/test commands are fine.

**Remote execution model:** Hermes (VPS) is tech lead; work executes on the laptop over SSH:
```
ssh Awwalun@100.84.221.104 'Set-Location "C:\Users\arkad\Documents\WEB DEV\notinn"; <command>'
scp <local> 'Awwalun@100.84.221.104:C:/Users/arkad/Documents/WEB DEV/notinn/<remote-path>'
```

---

## Risks, tradeoffs, and open questions (read this first)

1. **Plan-tier duration limit is not yet passed to the recorder.** `upload-audio-dialog.tsx:741-742` passes `templates` and `defaultTemplateKey` but NOT `maxDurationSeconds`. The recorder falls back to its own default `1800`. Pro/Alpha users get a 30-minute cap in the recorder even though the upload path allows 7200 s. **Task 2 fixes this** — highest-value correctness fix in the plan.
2. **45 MB hard ceiling can't be pre-checked during recording.** A 30-minute Opus recording can exceed 45 MB. The dialog's `handleUploadFile` rejects it only after the user records. **Task 3** adds a live size estimate and a hard auto-stop so the user never records something unuploadable.
3. **The waveform is fake during playback.** `VoiceNote` renders a deterministic synthetic waveform from `seed` (see `buildWaveform` in `voice-note.tsx`). Real peaks require decoding the blob. **Task 4** implements real peak extraction via `decodeAudioData` with a synthetic fallback. Riskiest task — if `decodeAudioData` proves flaky in WebKit/Safari, keep the synthetic fallback and mark done-with-fallback.
4. **`tests/unit/` can only import pure `.ts`, not `.tsx`.** Deno can't compile TSX/React. Recorder logic that needs unit tests must live in a `.ts` module (**Task 1** extracts exactly such a module). Browser-level behaviour stays in Playwright.
5. **Dev-only route.** `/test/audio-recorder` is registered only under `import.meta.env.DEV`. Do not add it to the production router. User-facing access is the "New Note" dialog on `/notes`.
6. **Uncommitted Cornell work sits in the tree.** Any `git add -A` would sweep Cornell files into a commit. **Every commit command below lists explicit paths.** Never use `git add -A` / `git add .`.

---

## Architecture / proposed approach

Extract pure, testable logic out of the 632-line component into sibling `.ts` modules (duration formatting, MIME/capability selection, plan-limit resolution, live size estimation, waveform peaks), keep `in-browser-recorder.tsx` as a thin UI shell, then wire the real limits and peaks from the dialog. Each behavioural change gets a Deno unit test first (RED → GREEN) plus a Playwright assertion, and the whole suite is committed as small, path-explicit commits. Deployment is a separate approval-gated step at the end.

---

## Task 1: Extract recorder constants/utilities into a testable `.ts` module

**Objective:** Move pure logic out of the `.tsx` so Deno can unit-test it.

**Files:**
- Create: `dashboard/src/components/dashboard/recorder-limits.ts`
- Modify: `dashboard/src/components/dashboard/in-browser-recorder.tsx`
- Test: `tests/unit/recorder-limits.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/recorder-limits.test.ts`:

```typescript
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
  // 1 KB/s, 1 MB recorded, 45 MB cap -> 45056 seconds of headroom
  assertEquals(secondsUntilCap(1024 * 1024, 1024, MAX_AUDIO_BYTES), 45056);
});
```

**Step 2: Run to verify failure**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
npx deno test --allow-read --allow-env tests/unit/recorder-limits.test.ts
```

Expected: FAIL — `error: Module not found "…/recorder-limits.ts"`.

**Step 3: Write the implementation**

Create `dashboard/src/components/dashboard/recorder-limits.ts`:

```typescript
/**
 * Pure helpers for the in-browser recorder.
 * Kept free of React and DOM APIs so Deno can unit-test it directly
 * (mirrors the pattern used by cornell-note-draft.ts).
 */

/** Supabase Free-tier Storage hard ceiling, shared by every plan. */
export const MAX_AUDIO_BYTES = 45 * 1024 * 1024; // 45 MB

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
```

**Step 4: Run to verify pass**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
npx deno test --allow-read --allow-env tests/unit/recorder-limits.test.ts
```

Expected: `ok | 10 passed | 0 failed`.

**Step 5: Refactor the component to consume the module (no behaviour change)**

In `dashboard/src/components/dashboard/in-browser-recorder.tsx`, delete the local `formatDuration`, `formatBytes`, and `getSupportedMimeType` (lines 40-77). Replace the import block at lines 15-19 with:

```typescript
import {
  MAX_AUDIO_BYTES,
  MIN_RECORDING_SECONDS,
  estimateBytesPerSecond,
  formatBytes,
  formatDuration,
  maxDurationForPlan,
  pickRecorderMime,
  secondsUntilCap,
} from "./recorder-limits";
```

Fix the one call site that used the deleted function (line 115):

```typescript
    setMimeConfig(pickRecorderMime((t) => MediaRecorder.isTypeSupported(t)));
```

Leave `mimeConfig.mimeType` usages elsewhere untouched — the shape is identical.

**Step 6: Verify**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn\dashboard"
npx tsc --noEmit
```

Expected: no output, exit code 0.

**Step 7: Commit**

```bash
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
git add tests/unit/recorder-limits.test.ts dashboard/src/components/dashboard/recorder-limits.ts dashboard/src/components/dashboard/in-browser-recorder.tsx
git commit -m "refactor(dashboard): extract pure recorder helpers for unit testing"
```

> Confirm with `git log --oneline -1`. Do NOT push. Do not proceed to Task 2 until this commit exists.

---

## Task 2: Wire plan-aware duration limit into the dialog

**Objective:** Pro/Alpha users get a 2-hour recorder cap; Free stays at 30 minutes.

**Files:**
- Modify: `dashboard/src/components/dashboard/upload-audio-dialog.tsx` (import at line 15, JSX at line 740)
- Modify: `dashboard/tests/browser/recorder-flow.spec.ts`

**Step 1: Write the failing Playwright assertion**

Append to `dashboard/tests/browser/recorder-flow.spec.ts`:

```typescript
test("idle state states the plan duration ceiling", async ({ page }) => {
  await page.goto("/test/audio-recorder");
  await expect(page.getByText(/Maksimal \d+ menit per sesi/)).toBeVisible();
});
```

(The harness page uses the recorder's default `maxDurationSeconds = 1800`, so the expected text is `Maksimal 30 menit per sesi`.)

**Step 2: Run to verify failure**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn\dashboard"
npx playwright test --config playwright.recorder.config.ts -g "plan duration ceiling"
```

Expected: FAIL — no element matching `/Maksimal \d+ menit per sesi/`.
(Reason: the harness page does not pass `maxDurationSeconds`, so the hint text at `in-browser-recorder.tsx:410` is absent. This proves the assertion bites once the prop is wired.)

**Step 3: Wire the limit from the dialog**

In `dashboard/src/components/dashboard/upload-audio-dialog.tsx`, add after line 15:

```typescript
import { maxDurationForPlan } from "./recorder-limits";
```

Edit the `<InBrowserRecorder ... />` JSX at line 740 to add one prop:

```tsx
              <InBrowserRecorder
                templates={DEFAULT_TEMPLATES.audio}
                defaultTemplateKey={fileTemplateKey}
                maxDurationSeconds={maxDurationForPlan(profile?.plan_key)}
                onAudioReady={(file, duration, templateKey) => {
```

**Step 4: Verify**

```
npx tsc --noEmit
npx playwright test --config playwright.recorder.config.ts -g "plan duration ceiling"
```

Expected: no output from `tsc` (exit 0) and `1 passed`.

**Step 5: Commit**

```bash
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
git add dashboard/src/components/dashboard/upload-audio-dialog.tsx dashboard/tests/browser/recorder-flow.spec.ts
git commit -m "feat(dashboard): pass plan-aware duration ceiling to the recorder"
```

---

## Task 3: Auto-stop recording before it exceeds the 45 MB upload ceiling

**Objective:** Stop and warn at ~10 seconds before the blob outgrows the Supabase cap.

**Files:**
- Modify: `dashboard/src/components/dashboard/in-browser-recorder.tsx` (state near line 101, `ondataavailable` line 229-233, new effect after line 90, reset in `startRecording` line 250 and `cancelRecording` line 322)

**Step 1: Confirm the RED for `secondsUntilCap`**

The Task 1 test file already contains three `secondsUntilCap` tests. They were written together with the implementation, so verify they genuinely pass rather than assuming:

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
npx deno test --allow-read --allow-env tests/unit/recorder-limits.test.ts
```

Expected: `ok | 10 passed | 0 failed`. If `secondsUntilCap` is missing, add `export` to it in `recorder-limits.ts` and re-run.

**Step 2: Add live-byte state**

Near line 101 (after the existing `useState` calls):

```typescript
  const [liveBytes, setLiveBytes] = useState(0);
```

**Step 3: Accumulate bytes as chunks arrive**

Replace `recorder.ondataavailable` (lines 229-233) with:

```typescript
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          setLiveBytes((prev) => prev + event.data.size);
        }
      };
```

**Step 4: Add the watchdog effect**

Insert after the `maxDurationSeconds` default (after line 90):

```typescript
  // Hard stop before the blob outgrows the Supabase 45 MB ceiling.
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    if (duration < 5) return; // need a stable byte-rate sample
    const left = secondsUntilCap(liveBytes, duration, MAX_AUDIO_BYTES);
    if (left !== null && left <= 10) {
      stopRecording();
      setError(
        "Rekaman dihentikan otomatis karena mendekati batas 45 MB. Sisakan sesi lebih pendek atau turunkan bitrate mikrofon.",
      );
    }
  }, [liveBytes, duration, state, stopRecording]);
```

**Step 5: Reset the counter**

In `startRecording`, immediately after `setDuration(0)` (line 250):

```typescript
      setLiveBytes(0);
```

In `cancelRecording`, immediately after `setDuration(0)` (line 322):

```typescript
    setLiveBytes(0);
```

**Step 6: Verify**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
npx deno test --allow-read --allow-env tests/unit/recorder-limits.test.ts
cd dashboard
npx tsc --noEmit
npx playwright test --config playwright.recorder.config.ts
```

Expected: `ok | 10 passed | 0 failed`, no `tsc` output, `2 passed`.

**Step 7: Commit**

```bash
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
git add dashboard/src/components/dashboard/in-browser-recorder.tsx
git commit -m "feat(dashboard): auto-stop recording before the 45 MB ceiling"
```

---

## Task 4: Feed real waveform peaks into the VoiceNote player

**Objective:** Replace `VoiceNote`'s synthetic waveform with peaks decoded from the actual recording.

**Files:**
- Create: `dashboard/src/components/dashboard/recorder-waveform.ts`
- Modify: `dashboard/src/components/dashboard/in-browser-recorder.tsx` (import line 15, state near line 101, `recorder.onstop` lines 235-246, `cancelRecording` reset, `<VoiceNote />` call ~line 561)
- Test: `tests/unit/recorder-waveform.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/recorder-waveform.test.ts`:

```typescript
import { assertEquals } from "@std/assert";
import {
  BUCKETS,
  downsampleToBuckets,
  normaliseBuckets,
} from "../../dashboard/src/components/dashboard/recorder-waveform.ts";

Deno.test("downsampleToBuckets returns exactly BUCKETS values", () => {
  const channel = new Float32Array(1000).fill(0.5);
  assertEquals(downsampleToBuckets(channel, BUCKETS).length, BUCKETS);
});

Deno.test("downsampleToBuckets takes the peak amplitude of each bucket", () => {
  const channel = new Float32Array(8);
  channel[0] = 0.1;
  channel[1] = 0.9; // peak of bucket 0
  channel[4] = 0.3; // peak of bucket 1
  const [first, second] = downsampleToBuckets(channel, 2);
  assertEquals(first, 0.9);
  assertEquals(second, 0.3);
});

Deno.test("downsampleToBuckets zero-pads when the channel is shorter than BUCKETS", () => {
  const channel = new Float32Array(3).fill(1);
  const buckets = downsampleToBuckets(channel, 40);
  assertEquals(buckets.length, 40);
  assertEquals(buckets[0], 1);
  assertEquals(buckets[39], 0);
});

Deno.test("normaliseBuckets clamps to 0..1 and lifts silence to the floor", () => {
  const normalised = normaliseBuckets([0, 0.25, 0.5, 0.75, 1]);
  assertEquals(normalised[0]! >= 0.14, true); // MIN_AMPLITUDE floor
  assertEquals(normalised.at(-1), 1);
});

Deno.test("normaliseBuckets scales a quiet clip to full scale", () => {
  const normalised = normaliseBuckets([0.01, 0.02]);
  assertEquals(normalised.at(-1), 1);
});

Deno.test("normaliseBuckets returns a flat floor for an all-silent clip", () => {
  const normalised = normaliseBuckets([0, 0, 0]);
  assertEquals(normalised.every((v) => v === 0.14), true);
});
```

**Step 2: Run to verify failure**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
npx deno test --allow-read --allow-env tests/unit/recorder-waveform.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `dashboard/src/components/dashboard/recorder-waveform.ts`:

```typescript
/**
 * Waveform peak extraction for the recorded blob.
 * `decodeAudioData` needs a browser AudioContext, so the async entry point
 * lives in the component; everything here is pure and Deno-testable.
 */

/** VoiceNote renders 40 bars by default; keep them aligned. */
export const BUCKETS = 40;

/** Matches VoiceNote's own MIN_AMPLITUDE so silence still shows a nub. */
export const MIN_AMPLITUDE = 0.14;

/** Peak amplitude of each equal-width bucket. */
export function downsampleToBuckets(
  channel: Float32Array,
  buckets: number = BUCKETS,
): number[] {
  if (channel.length === 0) return new Array<number>(buckets).fill(0);
  const size = channel.length / buckets;
  const out: number[] = [];
  for (let b = 0; b < buckets; b += 1) {
    const start = Math.floor(b * size);
    const end = Math.max(start + 1, Math.floor((b + 1) * size));
    let peak = 0;
    for (let i = start; i < end && i < channel.length; i += 1) {
      const value = Math.abs(channel[i] ?? 0);
      if (value > peak) peak = value;
    }
    out.push(peak);
  }
  return out;
}

/** Scale the loudest bucket to 1.0, then clamp and floor every bucket. */
export function normaliseBuckets(peaks: number[]): number[] {
  const max = peaks.reduce((m, v) => (v > m ? v : m), 0);
  if (max <= 0) return peaks.map(() => MIN_AMPLITUDE);
  return peaks.map((v) => Math.min(1, Math.max(MIN_AMPLITUDE, v / max)));
}
```

Then in `in-browser-recorder.tsx`, add the browser-side decoder below the imports:

```typescript
/**
 * Decode the recorded blob into normalised peak buckets for VoiceNote.
 * Falls back to null so the player keeps its synthetic waveform.
 */
async function decodeWaveformPeaks(blob: Blob): Promise<number[] | null> {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    return null;
  }
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();
    const channel = audioBuffer.getChannelData(0);
    return normaliseBuckets(downsampleToBuckets(channel, BUCKETS));
  } catch {
    return null;
  }
}
```

Add the import at line 15 area:

```typescript
import { BUCKETS, downsampleToBuckets, normaliseBuckets } from "./recorder-waveform";
```

Add state near line 101:

```typescript
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
```

Make `recorder.onstop` async and decode after building the blob (lines 235-246):

```typescript
      recorder.onstop = async () => {
        stopTracks();
        stopVisualizer();

        const blobType = mimeConfig.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        setAudioBlob(blob);

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("review");

        setWaveformPeaks(await decodeWaveformPeaks(blob));
      };
```

Reset in `cancelRecording`, next to `setLiveBytes(0)`:

```typescript
    setWaveformPeaks(null);
```

Pass the peaks to the player (the `<VoiceNote ... />` block, ~line 561):

```tsx
            <VoiceNote
              src={audioUrl || undefined}
              duration={duration}
              waveform={waveformPeaks ?? undefined}
              size="md"
              accent="#f97316"
              className="w-full max-w-lg shadow-sm"
            />
```

**Step 4: Verify**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
npx deno test --allow-read --allow-env tests/unit/recorder-waveform.test.ts
cd dashboard
npx tsc --noEmit
npx playwright test --config playwright.recorder.config.ts
```

Expected: `ok | 6 passed | 0 failed`, no `tsc` output, `2 passed`.

> If the Playwright run fails in the review state, check whether `decodeAudioData` throws on the fake-device WebM. The `catch` returns `null`, which falls back to the synthetic waveform — acceptable. Note the fallback in the commit message.

**Step 5: Commit**

```bash
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
git add tests/unit/recorder-waveform.test.ts dashboard/src/components/dashboard/recorder-waveform.ts dashboard/src/components/dashboard/in-browser-recorder.tsx
git commit -m "feat(dashboard): render real decoded waveform in the voice-note player"
```

---

## Task 5: Turn the screenshot spec into a real lifecycle regression test

**Objective:** Assert the full recorder lifecycle instead of only capturing images.

**Files:**
- Modify: `dashboard/tests/browser/recorder-flow.spec.ts`

**Step 1: Replace the spec contents with the version below**

```typescript
import { test, expect } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["microphone"],
});

test("recorder moves idle -> recording -> paused -> recording -> review", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/test/audio-recorder");

  // IDLE
  await expect(page.getByRole("heading", { name: "Rekam Suara Langsung" })).toBeVisible();
  await expect(page.getByText(/Maksimal \d+ menit per sesi/)).toBeVisible();
  await page.screenshot({ path: "C:/Users/arkad/recorder-idle.png", fullPage: false });

  // -> RECORDING
  await page.getByRole("button", { name: "Mulai Rekam" }).click();
  await expect(page.getByText("Mendengarkan")).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Selesai" })).toBeVisible();
  await page.screenshot({ path: "C:/Users/arkad/recorder-active.png", fullPage: false });

  // -> PAUSED
  await page.getByRole("button", { name: "Jeda rekaman" }).click();
  await expect(page.getByText("Dijeda")).toBeVisible();

  // -> RECORDING
  await page.getByRole("button", { name: "Lanjutkan rekaman" }).click();
  await expect(page.getByText("Mendengarkan")).toBeVisible();

  // -> REVIEW
  await page.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByRole("heading", { name: "Hasil Rekaman" })).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: "C:/Users/arkad/recorder-review.png", fullPage: false });

  // VoiceNote owns playback in the review state
  const player = page.locator('[data-slot="voice-note-control"]').first();
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute("aria-label", "Play voice message");

  // Submitting hands the blob back to the host page
  await page.getByRole("button", { name: "Buat Catatan AI" }).click();
  await expect(page.getByText("Callback Frontend Berhasil Menerima Audio")).toBeVisible();
  await page.screenshot({ path: "C:/Users/arkad/recorder-submitted.png", fullPage: false });
});

test("discarding a recording returns to the idle state", async ({ page }) => {
  await page.goto("/test/audio-recorder");
  await page.getByRole("button", { name: "Mulai Rekam" }).click();
  await expect(page.getByRole("button", { name: "Selesai" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByRole("heading", { name: "Hasil Rekaman" })).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: "Rekam Ulang" }).click();
  await expect(page.getByRole("heading", { name: "Rekam Suara Langsung" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mulai Rekam" })).toBeEnabled();
});
```

**Step 2: Run to verify pass**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn\dashboard"
npx playwright test --config playwright.recorder.config.ts
```

Expected: `2 passed`.

**Step 3: Type-check and lint the touched files**

```
npx tsc --noEmit
npx eslint src/components/dashboard/in-browser-recorder.tsx src/components/dashboard/recorder-limits.ts src/components/dashboard/recorder-waveform.ts
```

Expected: no output, exit 0 for both.

**Step 4: Commit**

```bash
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
git add dashboard/tests/browser/recorder-flow.spec.ts
git commit -m "test(dashboard): assert the full recorder lifecycle in Playwright"
```

---

## Task 6: Run the whole suite before asking to deploy

**Objective:** Prove nothing regressed before any approval-gated deployment.

**Files:** none (verification only).

**Step 1: Deno suite (repo root)**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn"
npx deno task check
npx deno task test
```

Expected: type-check with no errors, then the full count with `0 failed`. Baseline was 732 passing; Tasks 1 and 4 add 16 tests, so expect 748+ passing.

**Step 2: Dashboard build**

```
cd "C:\Users\arkad\Documents\WEB DEV\notinn\dashboard"
npm run build:test
```

Expected: build completes, `dist/` and `dist-ssr/` written, exit 0.

**Step 3: Browser suite against the production preview**

```
npx playwright test
```

Expected: all landing/routing tests pass across the six projects (chromium, firefox, webkit, mobile-chromium, mobile-webkit, no-js).

**Step 4: Report and stop**

State the exact pass counts to the user. Do NOT run `git push`, `supabase functions deploy`, or `vercel`. Ask for explicit approval before any of those three commands.

---

## Test targets summary

| Command | Working dir | Purpose |
|---|---|---|
| `npx deno test --allow-read --allow-env tests/unit/recorder-limits.test.ts` | repo root | pure helper logic |
| `npx deno test --allow-read --allow-env tests/unit/recorder-waveform.test.ts` | repo root | waveform maths |
| `npx deno task check` | repo root | Deno type-check |
| `npx deno task test` | repo root | full backend suite |
| `npx tsc --noEmit` | `dashboard/` | dashboard type-check |
| `npx playwright test --config playwright.recorder.config.ts` | `dashboard/` | recorder flow |
| `npm run build:test` then `npx playwright test` | `dashboard/` | production build + full browser suite |

## Files touched (complete list)

| File | Tasks |
|---|---|
| `dashboard/src/components/dashboard/recorder-limits.ts` | 1 (create) |
| `dashboard/src/components/dashboard/recorder-waveform.ts` | 4 (create) |
| `dashboard/src/components/dashboard/in-browser-recorder.tsx` | 1, 3, 4 |
| `dashboard/src/components/dashboard/upload-audio-dialog.tsx` | 2 |
| `dashboard/tests/browser/recorder-flow.spec.ts` | 2, 5 |
| `tests/unit/recorder-limits.test.ts` | 1, 3 (create) |
| `tests/unit/recorder-waveform.test.ts` | 4 (create) |

Not touched: anything matching `cornell-*`, `supabase/`, `deno.json`, any migration, `dashboard/src/lib/utils.ts`.

## Open questions for the user

1. **Deployment gate** — after Task 6 passes: (a) review the diff locally then push yourself, (b) have me push and let Vercel auto-deploy, or (c) hold on `main` and open a PR branch for review?
2. **45 MB auto-stop copy** (Task 3) — happy with the Indonesian message, or want it to offer "rekam ulang"?
3. **VoiceNote accent colour** — currently hard-coded `#f97316`. Should it follow the theme's `--primary` instead?
4. **Waveform fallback** — if `decodeAudioData` fails (likely Safari), the synthetic waveform stays silently. Acceptable, or want a visible "waveform unavailable" hint?
5. **UI polish** — you said you'd polish the UI later. Should Tasks 1-6 land first as-is, or hold Task 4 (waveform) until after your visual pass?
