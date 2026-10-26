// `pnpm cleanup:storage`: runs the storage cleanup job by calling the
// running app's /api/internal/storage-cleanup with CRON_SECRET, the way
// a host's scheduler would. The secret comes from the environment, or
// from apps/web/.env.local (git-ignored) in local development. The app
// address defaults to http://localhost:3000 (override with BATR_APP_URL).
/* global fetch */
import { existsSync, readFileSync } from "node:fs";

function fromEnvFile(name) {
  const file = new URL("../apps/web/.env.local", import.meta.url);
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && match[1] === name) return match[2];
  }
  return undefined;
}

const secret = process.env.CRON_SECRET ?? fromEnvFile("CRON_SECRET");
if (!secret) {
  console.error("CRON_SECRET is not set. Run `pnpm env:local` for local development, or set it in the environment.");
  process.exit(1);
}
const base = process.env.BATR_APP_URL ?? "http://localhost:3000";

let response;
try {
  response = await fetch(new URL("/api/internal/storage-cleanup", base), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
} catch (error) {
  console.error(`Could not reach the app at ${base}. Start it first (pnpm dev or pnpm start).`, error.message);
  process.exit(1);
}
const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error(`Cleanup failed (${response.status}):`, body?.error?.message ?? body);
  process.exit(1);
}
console.log(JSON.stringify(body.data, null, 2));
