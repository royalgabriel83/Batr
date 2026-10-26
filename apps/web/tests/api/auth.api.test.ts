import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as myOffers from "@/app/api/v1/me/offers/route";
import { anonClient, call, member, type ApiMember } from "./support";

// Bearer tokens (approved 2026-10-16 alongside the web session cookie):
// invalid, tampered, expired and revoked tokens are refused the same
// way, and a valid token reaches only what its member may reach.

let a: ApiMember;
let b: ApiMember;
beforeAll(async () => {
  [a, b] = await Promise.all([member("alice"), member("bob")]);
});

const secret = () => {
  const value = process.env.SUPABASE_JWT_SECRET;
  if (!value) throw new Error("SUPABASE_JWT_SECRET is not set. Run the tests with `pnpm test:api`.");
  return value;
};

const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split(".")[1] as string, "base64url").toString()) as Record<string, unknown>;

/** A token for the same member and session with chosen times, signed with the local development secret. */
function tokenWith(member: ApiMember, times: { iat: number; exp: number }): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ ...claimsOf(member.token), ...times });
  return `${head}.${body}.${createHmac("sha256", secret()).update(`${head}.${body}`).digest("base64url")}`;
}

const now = () => Math.floor(Date.now() / 1000);
const withToken = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

describe("Bearer tokens", () => {
  it("a re-signed token with a future expiry works (the control for the expired case)", async () => {
    const result = await call(myOffers.GET, "GET", "/api/v1/me/offers", withToken(tokenWith(a, { iat: now(), exp: now() + 600 })));
    expect(result.status).toBe(200);
  });

  it("an expired token is 401 for reads and writes", async () => {
    const expired = tokenWith(a, { iat: now() - 7200, exp: now() - 3600 });
    expect((await call(myOffers.GET, "GET", "/api/v1/me/offers", withToken(expired))).status).toBe(401);
    const write = await call(offers.POST, "POST", "/api/v1/offers", { ...withToken(expired), body: {} });
    expect([write.status, write.body.error?.code]).toEqual([401, "UNAUTHENTICATED"]);
  });

  it.each([
    ["garbage", "not-a-token"],
    ["a tampered signature", () => `${a.token.slice(0, -4)}AAAA`],
    ["a non-Bearer scheme", null],
  ])("%s is 401", async (_name, token) => {
    const header = token === null ? `Basic ${Buffer.from("a:b").toString("base64")}` : `Bearer ${typeof token === "function" ? token() : token}`;
    const result = await call(offers.POST, "POST", "/api/v1/offers", { headers: { authorization: header }, body: {} });
    expect(result.status).toBe(401);
  });

  it("a token whose session was signed out is 401", async () => {
    const carol = await member("carol");
    expect((await call(myOffers.GET, "GET", "/api/v1/me/offers", { as: carol })).status).toBe(200);
    await carol.client.auth.signOut({ scope: "global" });
    expect((await call(myOffers.GET, "GET", "/api/v1/me/offers", { as: carol })).status).toBe(401);
  });

  it("a valid token reaches only its own member's offers", async () => {
    const created = await call(offers.POST, "POST", "/api/v1/offers", { as: a, body: { title: "Alice's draft" } });
    const id = created.body.data.id as string;
    expect((await call(offer.GET, "GET", "", { as: b, params: { id } })).status).toBe(404);
    const bobsList = await call(myOffers.GET, "GET", "/api/v1/me/offers", { as: b });
    expect(bobsList.body.data.offers.map((o: { id: string }) => o.id)).not.toContain(id);
    // The anon key alone is not a member session.
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    expect((await call(offers.POST, "POST", "/api/v1/offers", { ...withToken(anonKey), body: {} })).status).toBe(401);
    expect(anonClient()).toBeTruthy();
  });
});
