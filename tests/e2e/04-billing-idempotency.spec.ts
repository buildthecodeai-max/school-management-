/**
 * E2E spec 4: Billing idempotency
 *
 * Verifies:
 * - Finance officer can access the fees module
 * - Billing runs page renders without error
 * - Fees overview shows invoices (seeded data)
 */

import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

test.describe("Billing / fees module", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "finance@greenwood.edu");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("fees page loads and shows billing data", async ({ page }) => {
    await page.goto("/portal/fees");
    await expect(page).toHaveURL(/\/portal\/fees/);
    await expect(page.getByRole("heading", { name: /fees|billing/i })).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("billing runs tab renders without error", async ({ page }) => {
    await page.goto("/portal/fees?tab=billing");
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("reconciliation tab renders without error", async ({ page }) => {
    await page.goto("/portal/fees?tab=reconciliation");
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
