import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests share one real Postgres and one Prisma client, and each
// suite creates/deletes `itest_`-prefixed tenants. Files must run sequentially
// so one suite's cleanup never deletes another's fixtures. A global teardown
// disconnects Prisma once.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["tests/integration/global-setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
