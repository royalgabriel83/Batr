import { execFileSync } from "node:child_process";
import pg from "pg";

// Makes a test account BATR staff (a valuation reviewer or a moderator). Staff roles are only
// ever granted with direct SQL (there is no screen or API for it), so
// the test does the same against the local database.

let dbUrl: string | null = null;

export async function grantReviewer(email: string, role: "valuation_reviewer" | "valuation_inspector" | "moderator" = "valuation_reviewer"): Promise<void> {
  if (!dbUrl) {
    const output = execFileSync("pnpm", ["exec", "supabase", "status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    dbUrl = (JSON.parse(output.slice(output.indexOf("{"))) as { DB_URL: string }).DB_URL;
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(
      "insert into private.staff_roles (member_id, role) select id, $2 from auth.users where email = lower($1) on conflict do nothing",
      [email, role],
    );
  } finally {
    await client.end();
  }
}

/** Milestone 6, S4: moderators are granted the same way. */
export const grantModerator = (email: string): Promise<void> => grantReviewer(email, "moderator");
