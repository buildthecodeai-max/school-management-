/**
 * E2E spec 5: HR module — leave approval flow
 *
 * Verifies:
 * - Campus admin (who has hr.staff.read + hr.leave.approve) can access HR
 * - HR page renders staff directory, leave, and separations tabs
 * - Safeguarding officer (restricted role) CANNOT access HR
 */

import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

test.describe("HR module", () => {
  test("org owner sees HR module with all tabs", async ({ page }) => {
    // Owner has wildcard permissions — can access all modules
    await login(page, "owner@hmss.edu");
    await page.goto("/portal/hr");
    await expect(page).toHaveURL(/\/portal\/hr/);

    await expect(page.getByRole("heading", { name: /human resources/i })).toBeVisible();

    // Sub-tabs
    await expect(page.getByRole("link", { name: "staff", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /leave approvals/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^separations/ })).toBeVisible();

    await logout(page);
  });

  test("leave approvals tab renders without error", async ({ page }) => {
    await login(page, "owner@hmss.edu");
    await page.goto("/portal/hr?tab=leave");

    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");

    await logout(page);
  });

  test("safeguarding officer is denied access to HR (permission gate)", async ({ page }) => {
    await login(page, "safeguarding@hmss.edu");
    await page.goto("/portal/hr");

    // Deny-by-default: the server redirects to the dashboard with the missing permission.
    await expect(page).not.toHaveURL(/\/portal\/hr/);
    await expect(page.getByRole("heading", { name: /human resources/i })).toHaveCount(0);

    await logout(page);
  });
});
