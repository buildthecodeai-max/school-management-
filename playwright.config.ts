import { defineConfig, devices } from "@playwright/test";

// PORT env var is set by the launch.json dev server or overridden manually.
// Default to 3000 for CI; locally the dev server picks a free port.
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Require the dev server to already be running (start it with `npm run dev`).
  // Set TEST_BASE_URL=http://localhost:<port> when the dev server uses a non-3000 port.
});
