import { beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as pause from "@/app/api/v1/offers/[id]/pause/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as save from "@/app/api/v1/offers/[id]/save/route";
import * as like from "@/app/api/v1/offers/[id]/like/route";
import * as saved from "@/app/api/v1/me/saved/route";
import { PUBLISHABLE_FIELDS, call, expectations, member, phoneJpeg, photoForm, randomUUID, type ApiMember } from "./support";

// Location phase 1 fields and private likes and saves through the API
// (owner, 2026-10-17).

let a: ApiMember;
let b: ApiMember;
let jpeg: Buffer;
beforeAll(async () => {
  [a, b] = await Promise.all([member("alice"), member("bob")]);
  jpeg = await phoneJpeg(1200, 900);
});

type Offer = { id: string; status: string; revision: number; area: string | null; liked?: boolean; saved?: boolean };

const at = (id: string) => `/api/v1/offers/${id}`;

async function active(fields: object = {}): Promise<Offer> {
  const created = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as: a, body: { ...PUBLISHABLE_FIELDS, ...fields } });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  let current = created.body.data as Offer;
  const added = await call<Offer>(photos.POST, "POST", `${at(current.id)}/photos`, { as: a, form: photoForm(jpeg, current), params: { id: current.id } });
  current = added.body.data as Offer;
  const live = await call<Offer>(publish.POST, "POST", `${at(current.id)}/publish`, { as: a, body: expectations(current), params: { id: current.id } });
  expect(live.status).toBe(200);
  return live.body.data as Offer;
}

describe("location fields", () => {
  it("returns the general area and logistics, and nothing more precise", async () => {
    const o = await active({ area: "ibadan_bodija", exchange_mode: "in_person", handover_methods: ["collection"] });
    const read = await call<Record<string, unknown>>(offer.GET, "GET", at(o.id), { as: b, params: { id: o.id } });
    expect(read.body.data).toMatchObject({ area: "ibadan_bodija", exchange_mode: "in_person", handover_methods: ["collection"] });
    for (const key of ["address", "latitude", "longitude", "coordinates", "location"]) expect(read.body.data).not.toHaveProperty(key);
    const list = await call<{ offers: Record<string, unknown>[] }>(offers.GET, "GET", "/api/v1/offers");
    const entry = list.body.data?.offers.find((x) => x.id === o.id);
    expect(entry).toMatchObject({ area: "ibadan_bodija" });
  });

  it("422 for an area outside the list or logistics that contradict each other", async () => {
    const bad = await call(offers.POST, "POST", "/api/v1/offers", { as: a, body: { area: "Bodija, house 12" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error?.fields).toHaveProperty("area");
    const clash = await call(offers.POST, "POST", "/api/v1/offers", { as: a, body: { exchange_mode: "remote", handover_methods: ["delivery"] } });
    expect(clash.status).toBe(422);
    expect(clash.body.error?.fields).toHaveProperty("handover_methods");
  });
});

describe("PUT and DELETE /api/v1/offers/:id/save and /like", () => {
  it("saves and likes, repeatably, and shows the viewer's own marks on the offer", async () => {
    const o = await active();
    for (let i = 0; i < 2; i += 1) {
      const s = await call(save.PUT, "PUT", `${at(o.id)}/save`, { as: b, params: { id: o.id }, key: null });
      expect(s.status).toBe(200);
      expect(s.body.data).toEqual({ offer_id: o.id, saved: true });
      expect(s.headers.get("cache-control")).toBe("private, no-store");
      const l = await call(like.PUT, "PUT", `${at(o.id)}/like`, { as: b, params: { id: o.id }, key: null });
      expect(l.body.data).toEqual({ offer_id: o.id, liked: true });
    }
    const asViewer = await call<Offer>(offer.GET, "GET", at(o.id), { as: b, params: { id: o.id } });
    expect(asViewer.body.data).toMatchObject({ liked: true, saved: true });
    // The owner and signed-out visitors see no marks and no counts.
    const asOwner = await call<Offer>(offer.GET, "GET", at(o.id), { as: a, params: { id: o.id } });
    expect(asOwner.body.data).not.toHaveProperty("liked");
    expect(asOwner.body.data).not.toHaveProperty("saved");
    const asGuest = await call<Offer>(offer.GET, "GET", at(o.id), { params: { id: o.id } });
    expect(asGuest.body.data).not.toHaveProperty("saved");
    const removed = await call(save.DELETE, "DELETE", `${at(o.id)}/save`, { as: b, params: { id: o.id }, key: null });
    expect(removed.body.data).toEqual({ offer_id: o.id, saved: false });
    const unliked = await call(like.DELETE, "DELETE", `${at(o.id)}/like`, { as: b, params: { id: o.id }, key: null });
    expect(unliked.body.data).toEqual({ offer_id: o.id, liked: false });
  });

  it("401 signed out, 403 on your own offer, 404 for a missing or malformed id", async () => {
    const o = await active();
    expect((await call(save.PUT, "PUT", `${at(o.id)}/save`, { params: { id: o.id }, key: null })).status).toBe(401);
    expect((await call(like.PUT, "PUT", `${at(o.id)}/like`, { as: a, params: { id: o.id }, key: null })).status).toBe(403);
    const missing = randomUUID();
    expect((await call(save.PUT, "PUT", `${at(missing)}/save`, { as: b, params: { id: missing }, key: null })).status).toBe(404);
    expect((await call(save.PUT, "PUT", "/api/v1/offers/nope/save", { as: b, params: { id: "nope" }, key: null })).status).toBe(404);
  });
});

describe("GET /api/v1/me/saved", () => {
  it("lists saved offers newest first, and an unavailable one without its details", async () => {
    const first = await active();
    const second = await active();
    for (const o of [first, second]) {
      expect((await call(save.PUT, "PUT", `${at(o.id)}/save`, { as: b, params: { id: o.id }, key: null })).status).toBe(200);
    }
    const before = await call<{ items: { offer_id: string; offer: Offer | null }[] }>(saved.GET, "GET", "/api/v1/me/saved", { as: b });
    expect(before.status).toBe(200);
    expect(before.body.data?.items.slice(0, 2).map((i) => i.offer_id)).toEqual([second.id, first.id]);
    expect(before.body.data?.items[0]?.offer).toMatchObject({ id: second.id, saved: true });
    await call(pause.POST, "POST", `${at(second.id)}/pause`, { as: a, body: expectations(second), params: { id: second.id } });
    const after = await call<{ items: { offer_id: string; offer: Offer | null }[] }>(saved.GET, "GET", "/api/v1/me/saved", { as: b });
    expect(after.body.data?.items[0]).toEqual({ offer_id: second.id, saved_at: expect.any(String), offer: null });
  });

  it("401 signed out; 422 for a bad cursor; nobody else's saves are listed", async () => {
    expect((await call(saved.GET, "GET", "/api/v1/me/saved")).status).toBe(401);
    expect((await call(saved.GET, "GET", "/api/v1/me/saved", { as: b, query: "?cursor=zzz" })).status).toBe(422);
    const mine = await call<{ items: unknown[] }>(saved.GET, "GET", "/api/v1/me/saved", { as: a });
    expect(mine.body.data?.items).toEqual([]);
  });
});
