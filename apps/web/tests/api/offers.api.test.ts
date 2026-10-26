import { beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as pause from "@/app/api/v1/offers/[id]/pause/route";
import * as resume from "@/app/api/v1/offers/[id]/resume/route";
import * as close from "@/app/api/v1/offers/[id]/close/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as photo from "@/app/api/v1/offers/[id]/photos/[photoId]/route";
import * as order from "@/app/api/v1/offers/[id]/photos/order/route";
import * as photoUrls from "@/app/api/v1/offers/[id]/photo-urls/route";
import * as myOffers from "@/app/api/v1/me/offers/route";
import { PUBLISH_RULE_MESSAGES } from "@batr/shared";
import { PUBLISHABLE_FIELDS, call, expectations, member, phoneJpeg, photoForm, randomUUID, type ApiMember, type ApiResult, type Handler } from "./support";

// API integration (milestone-1.md, Automated tests): every endpoint,
// success, 401, 403/404, 422, 409, and 400/422 for idempotency keys.

let a: ApiMember;
let b: ApiMember;
let jpeg: Buffer;
beforeAll(async () => {
  [a, b] = await Promise.all([member("alice"), member("bob")]);
  jpeg = await phoneJpeg(1200, 900);
});

type Offer = {
  id: string;
  status: string;
  category: string | null;
  revision: number;
  content_version: number;
  photos: { id: string; position: number; alt_text: string; url: string | null }[];
};

const at = (id: string) => `/api/v1/offers/${id}`;

async function draft(as: ApiMember = a, fields: object = PUBLISHABLE_FIELDS): Promise<Offer> {
  const result = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as, body: fields });
  expect(result.status).toBe(201);
  return result.body.data as Offer;
}

async function withPhotos(o: Offer, count: number, as: ApiMember = a): Promise<Offer> {
  let current = o;
  for (let i = 0; i < count; i += 1) {
    const result = await call<Offer>(photos.POST, "POST", `${at(o.id)}/photos`, { as, form: photoForm(jpeg, current), params: { id: o.id } });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    current = result.body.data as Offer;
  }
  return current;
}

async function act(handler: Handler, o: Offer, action: string, as: ApiMember = a) {
  return call<Offer>(handler, "POST", `${at(o.id)}/${action}`, { as, body: expectations(o), params: { id: o.id } });
}

async function active(as: ApiMember = a): Promise<Offer> {
  const ready = await withPhotos(await draft(as), 1, as);
  const result = await act(publish.POST, ready, "publish", as);
  expect(result.status).toBe(200);
  return result.body.data as Offer;
}

describe("POST /api/v1/offers", () => {
  it("creates a draft owned by the caller, trimmed", async () => {
    const result = await call<Offer & { title: string; is_owner: boolean }>(offers.POST, "POST", "/api/v1/offers", { as: a, body: { title: "  Road bike  " } });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ title: "Road bike", status: "draft", revision: 1, is_owner: true, photos: [] });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.body.data).not.toHaveProperty("owner_id");
  });

  it("401 signed out, also with a bad token", async () => {
    expect((await call(offers.POST, "POST", "/api/v1/offers", { body: {} })).status).toBe(401);
    const bad = await call(offers.POST, "POST", "/api/v1/offers", { body: {}, headers: { authorization: "Bearer nope" } });
    expect(bad.body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("422 for invalid fields, with a message per field", async () => {
    const result = await call(offers.POST, "POST", "/api/v1/offers", { as: a, body: { title: "x".repeat(81), category: "cars", owner_id: b.id } });
    expect(result.status).toBe(422);
    expect(Object.keys(result.body.error?.fields ?? {}).sort()).toEqual(["category", "owner_id", "title"]);
    const notJson = await call(offers.POST, "POST", "/api/v1/offers", { as: a, body: "{nope" });
    expect(notJson.body.error?.code).toBe("VALIDATION_FAILED");
  });

  it("400 without an idempotency key; same key replays; same key different body 422", async () => {
    expect((await call(offers.POST, "POST", "/api/v1/offers", { as: a, key: null, body: {} })).body.error?.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect((await call(offers.POST, "POST", "/api/v1/offers", { as: a, key: "not-a-uuid", body: {} })).status).toBe(400);
    const key = randomUUID();
    const first = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as: a, key, body: { title: "Tent" } });
    const again = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as: a, key, body: { title: "Tent" } });
    expect(again.status).toBe(201);
    expect(again.body.data?.id).toBe(first.body.data?.id);
    const other = await call(offers.POST, "POST", "/api/v1/offers", { as: a, key, body: { title: "Lamp" } });
    expect([other.status, other.body.error?.code]).toEqual([422, "IDEMPOTENCY_KEY_REUSED"]);
    // Another member with the same key is independent.
    expect((await call(offers.POST, "POST", "/api/v1/offers", { as: b, key, body: { title: "Lamp" } })).status).toBe(201);
  });
});

