import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // context/code-standards.md: 100% branch coverage on state
      // machines and permissions, and on the sign-in return-path check.
      // The run fails below these numbers.
      include: ["src/offers/transitions.ts", "src/offers/permissions.ts", "src/proposals/permissions.ts", "src/proposals/changes.ts", "src/agreements/permissions.ts", "src/messages/text.ts", "src/auth/return-path.ts"],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
