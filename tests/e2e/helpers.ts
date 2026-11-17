import type { Page } from "@playwright/test";

export async function login(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  // Wait for React hydration so the server action is wired up
  await page.waitForSelector("#email", { state: "visible" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  // Fire submit and wait for the resulting navigation together
  await Promise.all([
    page.waitForURL(/\/portal/, { timeout: 30_000 }),
    page.locator('input[name="password"]').press("Enter"),
  ]);
}

export async function logout(page: Page) {
  await Promise.all([
    page.waitForURL(/\/login/, { timeout: 10_000 }),
    page.getByRole("button", { name: /sign out/i }).click(),
  ]);
}
