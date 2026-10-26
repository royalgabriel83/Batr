import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  addPhoto,
  anonClient,
  auditCount,
  connect,
  createMember,
  createOffer,
  edit,
  failure,
  newKey,
  offerIn,
  offerRow,
  ok,
  publishableDraft,
  rpc,
  transition,
  type Member,
  type Offer,
} from "./support/db.ts";

// The write functions: transitions, permissions, validation, revisions,
// content versions, photo order and draft deletion
// (state-model.md §1–2; milestone-1.md, Concurrency, Photo order, Data).

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

const act = (member: Member, action: string, offer: Offer, overrides: Record<string, unknown> = {}) =>
  rpc(member.client, `offer_${action}`, {
    p_offer_id: offer.id,
    p_expected_status: offer.status,
    p_expected_revision: offer.revision,
    p_idempotency_key: newKey(),
    ...overrides,
  });

describe("lifecycle", () => {
  it("creates a draft owned by the caller, with one create audit event", async () => {
    const offer = await createOffer(a, { title: "  Desk lamp  " });
    expect(offer).toMatchObject({ owner_id: a.id, status: "draft", title: "Desk lamp", revision: 1, content_version: 1 });
    expect(await auditCount(db, offer.id, "create")).toBe(1);
  });

  it("runs draft → active → paused → active → closed, one audit event per transition", async () => {
    let offer = await publishableDraft(a);
    for (const [action, to] of [["publish", "active"], ["pause", "paused"], ["resume", "active"], ["close", "closed"]] as const) {
      offer = await transition(a, action, offer);
      expect(offer.status).toBe(to);
      expect(await auditCount(db, offer.id, action)).toBe(1);
    }
    const events = await db.query("select action, from_state, to_state from public.audit_events where entity_id = $1 and action not in ('create','edit','photo_add') order by id", [offer.id]);
    expect(events.rows).toEqual([
      { action: "publish", from_state: "draft", to_state: "active" },
      { action: "pause", from_state: "active", to_state: "paused" },
      { action: "resume", from_state: "paused", to_state: "active" },
      { action: "close", from_state: "active", to_state: "closed" },
    ]);
  });

  it("refuses every transition outside the table with 409 status_changed (criterion 20)", async () => {
    const offers = {
      draft: await offerIn(a, "draft"),
      active: await offerIn(a, "active"),
      paused: await offerIn(a, "paused"),
      closed: await offerIn(a, "closed"),
    };
    const allowed = new Set(["publish:draft", "pause:active", "resume:paused", "close:active", "close:paused", "delete_draft:draft"]);
    for (const [status, offer] of Object.entries(offers)) {
      for (const action of ["publish", "pause", "resume", "close", "delete_draft"]) {
        if (allowed.has(`${action}:${status}`)) continue;
        const result = failure(await act(a, action, offer));
        expect([action, status, result.status, result.detail.reason]).toEqual([action, status, 409, "status_changed"]);
        expect(result.detail.current_status).toBe(status);
      }
    }
    const closedEdit = failure(await edit(a, offers.closed, { title: "Reopened" }));
    expect([closedEdit.status, closedEdit.detail.reason]).toEqual([409, "status_changed"]);
    expect((await offerRow(db, offers.closed.id))?.status).toBe("closed");
  });

  it("refuses to publish an incomplete draft with 422 naming each field (criterion 6)", async () => {
    const offer = await createOffer(a, { title: "Bike" });
    const result = failure(await act(a, "publish", offer));
    expect(result.status).toBe(422);
    expect(result.code).toBe("VALIDATION_FAILED");
    expect(result.detail.fields).toEqual(["title", "category", "condition", "offering_text", "wants_text", "photos"]);
    expect(await offerRow(db, offer.id)).toMatchObject({ status: "draft", revision: 1 });
  });
});

describe("who may write", () => {
  it("requires a signed-in caller", async () => {
    const offer = await offerIn(a, "draft");
    const result = await act({ id: "", client: anonClient() }, "publish", offer);
    expect(result.error?.code).toBe("42501"); // anon has no execute grant
  });

  it("gives another member 403 on an active offer and 404 otherwise, for every write (criterion 10)", async () => {
    for (const status of ["draft", "active", "paused", "closed"] as const) {
      const offer = await offerIn(a, status);
      const expected = status === "active" ? [403, "FORBIDDEN"] : [404, "NOT_FOUND"];
      const photoId = offer.photos[0]?.id;
      const attempts = [
        edit(b, offer, { title: "Mine now" }),
        act(b, "publish", offer),
        act(b, "pause", offer),
        act(b, "resume", offer),
        act(b, "close", offer),
        act(b, "delete_draft", offer),
        act(b, "photo_remove", offer, { p_photo_id: photoId }),
        act(b, "photo_reorder", offer, { p_photo_ids: [photoId] }),
        act(b, "photo_set_alt_text", offer, { p_photo_id: photoId, p_alt_text: "x" }),
      ];
      for (const attempt of await Promise.all(attempts)) {
        const result = failure(attempt);
        expect([status, result.status, result.code]).toEqual([status, ...expected]);
      }
      expect(await offerRow(db, offer.id)).toMatchObject({ status, revision: offer.revision });
    }
  });

  it("reports a missing offer as 404", async () => {
    const offer = await offerIn(a, "draft");
    const result = failure(await act(a, "publish", { ...offer, id: "00000000-0000-4000-8000-000000000000" }));
    expect([result.status, result.code]).toEqual([404, "NOT_FOUND"]);
  });
});

