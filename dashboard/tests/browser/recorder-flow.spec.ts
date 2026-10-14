import { test, expect } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["microphone"],
});

test("capture recording and review states with virtual mic", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/test/audio-recorder");

  // Capture idle state with ThinkingOrb
  await page.waitForTimeout(600);
  await page.screenshot({ path: "C:/Users/arkad/recorder-idle.png", fullPage: false });

  // Click Mulai Rekam
  const startBtn = page.getByRole("button", { name: "Mulai Rekam" });
  await startBtn.click();

  // Wait 1.5s while recording to capture the recording active state
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "C:/Users/arkad/recorder-active.png", fullPage: false });

  // Click Selesai
  const stopBtn = page.getByRole("button", { name: "Selesai" });
  await expect(stopBtn).toBeVisible({ timeout: 5000 });
  await stopBtn.click();

  // Wait for review state to render
  await expect(page.getByRole("heading", { name: "Hasil Rekaman" })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(400);

  // Capture review state
  await page.screenshot({ path: "C:/Users/arkad/recorder-review.png", fullPage: false });

  // Click Buat Catatan AI to test frontend callback
  await page.getByRole("button", { name: "Buat Catatan AI" }).click();
  await expect(page.getByText("Callback Frontend Berhasil Menerima Audio")).toBeVisible();
  await page.screenshot({ path: "C:/Users/arkad/recorder-submitted.png", fullPage: false });
});

test("idle state states the plan duration ceiling", async ({ page }) => {
  await page.goto("/test/audio-recorder");
  await expect(page.getByText(/Maksimal \d+ menit per sesi/)).toBeVisible();
});
