import { expect, test } from "@playwright/test";

test("protected notes route redirects signed-out visitors", async ({ page }) => {
  await page.goto("/notes");
  await expect(page).toHaveURL(/\/login/);
});

test("public legal routes resolve directly with rich UI layout", async ({ page }) => {
  await page.goto("/privacy");

  // Header & Metadata
  await expect(page.locator("#legal-title")).toContainText("Notinn Privacy Policy");
  await expect(page.locator("nav[aria-label='Breadcrumb']")).toBeVisible();
  await expect(page.getByText(/Last updated:/i)).toBeVisible();

  // Quick Summary Card
  const summary = page.locator("section[aria-labelledby='summary-card-heading']");
  await expect(summary).toBeVisible();
  await expect(summary.getByText("Full Ownership")).toBeVisible();
  await expect(summary.getByText("No AI Model Training")).toBeVisible();
  await expect(summary.getByText("Fair Limits & Deletion")).toBeVisible();

  // Table of Contents
  const desktopToc = page.locator("aside[aria-label='Page navigation']");
  await expect(desktopToc).toBeVisible();
  await expect(desktopToc.getByRole("link", { name: /Core Privacy Commitments/i })).toBeVisible();

  // Prose styling & content
  const prose = page.locator("article.landing-legal-body");
  await expect(prose).toBeVisible();
  await expect(prose.locator("table")).toBeVisible();
  await expect(prose).toContainText("45 MB");

  // Switcher tab navigation to Terms
  const termsTab = page.locator("div[role='tablist'] a[href='/terms']");
  await expect(termsTab).toBeVisible();
  await termsTab.click();

  // Verify Terms of Service
  await expect(page).toHaveURL(/\/terms/);
  await expect(page.locator("#legal-title")).toContainText("Notinn Terms of Service");
  await expect(page.locator("article.landing-legal-body")).toContainText("45 MB");
  await expect(page.locator("article.landing-legal-body")).toContainText("Free Starter Plan");
  await expect(page.locator("article.landing-legal-body")).toContainText("Pro Plan");

  // Footer navigation
  const footerNav = page.locator("section[aria-labelledby='legal-footer-nav-title']");
  await expect(footerNav).toBeVisible();
  await expect(footerNav.getByRole("link", { name: /Go to Dashboard/i })).toHaveAttribute("href", "/notes");

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