describe("field validation", () => {
  it("trims text and enforces draft limits and lists", async () => {
    const tooLong = failure(
      await rpc(a.client, "offer_create", {
        p_fields: { title: "x".repeat(81), description: "x".repeat(2001), category: "cars", condition: 3, owner_id: b.id },
        p_idempotency_key: newKey(),
      }),
    );
    expect(tooLong.status).toBe(422);
    expect(tooLong.detail.fields).toEqual({
      title: "too_long",
      description: "too_long",
      category: "invalid",
      condition: "invalid",
      owner_id: "unknown_field",
    });
    const atLimit = await createOffer(a, { title: ` ${"x".repeat(80)} `, wants_text: "y".repeat(200) });
    expect(atLimit.title).toHaveLength(80);
  });

  it("refuses an edit that would make an active or paused offer unpublishable (criterion 19)", async () => {
    for (const status of ["active", "paused"] as const) {
      const offer = await offerIn(a, status);
      const result = failure(await edit(a, offer, { title: "   ", category: null }));
      expect([result.status, result.detail.fields]).toEqual([422, ["title", "category"]]);
      expect(await offerRow(db, offer.id)).toMatchObject({ status, revision: offer.revision, title: "Road bike" });
      const valid = ok(await edit(a, offer, { title: "Road bike, 56 cm" }));
      expect(valid).toMatchObject({ status, title: "Road bike, 56 cm" });
    }
  });

  it("refuses removing the last photo of an active offer (criterion 19)", async () => {
    const offer = await offerIn(a, "active");
    const result = failure(await act(a, "photo_remove", offer, { p_photo_id: offer.photos[0]?.id }));
    expect([result.status, result.detail.fields]).toEqual([422, ["photos"]]);
    const photos = await db.query("select count(*)::int as n from public.offer_photos where offer_id = $1", [offer.id]);
    expect(photos.rows[0].n).toBe(1);
  });

  it("allows at most 8 photos", async () => {
    let offer = await publishableDraft(a, 8);
    expect(offer.photos).toHaveLength(8);
    const result = failure(await rpc(a.client, "offer_photo_add", {
      p_offer_id: offer.id, p_expected_status: "draft", p_expected_revision: offer.revision,
      p_photo_id: "11111111-1111-4111-8111-111111111111", p_width: 1, p_height: 1,
      p_request_hash: "0".repeat(64), p_idempotency_key: newKey(),
    }));
    expect([result.status, result.detail.fields]).toEqual([422, { photos: "too_many" }]);
    offer = await transition(a, "publish", offer);
    expect(offer.status).toBe("active");
  });

  it("refuses a photo row for files that were never uploaded", async () => {
    const offer = await createOffer(a);
    const result = failure(await rpc(a.client, "offer_photo_add", {
      p_offer_id: offer.id, p_expected_status: "draft", p_expected_revision: 1,
      p_photo_id: "22222222-2222-4222-8222-222222222222", p_width: 1, p_height: 1,
      p_request_hash: "0".repeat(64), p_idempotency_key: newKey(),
    }));
    expect([result.status, result.detail.fields]).toEqual([422, { photo: "file_missing" }]);
  });
});

