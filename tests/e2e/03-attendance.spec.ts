/**
 * E2E: a teacher takes a register through the UI and it persists.
 */
import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";
import { db } from "./db";

test.describe("Attendance register", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "teacher@hmss.edu");
  });
  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test("teacher marks a student, saves a draft, and the mark is stored", async ({ page }) => {
    await page.goto("/portal/attendance");
    await expect(page.getByRole("heading", { name: /attendance/i }).first()).toBeVisible();

    const sectionLink = page.locator('main a[href^="/portal/attendance/"]:not([href$="/leave"]):not([href$="/reports"]):not([href$="/analytics"])').first();
    await expect(sectionLink).toBeVisible();
    const href = (await sectionLink.getAttribute("href"))!;
    expect(href).toMatch(/\/portal\/attendance\/[^/]+$/);
    await page.goto(href);
    await page.waitForLoadState("networkidle"); // let React hydrate before clicking

    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    const admission = (await rows.first().locator("p").nth(1).innerText()).trim();

    // Mark the first student with the first code button, then save as a draft.
    await rows.first().locator("button").first().click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();

    const student = await db.student.findFirstOrThrow({ where: { admissionNumber: admission } });
    const records = await db.attendanceRecord.findMany({ where: { studentId: student.id } });
    expect(records.length).toBeGreaterThan(0);
  });
});
