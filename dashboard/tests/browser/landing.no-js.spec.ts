import { expect, test } from "@playwright/test";

const TELEGRAM_URL = "https://t.me/NotinnBot";

const DOCK_TARGETS: readonly (readonly [string, string])[] = [
  ["Capture", "capture"],
  ["Structure", "how-it-works"],
  ["Retrieve", "dashboard"],
  ["Tags", "tags"],
  ["FAQ", "faq"],
];

test("landing stays usable without JavaScript", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveAccessibleName("Notes that write themselves.");
  await expect(page.locator(`a[href='${TELEGRAM_URL}']`).first()).toHaveAttribute(
    "href",
    TELEGRAM_URL,
  );
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.locator("footer a[href='/privacy']")).toBeVisible();
  await expect(page.locator("footer a[href='/terms']")).toBeVisible();
});

test("dock links point at sections that exist without JavaScript", async ({ page }) => {
  await page.goto("/");
  const dock = page.getByRole("navigation", { name: "Landing sections" });

  for (const [label, id] of DOCK_TARGETS) {
    await expect(dock.getByRole("link", { name: label })).toHaveAttribute("href", `#${id}`);
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }

  // Hash navigation is native; it must not depend on the client bundle.
  await dock.getByRole("link", { name: "FAQ" }).click();
  await expect(page).toHaveURL(/#faq$/);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("landing has no horizontal overflow at the smallest supported width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
