import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Root integration suite: runs against the local Supabase database (pnpm db:start). */
export default defineConfig({
  resolve: {
    // App modules are marked server-only; the real package throws outside a server bundle.
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
