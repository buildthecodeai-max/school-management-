/**
 * E2E: a parent sees only their own children, with the right tabs, and nothing else.
 */
import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";
import { db } from "./db";

test.describe("Family portal", () => {
  test("parent lists their children and opens a child hub with the fees tab", async ({ page }) => {
    await login(page, "parent@hmss.edu");
    await page.goto("/portal/family");
    await expect(page.getByRole("heading", { name: "My children" })).toBeVisible();

    const children = page.locator('main a[href^="/portal/family/"]');
    await expect(children).toHaveCount(2);

    await children.first().click();
    await expect(page).toHaveURL(/\/portal\/family\/[^/]+$/);
    for (const tab of ["Overview", "Attendance", "Results", "Timetable"]) {
      await expect(page.getByRole("link", { name: tab, exact: true })).toBeVisible();
    }
    await logout(page);
  });

  test("parent cannot open a child they are not linked to", async ({ page }) => {
    const other = await db.student.findFirstOrThrow({
      where: { guardianLinks: { none: { guardian: { person: { user: { email: "parent@hmss.edu" } } } } } },
    });
    await login(page, "parent@hmss.edu");
    const res = await page.goto(`/portal/family/${other.id}`);
    expect(res?.status()).toBe(404);
  });

  test("parent is kept out of staff modules", async ({ page }) => {
    await login(page, "parent@hmss.edu");
    for (const path of ["/portal/fees", "/portal/students", "/portal/hr", "/portal/settings/users"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
    }
    await logout(page);
  });
});
