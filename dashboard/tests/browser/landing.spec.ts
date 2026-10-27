import { expect, test } from "@playwright/test";

const TELEGRAM_URL = "https://t.me/NotinnBot";

const DOCK_TARGETS: readonly (readonly [string, string])[] = [
  ["Capture", "capture"],
  ["Structure", "how-it-works"],
  ["Retrieve", "dashboard"],
  ["Tags", "tags"],
  ["FAQ", "faq"],
];

test("public landing keeps public and protected contracts", async ({ page }) => {
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveAccessibleName("Notes that write themselves.");
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.locator(`a[href='${TELEGRAM_URL}']`).first()).toHaveAttribute(
    "href",
    TELEGRAM_URL,
  );
  await expect(page.locator("footer a[href='/privacy']")).toBeVisible();
  await expect(page.locator("footer a[href='/terms']")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("dock anchors reach and focus every target", async ({ page }) => {
  // Five click → scroll → focus cycles; Firefox/WebKit need headroom when all
  // five projects run in parallel.
  test.setTimeout(60_000);
  await page.goto("/");
  const dock = page.getByRole("navigation", { name: "Landing sections" });

  for (const [label, id] of DOCK_TARGETS) {
    const target = page.locator(`#${id}`);
    await expect(dock.getByRole("link", { name: label })).toHaveAttribute("href", `#${id}`);
    await expect(target).toHaveCount(1);
    await expect(target).toHaveAttribute("tabindex", "-1");

    await dock.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(target).toBeFocused();
  }
});

test("closing CTA and footer carry the end-of-page content", async ({ page }) => {
  await page.goto("/");
  const cta = page.getByRole("region", { name: "Ready to begin?" });
  await expect(cta.getByRole("heading", { level: 2 })).toHaveText("Ready to begin?");
  await expect(cta.getByRole("link", { name: "Open in Telegram" })).toHaveAttribute(
    "href",
    TELEGRAM_URL,
  );
  await expect(cta.getByRole("link", { name: "Web Dashboard" })).toHaveAttribute(
    "href",
    "/notes",
  );
  for (const point of ["No app install", "No credit card", "Cancel anytime"]) {
    await expect(cta.getByText(point)).toBeVisible();
  }

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("heading", { name: "Questions? Talk to a human." })).toBeVisible();
  await expect(footer.getByRole("link", { name: "contact@alann.works" })).toHaveAttribute(
    "href",
    "mailto:contact@alann.works",
  );
  const footerLinks = footer.getByRole("navigation", { name: "Footer" }).getByRole("link");
  await expect(footerLinks).toHaveCount(5);
  await expect(footer.getByText("© 2026 NOTINN · KNOWLEDGE INBOX ON TELEGRAM")).toBeVisible();
});

test("landing metadata remains truthful", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(
    "Notinn | Turn messages and documents into tidy notes",
  );
  const jsonLd = await page.locator('script[type="application/ld+json"]')
    .first().textContent();
  expect(jsonLd ?? "").toContain("ProductivityApplication");
  expect(jsonLd ?? "").not.toMatch(/aggregateRating|review|offers/i);
});

test("landing has no horizontal overflow at desktop and phone widths", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `viewport ${width}`).toBeLessThanOrEqual(1);
  }
});
