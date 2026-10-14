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
  if (channel.length <= buckets) {
    const out = new Array<number>(buckets).fill(0);
    for (let i = 0; i < channel.length; i += 1) {
      out[i] = Math.round(Math.abs(channel[i] ?? 0) * 1000) / 1000;
    }
    return out;
  }
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
    out.push(Math.round(peak * 1000) / 1000);
  }
  return out;
}

/** Scale the loudest bucket to 1.0, then clamp and floor every bucket. */
export function normaliseBuckets(peaks: number[]): number[] {
  const max = peaks.reduce((m, v) => (v > m ? v : m), 0);
  if (max <= 0) return peaks.map(() => MIN_AMPLITUDE);
  return peaks.map((v) => {
    const scaled = Math.round((v / max) * 1000) / 1000;
    return Math.min(1, Math.max(MIN_AMPLITUDE, scaled));
  });
}
