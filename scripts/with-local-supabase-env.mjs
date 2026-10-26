// Runs a command with the local Supabase connection details in its
// environment. Nothing is written to disk.
// Usage: node scripts/with-local-supabase-env.mjs <command> [args...]
import { spawnSync } from "node:child_process";
import { readLocalSupabase } from "./local-supabase.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-local-supabase-env.mjs <command> [args...]");
  process.exit(2);
}

const status = readLocalSupabase();
const result = spawnSync("pnpm", ["exec", command, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: status.DB_URL,
    // Local development secret, used only by tests that need a token
    // with chosen claims (for example an expired one).
    SUPABASE_JWT_SECRET: status.JWT_SECRET ?? "",
  },
});
process.exit(result.status ?? 1);
