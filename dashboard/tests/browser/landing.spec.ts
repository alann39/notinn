import { expect, test } from "@playwright/test";

test("public landing keeps public and protected contracts", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  if (!isMobile) {
    await expect(page.getByRole("navigation", { name: "Main navigation" }))
      .toBeVisible();
  }
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.locator("a[href='https://t.me/NotinnBot']").first())
    .toHaveAttribute(
      "href",
      "https://t.me/NotinnBot",
    );
  await expect(page.locator("a[href='/privacy']").first()).toBeVisible();
  await expect(page.locator("a[href='/terms']").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("hero serves a themed local clip and a single usable Telegram CTA", async ({ page }) => {
  await page.goto("/");
  const hero = page.getByRole("region", { name: "Notinn" });
  await expect(hero.getByRole("heading", { level: 1 })).toHaveAccessibleName("Notinn");
  await expect(hero.locator(".prisma-hero-overline")).toContainText("Just say, Noted!");
  await expect(hero.getByText("Closed Alpha")).toHaveCount(0);
  await expect(hero.getByRole("link", { name: "Open Notinn in Telegram" }))
    .toHaveAttribute("href", "https://t.me/NotinnBot");
  const frame = hero.locator(".prisma-hero-frame");
  await expect(frame).toHaveAttribute("data-hero-theme", "light");
  const lightVideo = hero.locator('video[data-theme="light"]');
  const darkVideo = hero.locator('video[data-theme="dark"]');
  await expect(lightVideo).toHaveAttribute("src", "/landing/hero-bg-light.mp4");
  await expect(darkVideo).toHaveAttribute("src", "/landing/hero-bg-dark.mp4");
  await expect(lightVideo).toHaveAttribute("data-active", "true");
  await expect(frame).toHaveCSS("background-color", "rgb(216, 211, 196)");

  const cta = hero.getByRole("link", { name: "Open Notinn in Telegram" });
  await expect(cta).toHaveCSS("font-family", /Newsreader/);
  const padding = await cta.evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: style.paddingLeft, right: style.paddingRight };
  });
  expect(padding.left).toBe(padding.right);

  const toggle = hero.getByRole("switch", { name: "Switch hero background" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(frame).toHaveAttribute("data-hero-theme", "dark");
  await expect(darkVideo).toHaveAttribute("data-active", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(frame).toHaveAttribute("data-hero-theme", "light");
  await expect(lightVideo).toHaveAttribute("data-active", "true");
});

test("reduced motion leaves the solid hero visible and video paused", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const video = page.locator(".prisma-hero-video");
  await expect(video.first()).toBeHidden();
  await expect(page.locator(".prisma-hero-frame")).toHaveCSS(
    "background-color",
    "rgb(216, 211, 196)",
  );
  expect(await video.first().evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(true);
});

test("floating menu sits top-center and tracks section navigation", async ({ page }) => {
  // WebKit device emulation runs this long interaction well past 60s; keep an
  // explicit cap, but sized for the slowest supported engine.
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator(".landing-notch-header")).toHaveCount(0);
  const menu = page.locator('nav[aria-label="Main navigation"]');
  await expect(menu).toHaveCount(1);

  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const closed = await menu.boundingBox();
  expect(closed?.width).toBeCloseTo(150, 0);
  expect(closed?.height).toBeCloseTo(48, 0);
  expect(closed ? closed.x + closed.width / 2 : 0).toBeCloseTo(viewport.width / 2, 0);
  expect(closed?.y ?? 0).toBeCloseTo(28, 0);

  await menu.getByRole("button", { name: "Open menu" }).click();
  const panel = page.locator("#notinn-floating-panel");
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await menu.boundingBox())?.width ?? 0)
    .toBeCloseTo(300, 0);
  await expect.poll(async () => (await menu.boundingBox())?.height ?? 0)
    .toBeCloseTo(360, 0);
  await expect(panel.getByRole("link")).toHaveCount(5);
  await expect(await panel.getByRole("link").evaluateAll(
    (elements) => elements.map((element) => element.getAttribute("href")),
  )).toEqual(["#features", "#how-it-works", "#pricing", "/notes", "https://t.me/NotinnBot"]);
  await expect(panel.getByRole("link", { name: "Open dashboard" }))
    .toHaveAttribute("href", "/notes");
  await expect(panel.getByRole("link", { name: "Open Notinn in Telegram" }))
    .toHaveAttribute("rel", "noopener noreferrer");

  // The toggle morphs the container width, so it never passes Playwright's
  // stability check on the slowest engine; force skips that check only.
  await menu.getByRole("button", { name: "Close menu" }).click({ force: true });
  await expect(panel).toBeHidden();
  await expect.poll(async () => (await menu.boundingBox())?.width ?? 0)
    .toBeCloseTo(150, 0);

  await menu.getByRole("button", { name: "Open menu" }).click({ force: true });
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(menu.getByRole("button", { name: "Open menu" })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  // Above the top-anchored panel: outside on every viewport.
  await page.mouse.click(8, 8);
  await expect(panel).toBeHidden();

  // Top-center pill must not cover the bottom-anchored hero title on load.
  await page.evaluate(() => window.scrollTo(0, 0));
  const pill = await menu.boundingBox();
  const title = await page.locator("h1#landing-title").boundingBox();
  expect(pill && title && pill.y + pill.height <= title.y).toBe(true);
});

