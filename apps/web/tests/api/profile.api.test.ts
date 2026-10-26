import { beforeAll, describe, expect, it } from "vitest";
import * as profile from "@/app/api/v1/me/profile/route";
import { call, member, type ApiMember } from "./support";

// The Account tab's profile (specs/milestone-2.md, unit 10).

let a: ApiMember;
beforeAll(async () => {
  a = await member("ada");
});

describe("GET and PATCH /api/v1/me/profile", () => {
  it("401 when signed out", async () => {
    expect((await call(profile.GET, "GET", "/api/v1/me/profile")).status).toBe(401);
    expect((await call(profile.PATCH, "PATCH", "/api/v1/me/profile", { body: { display_name: "Ada" } })).status).toBe(401);
  });

  it("returns the member's own name, email and month joined, with no ids", async () => {
    const read = await call<Record<string, unknown>>(profile.GET, "GET", "/api/v1/me/profile", { as: a });
    expect(read.status).toBe(200);
    expect(Object.keys(read.body.data ?? {}).sort()).toEqual(["display_name", "email", "member_since"]);
    expect(read.body.data).toMatchObject({ email: expect.stringMatching(/^ada-.+@example\.test$/), member_since: expect.stringMatching(/^\d{4}-\d{2}$/) });
    expect(JSON.stringify(read.body)).not.toContain(a.id);
  });

  it("sets the display name, with the shared validation", async () => {
    const set = await call(profile.PATCH, "PATCH", "/api/v1/me/profile", { as: a, body: { display_name: "  Ada Lovelace " } });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ display_name: "Ada Lovelace" });
    const bad = await call(profile.PATCH, "PATCH", "/api/v1/me/profile", { as: a, body: { display_name: "" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error?.fields).toHaveProperty("display_name");
  });
});
