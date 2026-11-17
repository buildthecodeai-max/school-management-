import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests hit a real database and must run serially via
    // vitest.integration.config.mts (npm run test:integration). Excluded here
    // so the default `vitest run` stays a fast, infra-free unit run.
    exclude: ["tests/integration/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "src/*" path mapping, which Vitest
      // does not read automatically.
      "@": path.resolve(import.meta.dirname, "src"),
      // Several src/lib files start with `import "server-only"` to fail the
      // build if ever bundled into client code. That package only resolves
      // inside Next's own bundler — under plain Node (which is what Vitest
      // runs in) it throws `Cannot find module 'server-only'`. Alias it to
      // a no-op stub so those files remain importable in tests; this does
      // not weaken the real client/server boundary Next enforces at build
      // time, it only unblocks running the same file's pure logic in tests.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
