import { defineConfig, devices } from "@playwright/test";

// The suite never touches the development database. globalSetup rebuilds the
// disposable `sms_e2e` database (migrations + seed) and the web server below is
// started against it on its own port.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://sms:sms_dev_password@localhost:5433/sms_e2e?schema=public";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1, // specs share one seeded database and mutate it
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DATABASE_URL },
  },
});
