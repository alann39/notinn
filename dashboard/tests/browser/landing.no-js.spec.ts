import { expect, test } from "@playwright/test";

test("landing remains useful without JavaScript", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveAccessibleName("Notinn");
  await expect(page.locator(".prisma-hero-tagline")).toContainText(
    "usable notes",
  );
  await expect(page.getByRole("region", { name: "Notinn" }).getByRole("link", {
    name: "Open Notinn in Telegram",
  })).toHaveAttribute("href", "https://t.me/NotinnBot");
  await expect(page.locator(".prisma-hero-frame")).toHaveCSS(
    "background-color",
    "rgb(216, 211, 196)",
  );
  await expect(page.locator("a[href='/privacy']").first()).toBeVisible();

  const fallback = page.locator("#notinn-floating-noscript");
  await expect(fallback).toBeVisible();
  expect((await fallback.boundingBox())?.y ?? 999).toBeLessThan(100);
});

test("noscript menu links reach all five destinations", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const fallback = page.locator("#notinn-floating-noscript");
  await expect(fallback.getByRole("link", { name: "Features" }))
    .toHaveAttribute("href", "#features");
  await expect(fallback.getByRole("link", { name: "How it works" }))
    .toHaveAttribute("href", "#how-it-works");
  await expect(fallback.getByRole("link", { name: "Pricing" }))
    .toHaveAttribute("href", "#pricing");
  await expect(fallback.getByRole("link", { name: "Open dashboard" }))
    .toHaveAttribute("href", "/notes");
  await expect(fallback.getByRole("link", { name: "Open Notinn in Telegram" }))
    .toHaveAttribute("href", "https://t.me/NotinnBot");
  await expect(page.locator("footer a[href='/privacy']")).toBeVisible();
  await expect(page.locator("footer a[href='/terms']")).toBeVisible();
});
