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
  await expect(page.getByRole("heading", { name: "Record Audio Directly" })).toBeVisible();
  await expect(page.getByText(/Maximum \d+ minutes per session/)).toBeVisible();
  await page.screenshot({ path: "C:/Users/arkad/recorder-idle.png", fullPage: false });

  // -> RECORDING
  await page.getByRole("button", { name: "Start Recording" }).click();
  await expect(page.getByText("Listening")).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
  await page.screenshot({ path: "C:/Users/arkad/recorder-active.png", fullPage: false });

  // -> PAUSED
  await page.getByRole("button", { name: "Pause recording" }).click();
  await expect(page.getByText("Paused")).toBeVisible();

  // -> RECORDING
  await page.getByRole("button", { name: "Resume recording" }).click();
  await expect(page.getByText("Listening")).toBeVisible();

  // -> REVIEW
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Recorded Audio" })).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: "C:/Users/arkad/recorder-review.png", fullPage: false });

  // VoiceNote owns playback in the review state
  const player = page.locator('[data-slot="voice-note-control"]').first();
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute("aria-label", "Play voice message");

  // Submitting hands the blob back to the host page
  await page.getByRole("button", { name: "Use Recording" }).click();
  await expect(page.getByText("Callback Frontend Berhasil Menerima Audio")).toBeVisible();
  await page.screenshot({ path: "C:/Users/arkad/recorder-submitted.png", fullPage: false });
});

test("discarding a recording returns to the idle state", async ({ page }) => {
  await page.goto("/test/audio-recorder");
  await page.getByRole("button", { name: "Start Recording" }).click();
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Discard recording" }).click();
  await expect(page.getByRole("heading", { name: "Record Audio Directly" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Recording" })).toBeEnabled();

  // Test recording again and using 'Record Again' from review state
  await page.getByRole("button", { name: "Start Recording" }).click();
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Recorded Audio" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Record Again" }).click();
  await expect(page.getByRole("heading", { name: "Record Audio Directly" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Recording" })).toBeEnabled();
});
