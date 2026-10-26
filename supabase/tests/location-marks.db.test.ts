import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  admin,
  anonClient,
  connect,
  createMember,
  createOffer,
  edit,
  failure,
  offerIn,
  ok,
  rpc,
  type Member,
} from "./support/db.ts";

// Location phase 1 (general area and exchange logistics) and private
// likes and saves (owner, 2026-10-17).

let a: Member;
let b: Member;
let db: pg.Client;

beforeAll(async () => {
  [a, b] = await Promise.all([createMember("alice"), createMember("bob")]);
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

const save = (member: Member, offerId: string, on: boolean) =>
  rpc<{ offer_id: string; on: boolean }>(member.client, "offer_set_saved", { p_offer_id: offerId, p_saved: on });
const like = (member: Member, offerId: string, on: boolean) =>
  rpc<{ offer_id: string; on: boolean }>(member.client, "offer_set_liked", { p_offer_id: offerId, p_liked: on });

describe("offer location and logistics", () => {
  it("stores a general area, an exchange mode and sorted, distinct handover methods", async () => {
    const offer = await createOffer(a, {
      area: "ibadan_bodija",
      exchange_mode: "either",
      handover_methods: ["public_meetup", "collection", "collection"],
    });
    expect(offer).toMatchObject({ area: "ibadan_bodija", exchange_mode: "either", handover_methods: ["collection", "public_meetup"] });
  });

  it("leaves all three empty when they are not given", async () => {
    const offer = await createOffer(a);
    expect(offer).toMatchObject({ area: null, exchange_mode: null, handover_methods: [] });
  });

  it("refuses an address, coordinates or any value outside the lists", async () => {
    for (const fields of [
      { area: "12 Awolowo Avenue, Bodija" },
      { area: "7.4219,3.9137" },
      { area: "lagos_lekki" },
      { exchange_mode: "post" },
      { handover_methods: ["courier"] },
      { handover_methods: "collection" },
      { handover_methods: [1] },
    ]) {
      const result = await rpc(a.client, "offer_create", { p_fields: fields, p_idempotency_key: crypto.randomUUID() });
      const key = Object.keys(fields)[0] as string;
      expect(failure(result)).toMatchObject({ status: 422, code: "VALIDATION_FAILED", detail: { fields: { [key]: "invalid" } } });
    }
  });

  it("refuses handover methods that contradict the exchange mode, on create and on edit", async () => {
    const remote = await rpc(a.client, "offer_create", {
      p_fields: { exchange_mode: "remote", handover_methods: ["collection"] },
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(failure(remote)).toMatchObject({ status: 422, detail: { fields: { handover_methods: "invalid" } } });
    const offer = await createOffer(a, { exchange_mode: "in_person", handover_methods: ["delivery"] });
    expect(failure(await edit(a, offer, { handover_methods: ["remote_service"] }))).toMatchObject({
      status: 422,
      detail: { fields: { handover_methods: "invalid" } },
    });
    // Milestone 9, V6: remote_service is a service method, so an item can't use it.
    expect(failure(await edit(a, offer, { exchange_mode: "remote", handover_methods: ["remote_service"], area: null }))).toMatchObject({
      status: 422,
      detail: { fields: { handover_methods: "item_method" } },
    });
    const changed = ok(await edit(a, offer, { offer_type: "service", exchange_mode: "remote", handover_methods: ["remote_service"], area: null }));
    expect(changed).toMatchObject({ offer_type: "service", exchange_mode: "remote", handover_methods: ["remote_service"], area: null });
  });

  it("treats the location fields as preferences: content_version stays the same", async () => {
    const offer = await createOffer(a);
    const changed = ok(await edit(a, offer, { area: "ibadan_ui", exchange_mode: "in_person", handover_methods: ["collection"] }));
    expect(changed.content_version).toBe(offer.content_version);
    expect(changed.revision).toBe(offer.revision + 1);
  });

  it("does not require location to publish", async () => {
    const active = await offerIn(a, "active");
    expect(active).toMatchObject({ status: "active", area: null });
  });

  it("adds no other location columns to offers", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'offers'",
    );
    const names = rows.map((r) => r.column_name);
    expect(names).toEqual(expect.arrayContaining(["area", "exchange_mode", "handover_methods"]));
    for (const forbidden of ["address", "latitude", "longitude", "lat", "lng", "coordinates", "location", "geom", "postcode"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("likes and saves", () => {
  it("saves and likes an active offer; repeating either changes nothing", async () => {
    const offer = await offerIn(a, "active");
    expect(ok(await save(b, offer.id, true))).toEqual({ offer_id: offer.id, on: true });
    expect(ok(await save(b, offer.id, true))).toEqual({ offer_id: offer.id, on: true });
    expect(ok(await like(b, offer.id, true))).toEqual({ offer_id: offer.id, on: true });
    expect(ok(await like(b, offer.id, true))).toEqual({ offer_id: offer.id, on: true });
    const saves = await db.query("select 1 from public.offer_saves where member_id = $1 and offer_id = $2", [b.id, offer.id]);
    const likes = await db.query("select 1 from public.offer_likes where member_id = $1 and offer_id = $2", [b.id, offer.id]);
    expect(saves.rowCount).toBe(1);
    expect(likes.rowCount).toBe(1);
  });

  it("unsaves and unlikes, even something never saved", async () => {
    const offer = await offerIn(a, "active");
    expect(ok(await save(b, offer.id, false))).toEqual({ offer_id: offer.id, on: false });
    ok(await save(b, offer.id, true));
    ok(await like(b, offer.id, true));
    ok(await save(b, offer.id, false));
    ok(await like(b, offer.id, false));
    const left = await db.query(
      "select (select count(*) from public.offer_saves where offer_id = $1)::int + (select count(*) from public.offer_likes where offer_id = $1)::int as n",
      [offer.id],
    );
    expect(left.rows[0].n).toBe(0);
  });

  it("refuses your own offer in any state (403) and others' offers that are not active (404)", async () => {
    const own = await offerIn(a, "active");
    expect(failure(await save(a, own.id, true))).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(failure(await like(a, own.id, true))).toMatchObject({ status: 403, code: "FORBIDDEN" });
    for (const status of ["draft", "paused", "closed"] as const) {
      const offer = await offerIn(a, status);
      expect(failure(await save(b, offer.id, true))).toMatchObject({ status: 404, code: "NOT_FOUND" });
      expect(failure(await like(b, offer.id, true))).toMatchObject({ status: 404, code: "NOT_FOUND" });
      expect(failure(await save(a, offer.id, true))).toMatchObject({ status: 403, code: "FORBIDDEN" });
    }
    expect(failure(await save(b, crypto.randomUUID(), true))).toMatchObject({ status: 404 });
  });

  it("keeps a save when the offer is paused, and still lets it be removed", async () => {
    const offer = await offerIn(a, "active");
    ok(await save(b, offer.id, true));
    ok(await rpc(a.client, "offer_pause", { p_offer_id: offer.id, p_expected_status: "active", p_expected_revision: offer.revision, p_idempotency_key: crypto.randomUUID() }));
    const kept = await db.query("select 1 from public.offer_saves where member_id = $1 and offer_id = $2", [b.id, offer.id]);
    expect(kept.rowCount).toBe(1);
    expect(ok(await save(b, offer.id, false))).toEqual({ offer_id: offer.id, on: false });
  });

  it("signed-out visitors can do neither", async () => {
    const offer = await offerIn(a, "active");
    const anon = anonClient();
    for (const fn of ["offer_set_saved", "offer_set_liked"]) {
      const result = await anon.rpc(fn, fn === "offer_set_saved" ? { p_offer_id: offer.id, p_saved: true } : { p_offer_id: offer.id, p_liked: true });
      expect(result.error).not.toBeNull();
    }
  });

  it("each member reads only their own rows; nobody writes the tables directly", async () => {
    const offer = await offerIn(a, "active");
    ok(await save(b, offer.id, true));
    ok(await like(b, offer.id, true));
    // The owner can't see who saved or liked their offer.
    for (const table of ["offer_saves", "offer_likes"]) {
      const asOwner = await a.client.from(table).select("member_id").eq("offer_id", offer.id);
      expect(asOwner.data).toEqual([]);
      const asMember = await b.client.from(table).select("member_id").eq("offer_id", offer.id);
      expect(asMember.data).toEqual([{ member_id: b.id }]);
      const anon = await anonClient().from(table).select("member_id");
      expect(anon.data ?? []).toEqual([]);
      const insert = await a.client.from(table).insert({ member_id: a.id, offer_id: offer.id });
      expect(insert.error).not.toBeNull();
      const del = await b.client.from(table).delete().eq("member_id", b.id).select();
      expect(del.data ?? []).toEqual([]);
    }
  });

  it("refuses a new save past the limit with 409 limit_reached", async () => {
    const c = await createMember("carol");
    const [first, second, third] = await Promise.all([offerIn(a, "active"), offerIn(a, "active"), offerIn(a, "active")]);
    // Lower the limit to 2 for this test only; restored afterwards.
    await db.query("create or replace function private.mark_limit() returns integer language sql immutable set search_path = '' as $$ select 2 $$");
    try {
      ok(await save(c, first.id, true));
      ok(await save(c, second.id, true));
      expect(failure(await save(c, third.id, true))).toMatchObject({ status: 409, code: "CONFLICT", detail: { reason: "limit_reached" } });
      // Saving something already saved, and removing, still work.
      expect(ok(await save(c, first.id, true))).toMatchObject({ on: true });
      ok(await save(c, first.id, false));
      expect(ok(await save(c, third.id, true))).toMatchObject({ on: true });
    } finally {
      await db.query("create or replace function private.mark_limit() returns integer language sql immutable set search_path = '' as $$ select 1000 $$");
    }
  });

  it("goes when the member's account or the offer is deleted", async () => {
    const d = await createMember("dave");
    const offer = await offerIn(a, "active");
    const gone = await offerIn(a, "active");
    ok(await save(d, offer.id, true));
    ok(await like(d, offer.id, true));
    ok(await save(b, gone.id, true));
    await db.query("delete from public.offers where id = $1", [gone.id]);
    expect((await db.query("select 1 from public.offer_saves where offer_id = $1", [gone.id])).rowCount).toBe(0);
    const { error } = await admin.auth.admin.deleteUser(d.id);
    expect(error).toBeNull();
    const left = await db.query("select 1 from public.offer_saves where member_id = $1 union all select 1 from public.offer_likes where member_id = $1", [d.id]);
    expect(left.rowCount).toBe(0);
  });
});
