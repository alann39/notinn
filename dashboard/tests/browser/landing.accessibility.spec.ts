import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing has no critical accessibility violations", async ({ page }) => {
  // Full-page axe analysis in the slowest engine needs budget: the hero now
  // streams multi-MB video while the analysis runs.
  test.setTimeout(90_000);
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual(
    [],
  );

  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator(".skip-link").first()).toBeAttached();
  const positiveTabindex = await page.locator("[tabindex]:not([tabindex='-1']):not([tabindex='0'])").count();
  expect(positiveTabindex).toBe(0);
});

test("landing stays usable at the smallest supported width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
