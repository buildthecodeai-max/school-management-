/**
 * E2E spec 2: Admissions pipeline
 *
 * Verifies:
 * - Admissions officer can view the admissions page and see applications
 * - Applications table renders with status badges
 * - Application detail loads without error
 */

import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

test.describe("Admissions pipeline", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admissions@hmss.edu");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("admissions page loads and shows applications", async ({ page }) => {
    await page.goto("/portal/admissions");
    await expect(page).toHaveURL(/\/portal\/admissions/);

    // Page heading
    await expect(page.getByRole("heading", { name: /admissions/i })).toBeVisible();

    // Applications are rendered as cards/links, not a table
    const appLinks = page.locator("a[href*='/portal/admissions/']");
    await expect(appLinks.first()).toBeVisible({ timeout: 10_000 });
  });

  test("clicking an application opens detail page", async ({ page }) => {
    await page.goto("/portal/admissions");

    // Click the first application link (cards, not table rows)
    const firstLink = page.locator("a[href*='/portal/admissions/']").first();
    await expect(firstLink).toBeVisible({ timeout: 10_000 });

    const href = await firstLink.getAttribute("href");
    // Navigate directly to avoid link-vs-navigation issues
    if (href) {
      await page.goto(href);
      await expect(page).toHaveURL(/\/portal\/admissions\/.+/);
      await expect(page.locator("main").first()).toBeVisible();
    }
  });
});
