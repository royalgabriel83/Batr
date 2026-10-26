import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  auditCount,
  connect,
  createMember,
  failure,
  newKey,
  offerRow,
  ok,
  publishableDraft,
  rpc,
  sha256,
  uploadPhotoFiles,
  type Member,
} from "./support/db.ts";

// Idempotency (milestone-1.md, Idempotency; criteria 13, 22).

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

const publishArgs = (offerId: string, key: string | null, revision = 3) => ({
  p_offer_id: offerId,
  p_expected_status: "draft",
  p_expected_revision: revision,
  p_idempotency_key: key,
});

describe("idempotency keys", () => {
  it("are required: a missing key is 400 and changes nothing", async () => {
    const offer = await publishableDraft(a);
    const result = failure(await rpc(a.client, "offer_publish", publishArgs(offer.id, null, offer.revision)));
    expect([result.status, result.code]).toEqual([400, "IDEMPOTENCY_KEY_REQUIRED"]);
    const create = failure(await rpc(a.client, "offer_create", { p_fields: {} }));
    expect([create.status, create.code]).toEqual([400, "IDEMPOTENCY_KEY_REQUIRED"]);
    expect((await offerRow(db, offer.id))?.status).toBe("draft");
  });

  it("a retry with the same key returns the stored response, with no second change or audit event", async () => {
    const offer = await publishableDraft(a);
    const key = newKey();
    const first = ok(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision)));
    const retry = ok(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision)));
    expect(retry).toEqual(first);
    expect(await auditCount(db, offer.id, "publish")).toBe(1);
    expect((await offerRow(db, offer.id))?.revision).toBe(first.revision);
  });

  it("a completed key returns its response even after the offer has changed (no 409 on retry)", async () => {
    const offer = await publishableDraft(a);
    const key = newKey();
    const first = ok(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision)));
    ok(await rpc(a.client, "offer_pause", { p_offer_id: offer.id, p_expected_status: "active", p_expected_revision: first.revision, p_idempotency_key: newKey() }));
    expect(ok(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision)))).toEqual(first);
  });

  it("create retries return the same offer instead of a second one", async () => {
    const key = newKey();
    const first = ok(await rpc(a.client, "offer_create", { p_fields: { title: "Lamp" }, p_idempotency_key: key }));
    const retry = ok(await rpc(a.client, "offer_create", { p_fields: { title: "Lamp" }, p_idempotency_key: key }));
    expect(retry.id).toBe(first.id);
    const count = await db.query("select count(*)::int as n from public.offers where owner_id = $1 and title = 'Lamp'", [a.id]);
    expect(count.rows[0].n).toBe(1);
  });

  it("reusing a key with a different body, endpoint or resource is 422", async () => {
    const offer = await publishableDraft(a);
    const other = await publishableDraft(a);
    const key = newKey();
    ok(await rpc(a.client, "offer_edit", {
      p_offer_id: offer.id, p_expected_status: "draft", p_expected_revision: offer.revision,
      p_fields: { wants_text: "A tent" }, p_idempotency_key: key,
    }));
    const attempts = [
      rpc(a.client, "offer_edit", { p_offer_id: offer.id, p_expected_status: "draft", p_expected_revision: offer.revision, p_fields: { wants_text: "A kettle" }, p_idempotency_key: key }),
      rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision + 1)),
      rpc(a.client, "offer_edit", { p_offer_id: other.id, p_expected_status: "draft", p_expected_revision: other.revision, p_fields: { wants_text: "A tent" }, p_idempotency_key: key }),
    ];
    for (const attempt of await Promise.all(attempts)) {
      expect(failure(attempt)).toMatchObject({ status: 422, code: "IDEMPOTENCY_KEY_REUSED" });
    }
    expect((await offerRow(db, other.id))?.revision).toBe(other.revision);
  });

  it("two members using the same key never interact", async () => {
    const key = newKey();
    const mine = await publishableDraft(a);
    const theirs = await publishableDraft(b);
    ok(await rpc(a.client, "offer_publish", publishArgs(mine.id, key, mine.revision)));
    const result = ok(await rpc(b.client, "offer_publish", publishArgs(theirs.id, key, theirs.revision)));
    expect(result.status).toBe("active");
  });

  it("an expired key is treated as a new request, and the revision check still stops a double change", async () => {
    const offer = await publishableDraft(a);
    const key = newKey();
    ok(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision)));
    await db.query("update private.idempotency_keys set expires_at = now() - interval '1 second' where actor_id = $1 and key = $2", [a.id, key]);
    const result = failure(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision)));
    expect([result.status, result.detail.reason]).toEqual([409, "status_changed"]);
    expect(await auditCount(db, offer.id, "publish")).toBe(1);
  });

  it("a failed request leaves no key, so a retry runs normally", async () => {
    const offer = await publishableDraft(a);
    await db.query("update public.offers set title = 'Bike' where id = $1", [offer.id]);
    const key = newKey();
    expect(failure(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision))).status).toBe(422);
    const keys = await db.query("select count(*)::int as n from private.idempotency_keys where actor_id = $1 and key = $2", [a.id, key]);
    expect(keys.rows[0].n).toBe(0);
    await db.query("update public.offers set title = 'Road bike' where id = $1", [offer.id]);
    expect(ok(await rpc(a.client, "offer_publish", publishArgs(offer.id, key, offer.revision))).status).toBe("active");
  });

  it("an upload retried after it completed returns the stored response and queues the spare files", async () => {
    const offer = await publishableDraft(a, 0);
    const key = newKey();
    const hash = sha256("same file bytes and fields");
    const args = (photoId: string) => ({
      p_offer_id: offer.id, p_expected_status: "draft", p_expected_revision: offer.revision, p_photo_id: photoId,
      p_width: 10, p_height: 10, p_request_hash: hash, p_idempotency_key: key,
    });
    const firstFiles = await uploadPhotoFiles(a, offer.id);
    const first = ok(await rpc(a.client, "offer_photo_add", args(firstFiles.photoId)));
    const retryFiles = await uploadPhotoFiles(a, offer.id);
    const retry = ok(await rpc(a.client, "offer_photo_add", args(retryFiles.photoId)));
    expect(retry).toEqual(first);
    expect(retry.photos).toHaveLength(1);
    const queued = await db.query("select path from private.storage_cleanup_queue where reason = 'upload_replayed' and path = any($1) order by path", [[retryFiles.display, retryFiles.thumb]]);
    expect(queued.rows.map((r) => r.path)).toEqual([retryFiles.display, retryFiles.thumb].sort());
  });
});
