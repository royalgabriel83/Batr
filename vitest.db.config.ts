import { defineConfig } from "vitest/config";

// Tests that run against a real local Supabase (`pnpm db:start` first).
// Run through `pnpm test:db`, which supplies the local connection
// details from `supabase status` without writing them to disk.
export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.db.test.ts"],
    testTimeout: 30_000,
  },
});
