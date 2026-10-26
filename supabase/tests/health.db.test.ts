import { describe, expect, it } from "vitest";

// Smoke check that local Supabase is reachable through the same
// gateway the app uses. It does not test any schema or policy; those
// are covered by the other files in this folder.
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

describe("local Supabase", () => {
  it("has connection details from `pnpm test:db`", () => {
    expect(url).toBeTruthy();
    expect(anonKey).toBeTruthy();
  });

  it("serves the Auth health endpoint", async () => {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey ?? "" },
    });
    expect(response.status).toBe(200);
  });

  it("serves the Storage API", async () => {
    const response = await fetch(`${url}/storage/v1/bucket`, {
      headers: { apikey: anonKey ?? "", authorization: `Bearer ${anonKey ?? ""}` },
    });
    expect(response.status).toBe(200);
  });
});
