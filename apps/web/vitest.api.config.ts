import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// API integration tests: the route handlers called in-process against a
// real local Supabase, with real members' own sessions (Bearer tokens).
// Run through `pnpm test:api`, which supplies the local connection
// details from `supabase status` without writing them to disk.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/api/**/*.api.test.ts"],
    testTimeout: 30_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    },
  },
});