describe("PATCH /api/v1/offers/:id", () => {
  it("edits and bumps revision; content_version only for material fields", async () => {
    const o = await draft();
    const material = await call<Offer>(offer.PATCH, "PATCH", at(o.id), { as: a, params: { id: o.id }, body: { ...expectations(o), fields: { title: "Road bike, steel" } } });
    expect(material.status).toBe(200);
    expect(material.body.data).toMatchObject({ revision: 2, content_version: 2 });
    const wants = await call<Offer>(offer.PATCH, "PATCH", at(o.id), { as: a, params: { id: o.id }, body: { ...expectations(material.body.data as Offer), fields: { wants_text: "A tent" } } });
    expect(wants.body.data).toMatchObject({ revision: 3, content_version: 2 });
  });

  it("409 stale revision with the current offer; 409 changed status", async () => {
    const o = await draft();
    await call(offer.PATCH, "PATCH", at(o.id), { as: a, params: { id: o.id }, body: { ...expectations(o), fields: { title: "First" } } });
    const stale = await call(offer.PATCH, "PATCH", at(o.id), { as: a, params: { id: o.id }, body: { ...expectations(o), fields: { title: "Second" } } });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: "CONFLICT", reason: "stale_revision", current_revision: 2, offer: { title: "First", revision: 2 } });
    const changed = await call(offer.PATCH, "PATCH", at(o.id), { as: a, params: { id: o.id }, body: { expected_status: "active", expected_revision: 2, fields: { title: "Third" } } });
    expect(changed.body.error).toMatchObject({ code: "CONFLICT", reason: "status_changed", current_status: "draft" });
  });

  it("422 when an edit would make an active offer unpublishable", async () => {
    const o = await active();
    const result = await call(offer.PATCH, "PATCH", at(o.id), { as: a, params: { id: o.id }, body: { ...expectations(o), fields: { title: "Bike" } } });
    expect(result.status).toBe(422);
    expect(result.body.error?.fields).toEqual({ title: PUBLISH_RULE_MESSAGES.title });
  });

  it("403 for someone else's active offer, 404 for their draft or an unknown id; 401 signed out", async () => {
    const o = await active();
    const d = await draft();
    const body = (x: Offer) => ({ ...expectations(x), fields: { title: "Mine now" } });
    expect((await call(offer.PATCH, "PATCH", at(o.id), { as: b, params: { id: o.id }, body: body(o) })).status).toBe(403);
    expect((await call(offer.PATCH, "PATCH", at(d.id), { as: b, params: { id: d.id }, body: body(d) })).status).toBe(404);
    expect((await call(offer.PATCH, "PATCH", at("x"), { as: a, params: { id: "not-a-uuid" }, body: body(d) })).status).toBe(404);
    expect((await call(offer.PATCH, "PATCH", at(randomUUID()), { as: a, params: { id: randomUUID() }, body: body(d) })).status).toBe(404);
    expect((await call(offer.PATCH, "PATCH", at(d.id), { params: { id: d.id }, body: body(d) })).status).toBe(401);
  });

  it("422 without expectations or fields", async () => {
    const o = await draft();
    const result = await call(offer.PATCH, "PATCH", at(o.id), { as: a, params: { id: o.id }, body: { fields: {} } });
    expect(result.status).toBe(422);
    expect(Object.keys(result.body.error?.fields ?? {}).sort()).toEqual(["expected_revision", "expected_status", "fields"]);
  });

  it("400 without a key, and the key is checked against the endpoint", async () => {
    const o = await draft();
    expect((await call(offer.PATCH, "PATCH", at(o.id), { as: a, key: null, params: { id: o.id }, body: { ...expectations(o), fields: { title: "x" } } })).status).toBe(400);
    const key = randomUUID();
    await call(offers.POST, "POST", "/api/v1/offers", { as: a, key, body: {} });
    const reused = await call(offer.PATCH, "PATCH", at(o.id), { as: a, key, params: { id: o.id }, body: { ...expectations(o), fields: { title: "x" } } });
    expect(reused.body.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("transitions", () => {
  it("publish, pause, resume, close; each bumps revision; replay returns the same response", async () => {
    const ready = await withPhotos(await draft(), 1);
    const key = randomUUID();
    const published = await call<Offer>(publish.POST, "POST", `${at(ready.id)}/publish`, { as: a, key, body: expectations(ready), params: { id: ready.id } });
    expect(published.body.data).toMatchObject({ status: "active", revision: ready.revision + 1 });
    const replay = await call<Offer>(publish.POST, "POST", `${at(ready.id)}/publish`, { as: a, key, body: expectations(ready), params: { id: ready.id } });
    expect([replay.status, replay.body.data?.revision]).toEqual([200, ready.revision + 1]);
    const paused = await act(pause.POST, published.body.data as Offer, "pause");
    expect(paused.body.data?.status).toBe("paused");
    const resumed = await act(resume.POST, paused.body.data as Offer, "resume");
    expect(resumed.body.data?.status).toBe("active");
    const closed = await act(close.POST, resumed.body.data as Offer, "close");
    expect(closed.body.data?.status).toBe("closed");
    expect((await act(resume.POST, closed.body.data as Offer, "resume")).body.error).toMatchObject({ code: "CONFLICT", current_status: "closed" });
  });

  it("422 publishing without photos or fields, with the shared messages", async () => {
    const o = await draft(a, { title: "Bike" });
    const result = await act(publish.POST, o, "publish");
    expect(result.status).toBe(422);
    expect(result.body.error?.fields).toEqual({
      title: PUBLISH_RULE_MESSAGES.title,
      category: PUBLISH_RULE_MESSAGES.category,
      condition: PUBLISH_RULE_MESSAGES.condition,
      offering_text: PUBLISH_RULE_MESSAGES.offering_text,
      wants_text: PUBLISH_RULE_MESSAGES.wants_text,
      photos: PUBLISH_RULE_MESSAGES.photos,
    });
  });

  it("401, 403, 404, 409 stale, 422 without expectations, 400 without key", async () => {
    const o = await active();
    expect((await call(pause.POST, "POST", `${at(o.id)}/pause`, { body: expectations(o), params: { id: o.id } })).status).toBe(401);
    expect((await act(pause.POST, o, "pause", b)).status).toBe(403);
    const d = await draft();
    expect((await act(publish.POST, d, "publish", b)).status).toBe(404);
    expect((await act(pause.POST, { ...o, revision: o.revision - 1 }, "pause")).body.error?.reason).toBe("stale_revision");
    expect((await call(pause.POST, "POST", `${at(o.id)}/pause`, { as: a, body: {}, params: { id: o.id } })).status).toBe(422);
    expect((await call(pause.POST, "POST", `${at(o.id)}/pause`, { as: a, key: null, body: expectations(o), params: { id: o.id } })).status).toBe(400);
  });
});

describe("DELETE /api/v1/offers/:id", () => {
  it("deletes a draft; refuses an active offer; 401/404", async () => {
    const d = await withPhotos(await draft(), 1);
    expect((await call(offer.DELETE, "DELETE", at(d.id), { params: { id: d.id }, body: expectations(d) })).status).toBe(401);
    expect((await call(offer.DELETE, "DELETE", at(d.id), { as: b, params: { id: d.id }, body: expectations(d) })).status).toBe(404);
    const deleted = await call(offer.DELETE, "DELETE", at(d.id), { as: a, params: { id: d.id }, body: expectations(d) });
    expect(deleted.body).toEqual({ data: { id: d.id, deleted: true } });
    expect((await call(offer.GET, "GET", at(d.id), { as: a, params: { id: d.id } })).status).toBe(404);
    const o = await active();
    expect((await call(offer.DELETE, "DELETE", at(o.id), { as: a, params: { id: o.id }, body: expectations(o) })).body.error?.code).toBe("CONFLICT");
  });
});

describe("photo endpoints", () => {
  it("reorder, alt text and remove; 409 stale, 403/404 for others, 422 bad input, 400 without key", async () => {
    let o = await withPhotos(await draft(), 3);
    const ids = o.photos.map((p) => p.id);
    const reordered = await call<Offer>(order.PUT, "PUT", `${at(o.id)}/photos/order`, { as: a, params: { id: o.id }, body: { ...expectations(o), photo_ids: [ids[2], ids[0], ids[1]] } });
    expect(reordered.body.data?.photos.map((p) => p.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(reordered.body.data?.content_version).toBe(o.content_version);
    const staleReorder = await call(order.PUT, "PUT", `${at(o.id)}/photos/order`, { as: a, params: { id: o.id }, body: { ...expectations(o), photo_ids: ids } });
    expect(staleReorder.body.error?.reason).toBe("stale_revision");
    o = reordered.body.data as Offer;
    const missing = await call(order.PUT, "PUT", `${at(o.id)}/photos/order`, { as: a, params: { id: o.id }, body: { ...expectations(o), photo_ids: [ids[0], ids[1]] } });
    expect(missing.body.error?.reason).toBe("stale_revision");
    expect((await call(order.PUT, "PUT", `${at(o.id)}/photos/order`, { as: a, params: { id: o.id }, body: { ...expectations(o), photo_ids: [ids[0], ids[0]] } })).status).toBe(422);

    const photoPath = (pid: string) => `${at(o.id)}/photos/${pid}`;
    const alt = await call<Offer>(photo.PATCH, "PATCH", photoPath(ids[0] as string), { as: a, params: { id: o.id, photoId: ids[0] as string }, body: { ...expectations(o), alt_text: "  Front view " } });
    expect(alt.status).toBe(200);
    expect(alt.body.data?.photos.find((p) => p.id === ids[0])?.alt_text).toBe("Front view");
    expect((await call(photo.PATCH, "PATCH", photoPath(ids[0] as string), { as: a, params: { id: o.id, photoId: ids[0] as string }, body: { ...expectations(o), alt_text: "x" } })).body.error?.reason).toBe("stale_revision");
    o = alt.body.data as Offer;
    expect((await call(photo.PATCH, "PATCH", photoPath(ids[0] as string), { as: a, params: { id: o.id, photoId: ids[0] as string }, body: { ...expectations(o), alt_text: "x".repeat(201) } })).status).toBe(422);
    expect((await call(photo.PATCH, "PATCH", photoPath(randomUUID()), { as: a, params: { id: o.id, photoId: randomUUID() }, body: { ...expectations(o), alt_text: "x" } })).status).toBe(404);
    expect((await call(photo.PATCH, "PATCH", photoPath(ids[0] as string), { as: b, params: { id: o.id, photoId: ids[0] as string }, body: { ...expectations(o), alt_text: "x" } })).status).toBe(404);
    expect((await call(photo.PATCH, "PATCH", photoPath(ids[0] as string), { params: { id: o.id, photoId: ids[0] as string }, body: { ...expectations(o), alt_text: "x" } })).status).toBe(401);
    expect((await call(photo.PATCH, "PATCH", photoPath(ids[0] as string), { as: a, key: null, params: { id: o.id, photoId: ids[0] as string }, body: { ...expectations(o), alt_text: "x" } })).status).toBe(400);

    const removed = await call<Offer>(photo.DELETE, "DELETE", photoPath(ids[1] as string), { as: a, params: { id: o.id, photoId: ids[1] as string }, body: expectations(o) });
    expect(removed.status).toBe(200);
    expect(removed.body.data?.photos.map((p) => [p.id, p.position])).toEqual([[ids[2], 1], [ids[0], 2]]);
    expect(JSON.stringify(removed.body)).not.toContain("cleanup_paths");
    expect((await call(photo.DELETE, "DELETE", photoPath(ids[0] as string), { as: a, params: { id: o.id, photoId: ids[0] as string }, body: expectations(o) })).body.error?.reason).toBe("stale_revision");
  });

  it("refuses removing the only photo of an active offer", async () => {
    const o = await active();
    const only = o.photos[0]?.id as string;
    const result = await call(photo.DELETE, "DELETE", `${at(o.id)}/photos/${only}`, { as: a, params: { id: o.id, photoId: only }, body: expectations(o) });
    expect(result.status).toBe(422);
    expect(result.body.error?.fields).toEqual({ photos: PUBLISH_RULE_MESSAGES.photos });
  });

  it("upload: 401, 404 for another member's draft, 403 for their active offer, 409 stale, 422 missing file, 400 without key", async () => {
    const d = await draft();
    const o = await active();
    const up = (target: Offer, as?: ApiMember, extra: object = {}) =>
      call(photos.POST, "POST", `${at(target.id)}/photos`, { as, form: photoForm(jpeg, target), params: { id: target.id }, ...extra });
    expect((await up(d)).status).toBe(401);
    expect((await up(d, b)).status).toBe(404);
    expect((await up(o, b)).status).toBe(403);
    expect((await up({ ...d, revision: 7 }, a)).body.error?.reason).toBe("stale_revision");
    expect((await up(d, a, { key: null })).status).toBe(400);
    const empty = new FormData();
    empty.set("expected_status", "draft");
    expect((await call(photos.POST, "POST", `${at(d.id)}/photos`, { as: a, form: empty, params: { id: d.id } })).body.error?.fields).toEqual({ file: "Choose a photo." });
  });
});

describe("reads", () => {
  it("GET detail: anyone for active, owner for draft, 404 otherwise; public fields only", async () => {
    const o = await active();
    const d = await draft();
    const asVisitor = await call(offer.GET, "GET", at(o.id), { params: { id: o.id } });
    expect(asVisitor.status).toBe(200);
    expect(asVisitor.body.data).toMatchObject({ id: o.id, is_owner: false, owner: { display_name: "alice" } });
    expect(asVisitor.body.data.owner.member_since).toMatch(/^\d{4}-\d{2}$/);
    expect(Object.keys(asVisitor.body.data)).not.toContain("content_version");
    expect(asVisitor.body.data.photos[0].url).toMatch(/^http.*token=/);
    // No owner id field or storage paths (the signed links themselves
    // contain the storage path, which starts with the owner's id).
    expect(asVisitor.body.data).not.toHaveProperty("owner_id");
    expect(JSON.stringify(asVisitor.body)).not.toMatch(/"(display|thumb)_path"/);
    expect((await call(offer.GET, "GET", at(d.id), { params: { id: d.id } })).status).toBe(404);
    expect((await call(offer.GET, "GET", at(d.id), { as: b, params: { id: d.id } })).status).toBe(404);
    expect((await call(offer.GET, "GET", at(d.id), { as: a, params: { id: d.id } })).body.data.is_owner).toBe(true);
    expect(asVisitor.headers.get("cache-control")).toBe("private, no-store");
  });

  it("GET photo-urls: fresh links while readable, 404 after pause for others", async () => {
    const o = await active();
    const links = await call(photoUrls.GET, "GET", `${at(o.id)}/photo-urls`, { params: { id: o.id } });
    expect(links.body.data).toHaveLength(1);
    expect(links.body.data[0].thumb_url).toMatch(/token=/);
    await act(pause.POST, o, "pause");
    expect((await call(photoUrls.GET, "GET", `${at(o.id)}/photo-urls`, { params: { id: o.id } })).status).toBe(404);
    expect((await call(photoUrls.GET, "GET", `${at(o.id)}/photo-urls`, { as: b, params: { id: o.id } })).status).toBe(404);
    expect((await call(photoUrls.GET, "GET", `${at(o.id)}/photo-urls`, { as: a, params: { id: o.id } })).status).toBe(200);
  });

  it("GET /api/v1/me/offers: own offers in any status, filtered; 401 signed out; 422 bad status", async () => {
    const me = await member("carol");
    const d = await draft(me);
    const o = await active(me);
    const all = await call(myOffers.GET, "GET", "/api/v1/me/offers", { as: me });
    expect(all.body.data.offers.map((x: Offer) => x.id).sort()).toEqual([d.id, o.id].sort());
    const drafts = await call(myOffers.GET, "GET", "/api/v1/me/offers", { as: me, query: "?status=draft" });
    expect(drafts.body.data.offers.map((x: Offer) => x.id)).toEqual([d.id]);
    expect(drafts.body.data.offers[0]).toMatchObject({ status: "draft", photo_count: 0, cover: null, is_owner: true });
    expect((await call(myOffers.GET, "GET", "/api/v1/me/offers")).status).toBe(401);
    expect((await call(myOffers.GET, "GET", "/api/v1/me/offers", { as: me, query: "?status=gone" })).status).toBe(422);
  });

  it("GET /api/v1/offers: active only, newest first, category filter, cursor pages without gaps", async () => {
    const seller = await member("dave");
    const mine: Offer[] = [];
    for (let i = 0; i < 3; i += 1) mine.push(await active(seller));
    const hidden = await draft(seller);
    const first = await call(offers.GET, "GET", "/api/v1/offers");
    expect(first.status).toBe(200);
    const ids = first.body.data.offers.map((x: Offer) => x.id);
    // Other test files publish at the same time, so check the order of ours only.
    const ours = new Set(mine.map((x) => x.id));
    expect(ids.filter((id: string) => ours.has(id))).toEqual(mine.map((x) => x.id).reverse());
    expect(ids).not.toContain(hidden.id);
    expect(first.body.data.offers[0].cover.thumb_url).toMatch(/token=/);
    // Walk every page: no offer twice, none missing among ours.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: ApiResult = await call(offers.GET, "GET", "/api/v1/offers", { query: cursor ? `?cursor=${cursor}` : "" });
      expect(page.body.data.offers.length).toBeLessThanOrEqual(20);
      seen.push(...page.body.data.offers.map((x: Offer) => x.id));
      cursor = page.body.data.next_cursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    for (const x of mine) expect(seen).toContain(x.id);
    const books = await call(offers.GET, "GET", "/api/v1/offers", { query: "?category=books_media" });
    expect(books.body.data.offers.every((x: Offer) => x.category === "books_media")).toBe(true);
    expect((await call(offers.GET, "GET", "/api/v1/offers", { query: "?category=cars" })).status).toBe(422);
    expect((await call(offers.GET, "GET", "/api/v1/offers", { query: "?cursor=bad" })).status).toBe(422);
  });

  it("GET /api/v1/offers: a hand-made cursor is refused as invalid, never passed to the database", async () => {
    const id = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    // Each date is accepted by Date.parse; the first carries filter syntax in a bracketed comment.
    for (const publishedAt of ['17 Oct 2099 (",id.not.is.null,published_at.lt.")', "17 Oct 2099", "2099-01-01"]) {
      const cursor = Buffer.from(JSON.stringify([publishedAt, id])).toString("base64url");
      const result = await call(offers.GET, "GET", "/api/v1/offers", { query: `?cursor=${cursor}` });
      expect(result.status, publishedAt).toBe(422);
      expect(result.body.error?.fields?.cursor).toBe("This page link is no longer valid.");
    }
  });
});
