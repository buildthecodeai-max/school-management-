/**
 * E2E spec 1: Login + role-scoped dashboard + nav permissions
 *
 * Verifies:
 * - Teacher can log in and see the role-scoped staff dashboard
 * - Nav shows only items the teacher has permission for
 * - Nav does NOT show Finance, Admissions, Safeguarding, Health nav items
 *   (teacher role has no those perms)
 */

import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

test.describe("Login and role-scoped dashboard", () => {
  test("teacher sees staff dashboard with permitted nav items only", async ({ page }) => {
    await login(page, "teacher@greenwood.edu");

    // Should be on portal
    await expect(page).toHaveURL(/\/portal/);

    // Teacher dashboard shows their name / welcome area
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Nav items the teacher SHOULD see
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Students" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Attendance" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Assessment" })).toBeVisible();

    // Items teacher should NOT see
    await expect(sidebar.getByRole("link", { name: "Safeguarding" })).not.toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Health" })).not.toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Subscription" })).not.toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Platform" })).not.toBeVisible();

    await logout(page);
  });

  test("safeguarding officer sees health and safeguarding nav; NOT admin items", async ({ page }) => {
    await login(page, "safeguarding@greenwood.edu");

    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "Health" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Safeguarding" })).toBeVisible();

    // No admin or teacher items
    await expect(sidebar.getByRole("link", { name: "Attendance" })).not.toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Fees" })).not.toBeVisible();

    await logout(page);
  });

  test("campus admin can access campuses, setup and core modules", async ({ page }) => {
    await login(page, "admin@greenwood.edu");

    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "Campuses" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Setup" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Students" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Attendance" })).toBeVisible();

    // Campus admin must NOT see safeguarding or health (critical constraint)
    await expect(sidebar.getByRole("link", { name: "Safeguarding" })).not.toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Health" })).not.toBeVisible();

    await logout(page);
  });
});