describe("revision and content_version", () => {
  it("every kind of write increases revision by exactly one; only material writes bump content_version (criterion 11)", async () => {
    let offer = await addPhoto(a, await addPhoto(a, await createOffer(a, { title: "Kettle" })));
    const steps: [string, () => Promise<Offer>, boolean][] = [
      ["material edit (two fields)", async () => ok(await edit(a, offer, { title: "Steel kettle", description: "1.7 l" })), true],
      ["preference edit", async () => ok(await edit(a, offer, { wants_text: "A toaster" })), false],
      ["category edit", async () => ok(await edit(a, offer, { category: "home_garden" })), false],
      ["alt text", async () => ok(await act(a, "photo_set_alt_text", offer, { p_photo_id: offer.photos[0]?.id, p_alt_text: "Side view" })), false],
      ["reorder", async () => ok(await act(a, "photo_reorder", offer, { p_photo_ids: offer.photos.map((p) => p.id).reverse() })), false],
      ["photo add", async () => addPhoto(a, offer), true],
      ["photo remove", async () => ok(await act(a, "photo_remove", offer, { p_photo_id: offer.photos[0]?.id })), true],
      ["edit with unchanged material value", async () => ok(await edit(a, offer, { title: "Steel kettle" })), false],
    ];
    for (const [name, step, material] of steps) {
      const before = offer;
      offer = await step();
      expect([name, offer.revision, offer.content_version]).toEqual([
        name,
        before.revision + 1,
        before.content_version + (material ? 1 : 0),
      ]);
    }
    offer = ok(await edit(a, offer, { condition: "good", offering_text: "A kettle", wants_text: "A toaster" }));
    offer = await transition(a, "publish", offer);
    const before = offer;
    offer = await transition(a, "pause", offer);
    expect([offer.revision, offer.content_version]).toEqual([before.revision + 1, before.content_version]);
  });

  it("a stale expected_revision on any write returns 409 and changes nothing (criterion 31)", async () => {
    const offer = await publishableDraft(a, 2);
    const stale = { ...offer, revision: offer.revision - 1 };
    const photoIds = offer.photos.map((p) => p.id);
    const attempts = [
      edit(a, stale, { title: "New title" }),
      edit(a, stale, { wants_text: "Something else" }),
      edit(a, stale, { category: "other" }),
      act(a, "photo_set_alt_text", stale, { p_photo_id: photoIds[0], p_alt_text: "x" }),
      act(a, "photo_reorder", stale, { p_photo_ids: [...photoIds].reverse() }),
      act(a, "photo_remove", stale, { p_photo_id: photoIds[0] }),
      act(a, "publish", stale),
      act(a, "delete_draft", stale),
    ];
    for (const attempt of attempts) {
      const result = failure(await attempt);
      expect([result.status, result.detail.reason, result.detail.current_revision]).toEqual([409, "stale_revision", offer.revision]);
      expect((result.detail.offer as Offer).revision).toBe(offer.revision);
    }
    expect(await offerRow(db, offer.id)).toMatchObject({ revision: offer.revision, status: "draft" });
    expect(await auditCount(db, offer.id)).toBe(3); // create + 2 photo_add
  });

  it("a stale expected_status returns 409 status_changed with the current status", async () => {
    const offer = await offerIn(a, "active");
    const result = failure(await act(a, "pause", { ...offer, status: "draft" }));
    expect([result.status, result.detail]).toEqual([409, { reason: "status_changed", current_status: "active" }]);
  });
});

describe("photo order", () => {
  it("reorders by swapping positions in one statement, and renumbers after removal (criterion 32)", async () => {
    let offer = await publishableDraft(a, 3);
    const [p1, p2, p3] = offer.photos.map((p) => p.id);
    offer = ok(await act(a, "photo_reorder", offer, { p_photo_ids: [p3, p1, p2] }));
    expect(offer.photos.map((p) => [p.id, p.position])).toEqual([[p3, 1], [p1, 2], [p2, 3]]);
    offer = ok(await act(a, "photo_remove", offer, { p_photo_id: p1 }));
    expect(offer.photos.map((p) => [p.id, p.position])).toEqual([[p3, 1], [p2, 2]]);
    offer = await addPhoto(a, offer);
    expect(offer.photos.map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it("refuses a list with a missing, extra, repeated or foreign id", async () => {
    const offer = await publishableDraft(a, 2);
    const other = await publishableDraft(b, 1);
    const [p1, p2] = offer.photos.map((p) => p.id);
    for (const ids of [[p1], [p1, p2, other.photos[0]?.id], [p1, p1], [p1, other.photos[0]?.id]]) {
      const result = failure(await act(a, "photo_reorder", offer, { p_photo_ids: ids }));
      expect([result.status, result.detail.reason]).toEqual([409, "stale_revision"]);
    }
  });
});

describe("draft deletion", () => {
  it("deletes only drafts, queues their files, and keeps the delete audit event (criteria 9, 35)", async () => {
    const offer = await publishableDraft(a, 2);
    const paths = offer.photos.flatMap((p) => [p.display_path, p.thumb_path]).sort();
    const result = ok(await act(a, "delete_draft", offer)) as unknown as { deleted: boolean; cleanup_paths: string[] };
    expect(result.deleted).toBe(true);
    expect(result.cleanup_paths).toEqual(paths);
    expect(await offerRow(db, offer.id)).toBeUndefined();
    const photos = await db.query("select count(*)::int as n from public.offer_photos where offer_id = $1", [offer.id]);
    expect(photos.rows[0].n).toBe(0);
    const queued = await db.query("select path from private.storage_cleanup_queue where reason = 'draft_deleted' and path = any($1) order by path", [paths]);
    expect(queued.rows.map((r) => r.path)).toEqual(paths);
    const events = await db.query("select * from public.audit_events where entity_id = $1 and action = 'delete'", [offer.id]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toMatchObject({ actor_id: a.id, from_state: "draft", to_state: null });
    expect(Object.keys(events.rows[0]).sort()).toEqual(
      ["action", "actor_id", "content_version", "created_at", "entity_id", "entity_type", "from_state", "id", "revision", "to_state"],
    );
  });
});
