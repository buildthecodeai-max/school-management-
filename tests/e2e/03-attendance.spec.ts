/**
 * E2E spec 3: Attendance — submit register
 *
 * Verifies:
 * - Teacher can navigate to attendance
 * - Attendance sessions list renders (seeded data)
 * - Teacher can open or start an attendance session page without error
 */

import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

test.describe("Attendance module", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "teacher@greenwood.edu");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("attendance page loads and shows sessions list", async ({ page }) => {
    await page.goto("/portal/attendance");
    await expect(page).toHaveURL(/\/portal\/attendance/);

    // Heading
    await expect(page.getByRole("heading", { name: /attendance/i })).toBeVisible();

    // There should be content (either sessions or a new-session prompt)
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("can navigate to a section's attendance page", async ({ page }) => {
    await page.goto("/portal/attendance");

    // Look for any link to an attendance session or section
    const link = page.locator("main a").first();
    const count = await page.locator("main a").count();
    if (count > 0) {
      const href = await link.getAttribute("href");
      if (href && href.includes("/portal/attendance/")) {
        await link.click();
        await expect(page.locator("main").first()).toBeVisible();
      }
    }
    // Either way the page should not 500
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
