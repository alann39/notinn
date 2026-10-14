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
  await page.getByRole("button", { name: "Gunakan Rekaman" }).click();
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
