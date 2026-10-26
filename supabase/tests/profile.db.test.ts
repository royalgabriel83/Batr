import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, createMember, failure, ok, rpc, type Member } from "./support/db.ts";

// Display names (unit 05): members change only their own, through
// profile_set_display_name, with the same rules as packages/shared.

type Profile = { id: string; display_name: string | null };

let a: Member;
let b: Member;
beforeAll(async () => {
  [a, b] = await Promise.all([createMember("alice"), createMember("bob")]);
});

const nameOf = async (id: string) =>
  (await admin.from("profiles").select("display_name").eq("id", id).single()).data?.display_name as string | null;

describe("profile_set_display_name", () => {
  it("sets the caller's own name, trimmed, and leaves other members alone", async () => {
    const result = ok(await rpc<Profile>(a.client, "profile_set_display_name", { p_display_name: "  Ada L  " }));
    expect(result).toEqual({ id: a.id, display_name: "Ada L" });
    expect(await nameOf(a.id)).toBe("Ada L");
    expect(await nameOf(b.id)).toBe("bob");
  });

  it.each(["A", "a".repeat(41), "bob.com", "https://x", "   ", null])("refuses %j with 422", async (name) => {
    const before = await nameOf(a.id);
    const result = failure(await rpc(a.client, "profile_set_display_name", { p_display_name: name }));
    expect(result).toEqual({ status: 422, code: "VALIDATION_FAILED", detail: { fields: { display_name: "invalid" } } });
    expect(await nameOf(a.id)).toBe(before);
  });

  it("is not callable signed out", async () => {
    const { error } = await rpc(anonClient(), "profile_set_display_name", { p_display_name: "Visitor" });
    expect(error?.code).toBe("42501");
  });

  it("still cannot be bypassed with a direct update", async () => {
    const { error } = await a.client.from("profiles").update({ display_name: "bob.com" }).eq("id", a.id);
    expect(error).not.toBeNull();
    expect(await nameOf(a.id)).not.toBe("bob.com");
  });
});

describe("profile created at sign-up", () => {
  const signUp = async (displayName: unknown) => {
    const created = await admin.auth.admin.createUser({
      email: `new-${randomUUID()}@example.test`,
      password: `pw-${randomUUID()}`,
      user_metadata: { display_name: displayName },
    });
    if (created.error) throw created.error;
    return nameOf(created.data.user.id);
  };

  it("keeps a valid name from sign-up, trimmed", async () => {
    expect(await signUp("  Grace H ")).toBe("Grace H");
  });

  it.each(["G", "grace.com", "   ", null])("drops an invalid name %j so the member is asked again", async (name) => {
    expect(await signUp(name)).toBeNull();
  });
});