test("floating menu works the same on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".landing-notch-header")).toHaveCount(0);
  const menu = page.locator('nav[aria-label="Main navigation"]');
  await expect(menu).toHaveCount(1);

  const phoneViewport = page.viewportSize() ?? { width: 390, height: 844 };
  const closed = await menu.boundingBox();
  expect(closed?.width).toBeCloseTo(150, 0);
  expect(closed?.height).toBeCloseTo(48, 0);
  expect(closed ? closed.x + closed.width / 2 : 0).toBeCloseTo(phoneViewport.width / 2, 0);
  expect(closed?.y ?? 0).toBeCloseTo(28, 0);

  await menu.getByRole("button", { name: "Open menu" }).click();
  const panel = page.locator("#notinn-floating-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link")).toHaveCount(5);
  await expect(panel.getByRole("link", { name: "Open dashboard" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Open Notinn in Telegram" })).toBeVisible();
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

test("marquee runs two tidy English strips", async ({ page }) => {
  await page.goto("/");
  const marquee = page.locator(".landing-marquee");
  await expect(marquee).toBeVisible();
  await expect(marquee).toHaveAttribute("aria-label", "What Notinn handles");
  // Assistive tech gets exactly one copy: the sr-only paragraph.
  await expect(marquee.locator("p.sr-only")).toHaveCount(1);
  await expect(marquee.locator("p.sr-only")).toContainText("Forwarded messages");
  for (const word of ["Text", "Voice notes", "Screenshots", "Documents", "Clean notes"]) {
    await expect(marquee.locator("p.sr-only")).toContainText(word);
  }
  // Two animated strips, hidden from assistive tech; both move via transform.
  const strips = marquee.locator(".landing-marquee-rows > div > div");
  await expect(strips).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const strip = strips.nth(index);
    await expect(strip).toBeVisible();
    const before = await strip.evaluate(
      (element) => element.getBoundingClientRect().x,
    );
    await page.waitForTimeout(600);
    const after = await strip.evaluate(
      (element) => element.getBoundingClientRect().x,
    );
    expect(after).not.toBe(before);
  }
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
});
test("features section displays three interactive demo cards", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section[aria-labelledby='features-heading']");
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  await expect(section.locator("#features-heading")).toHaveText("Features");
  for (const title of [
    "Telegram is the inbox",
    "Notes that keep working",
    "Every format one result",
  ]) {
    await expect(section.getByRole("heading", { name: title })).toBeVisible();
  }
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
});
test("all landing demo sections render in sequence with zero overflow", async ({ page }) => {
  await page.goto("/");

  // 1. Dashboard Showoff
  const showoff = page.locator("section#dashboard-showoff");
  await showoff.scrollIntoViewIfNeeded();
  await expect(showoff).toBeVisible();
  await expect(showoff.locator("#dashboard-showoff-heading")).toBeVisible();

  // 2. Features
  const features = page.locator("section[aria-labelledby='features-heading']");
  await features.scrollIntoViewIfNeeded();
  await expect(features).toBeVisible();

  // 3. How It Works
  const howItWorks = page.locator("section#how-it-works");
  await howItWorks.scrollIntoViewIfNeeded();
  await expect(howItWorks).toBeVisible();
  await expect(howItWorks.locator("#how-it-works-heading")).toHaveText("How it works");
  for (const step of ["Send anything to Notinn", "AI structures it for you", "Search ask export"]) {
    await expect(howItWorks.getByRole("heading", { name: step })).toBeVisible();
  }

  // 4. Comparison
  const comparison = page.locator("section#comparison");
  await comparison.scrollIntoViewIfNeeded();
  await expect(comparison).toBeVisible();
  await expect(comparison.locator("#comparison-03-heading")).toContainText("The same thought, handled two ways");

  // 5. Pricing & FAQ
  const pricing = page.locator("section#pricing");
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing).toBeVisible();
  await expect(pricing.getByText("Business plan")).toBeVisible();
  await expect(pricing.getByText("Frequently asked questions")).toBeVisible();

  // 6. Cinematic Footer
  const footer = page.locator("footer[role='contentinfo']");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  await expect(footer.getByText("Ready to begin?")).toBeVisible();
  // Zero horizontal overflow on the full page
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
});
