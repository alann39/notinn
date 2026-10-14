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
  assertEquals(normalised.every((v: number) => v === 0.14), true);
});
