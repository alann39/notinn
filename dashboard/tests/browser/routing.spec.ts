import { expect, test } from "@playwright/test";

test("protected notes route redirects signed-out visitors", async ({ page }) => {
  await page.goto("/notes");
  await expect(page).toHaveURL(/\/login/);
});

test("public legal routes resolve directly", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.locator("#legal-title")).toContainText("Notinn privacy notice");
  await page.goto("/terms");
  await expect(page.locator("#legal-title")).toContainText("Notinn Closed Alpha terms");
  await page.goto("/login");
  await expect(page.locator("h1")).toContainText("Notinn");
});

test("public sitemap contains only public routes", async ({ page }) => {
  const response = await page.request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("<loc>http://127.0.0.1:4173/</loc>");
  expect(body).toContain("<loc>http://127.0.0.1:4173/privacy</loc>");
  expect(body).toContain("<loc>http://127.0.0.1:4173/terms</loc>");
  expect(body).not.toContain("/notes");
  expect(body).not.toContain("/login");
  expect(body).not.toContain("/admin");
});
