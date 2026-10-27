import { defineConfig } from "vitest/config";

/** Root integration suite: runs against the local Supabase database (pnpm db:start). */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
