/**
 * E2E: the school owner manages roles; a campus admin cannot.
 */
import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";
import { db } from "./db";

test.describe("Users and roles", () => {
  test("owner creates a custom role and it is stored", async ({ page }) => {
    await login(page, "owner@hmss.edu");
    await page.goto("/portal/settings/roles");
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
    await page.waitForLoadState("networkidle"); // let React hydrate before submitting

    await page.locator('input[name="name"]').fill("E2E Exam Officer");
    // A role with no permissions is refused: deny by default, but never an empty shell.
    await page.getByRole("button", { name: "Create role" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Choose at least one permission." })).toBeVisible();
    expect(await db.role.count({ where: { name: "E2E Exam Officer" } })).toBe(0);

    await page.getByRole("checkbox", { name: /^campus\.read / }).check();
    await page.getByRole("button", { name: "Create role" }).click();
    await expect(page.getByText('Role "E2E Exam Officer" created.')).toBeVisible();

    const role = await db.role.findFirst({ where: { name: "E2E Exam Officer" } });
    expect(role).not.toBeNull();
    expect(role!.permissions).toEqual(["campus.read"]);
    await logout(page);
  });

  test("owner sees the user directory", async ({ page }) => {
    await login(page, "owner@hmss.edu");
    await page.goto("/portal/settings/users");
    await expect(page.getByText("teacher@hmss.edu")).toBeVisible();
    await logout(page);
  });

  test("campus admin is denied user and role management", async ({ page }) => {
    await login(page, "admin@hmss.edu");
    for (const path of ["/portal/settings/users", "/portal/settings/roles"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/denied=iam\./);
    }
    await expect(page.locator("aside").getByRole("link", { name: "Users & roles" })).toHaveCount(0);
    await logout(page);
  });
});
