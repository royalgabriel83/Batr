import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  addPhoto,
  auditCount,
  beginAsMember,
  connect,
  createMember,
  edit,
  failure,
  newKey,
  offerIn,
  offerRow,
  ok,
  publishableDraft,
  rpc,
  sha256,
  stillPending,
  uploadPhotoFiles,
  type Member,
  type Offer,
  type RpcResult,
} from "./support/db.ts";

// Races (milestone-1.md, Concurrency table; criteria 13, 21, 29, 31, 32).
// The first request runs inside an open transaction on a direct
// connection, as the member, so it holds the offer lock; the second
// goes through the API gateway and must wait for it.

let a: Member;
let db: pg.Client;
let observer: pg.Client;

beforeAll(async () => {
  a = await createMember("alice");
  [db, observer] = await Promise.all([connect(), connect()]);
});
afterAll(async () => {
  await Promise.all([db.end(), observer.end()]);
});

const call = (fn: string, args: Record<string, unknown>) =>
  `select public.${fn}(${Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`;

/** Runs `fn` as the member in an open transaction; returns its result and a commit. */
async function holdLock(fn: string, args: Record<string, unknown>) {
  await beginAsMember(db, a.id);
  const result = await db.query(call(fn, args), Object.values(args));
  return { result: result.rows[0].result as Offer, commit: () => db.query("commit") };
}

const keyed = (args: Record<string, unknown>) => ({ ...args, p_idempotency_key: newKey() });
const expected = (offer: Offer) => ({ p_offer_id: offer.id, p_expected_status: offer.status, p_expected_revision: offer.revision });

/** Holds the lock with `first`, sends `second`, checks it waits, then commits. */
async function race(first: [string, Record<string, unknown>], second: () => Promise<RpcResult<Offer>>) {
  const held = await holdLock(first[0], keyed(first[1]));
  const waiting = second();
  expect(await stillPending(waiting)).toBe(true);
  await held.commit();
  return { first: held.result, second: await waiting };
}

async function assertValid(offerId: string) {
  const row = await observer.query(
    "select o.status, private.offer_publish_failures(o.id) as failures from public.offers o where o.id = $1",
    [offerId],
  );
  const { status, failures } = row.rows[0] as { status: string; failures: string[] };
  if (status === "active" || status === "paused") expect(failures).toEqual([]);
}

describe("races from the Concurrency table", () => {
  it("edit clears the title while publish runs: the edit gets 409, never an active offer with no title", async () => {
    const offer = await publishableDraft(a);
    const { second } = await race(["offer_publish", expected(offer)], () => edit(a, offer, { title: "" }));
    expect([failure(second).status, failure(second).detail.reason]).toEqual([409, "status_changed"]);
    expect(await offerRow(observer, offer.id)).toMatchObject({ status: "active", title: "Road bike" });
    await assertValid(offer.id);
  });

  it("publish while an edit clears the title: publish gets 409, the draft keeps the edit", async () => {
    const offer = await publishableDraft(a);
    const { second } = await race(
      ["offer_edit", { ...expected(offer), p_fields: { title: "" } }],
      () => rpc(a.client, "offer_publish", keyed(expected(offer))),
    );
    expect([failure(second).status, failure(second).detail.reason]).toEqual([409, "stale_revision"]);
    expect(await offerRow(observer, offer.id)).toMatchObject({ status: "draft", title: "" });
  });

  it("remove the last photo while publish runs: never active with 0 photos", async () => {
    const offer = await publishableDraft(a);
    const { second } = await race(
      ["offer_photo_remove", { p_offer_id: offer.id, p_photo_id: offer.photos[0]?.id, p_expected_status: "draft", p_expected_revision: offer.revision }],
      () => rpc(a.client, "offer_publish", keyed(expected(offer))),
    );
    expect(failure(second).status).toBe(409);
    expect((await offerRow(observer, offer.id))?.status).toBe("draft");
  });

  it("edit while pause runs: the edit gets 409 with the new status", async () => {
    const offer = await offerIn(a, "active");
    const { second } = await race(["offer_pause", expected(offer)], () => edit(a, offer, { wants_text: "A tent" }));
    expect(failure(second).detail).toEqual({ reason: "status_changed", current_status: "paused" });
  });

  it("upload completes after close: 409, no photo row, files queued for cleanup", async () => {
    const offer = await offerIn(a, "active");
    const files = await uploadPhotoFiles(a, offer.id);
    const { second } = await race(["offer_close", expected(offer)], () =>
      rpc(a.client, "offer_photo_add", keyed({ ...expected(offer), p_photo_id: files.photoId, p_width: 1, p_height: 1, p_request_hash: sha256(files.photoId) })),
    );
    expect(failure(second).detail).toEqual({ reason: "status_changed", current_status: "closed" });
    ok(await rpc(a.client, "offer_photo_files_abandon", { p_paths: [files.display, files.thumb] }));
    const photos = await observer.query("select count(*)::int as n from public.offer_photos where id = $1", [files.photoId]);
    expect(photos.rows[0].n).toBe(0);
    const queued = await observer.query("select count(*)::int as n from private.storage_cleanup_queue where path = any($1) and reason = 'upload_abandoned'", [[files.display, files.thumb]]);
    expect(queued.rows[0].n).toBe(2);
  });

  it("pause and close at the same moment: one succeeds, the other gets 409, one audit event each", async () => {
    const offer = await offerIn(a, "active");
    const { second } = await race(["offer_pause", expected(offer)], () => rpc(a.client, "offer_close", keyed(expected(offer))));
    expect(failure(second).status).toBe(409);
    expect((await offerRow(observer, offer.id))?.status).toBe("paused");
    expect([await auditCount(observer, offer.id, "pause"), await auditCount(observer, offer.id, "close")]).toEqual([1, 0]);
  });

  it("two edits from two windows: the second gets 409 stale_revision and changes nothing", async () => {
    for (const fields of [[{ title: "Window one" }, { title: "Window two" }], [{ wants_text: "A tent" }, { category: "other" }]]) {
      const offer = await publishableDraft(a);
      const { first, second } = await race(
        ["offer_edit", { ...expected(offer), p_fields: fields[0] }],
        () => edit(a, offer, fields[1] ?? {}),
      );
      expect(failure(second).detail).toMatchObject({ reason: "stale_revision", current_revision: first.revision });
      expect((await offerRow(observer, offer.id))?.revision).toBe(first.revision);
    }
  });

  it("two reorders at the same moment: the first applies, the second gets 409", async () => {
    const offer = await publishableDraft(a, 3);
    const ids = offer.photos.map((p) => p.id);
    const { first, second } = await race(
      ["offer_photo_reorder", { p_offer_id: offer.id, p_photo_ids: [...ids].reverse(), p_expected_status: "draft", p_expected_revision: offer.revision }],
      () => rpc(a.client, "offer_photo_reorder", keyed({ ...expected(offer), p_photo_ids: [ids[1], ids[0], ids[2]] })),
    );
    expect(failure(second).detail.reason).toBe("stale_revision");
    expect(first.photos.map((p) => p.id)).toEqual([...ids].reverse());
  });

  it("reorder while a photo is added: positions stay 1..n", async () => {
    let offer = await publishableDraft(a, 2);
    const files = await uploadPhotoFiles(a, offer.id);
    const { second } = await race(
      ["offer_photo_add", { ...expected(offer), p_photo_id: files.photoId, p_width: 1, p_height: 1, p_request_hash: sha256(files.photoId) }],
      () => rpc(a.client, "offer_photo_reorder", keyed({ ...expected(offer), p_photo_ids: offer.photos.map((p) => p.id).reverse() })),
    );
    expect(failure(second).detail.reason).toBe("stale_revision");
    offer = ok(await rpc(a.client, "offer_photo_reorder", keyed({ ...expected({ ...offer, revision: offer.revision + 1 }), p_photo_ids: [files.photoId, ...offer.photos.map((p) => p.id)] })));
    expect(offer.photos.map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it("alt text edited while the title is edited: the second gets 409", async () => {
    const offer = await publishableDraft(a);
    const { second } = await race(
      ["offer_edit", { ...expected(offer), p_fields: { title: "Road bike, red" } }],
      () => rpc(a.client, "offer_photo_set_alt_text", keyed({ ...expected(offer), p_photo_id: offer.photos[0]?.id, p_alt_text: "Front" })),
    );
    expect(failure(second).detail.reason).toBe("stale_revision");
  });
});

describe("parallel requests through the API gateway", () => {
  it("two publishes with different keys at the same moment: one transition, one audit event (criterion 13)", async () => {
    const offer = await publishableDraft(a);
    const results = await Promise.all([1, 2].map(() => rpc(a.client, "offer_publish", keyed(expected(offer)))));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(failure(results.find((r) => r.error) as RpcResult<Offer>).status).toBe(409);
    expect(await auditCount(observer, offer.id, "publish")).toBe(1);
  });

  it("two publishes with the same key at the same moment: the same response, one audit event (criterion 13)", async () => {
    const offer = await publishableDraft(a);
    const args = keyed(expected(offer));
    const results = await Promise.all([1, 2, 3].map(() => rpc(a.client, "offer_publish", args)));
    expect(results.map((r) => r.error)).toEqual([null, null, null]);
    expect(new Set(results.map((r) => JSON.stringify(r.data))).size).toBe(1);
    expect(await auditCount(observer, offer.id, "publish")).toBe(1);
  });

  it("a same-key retry waits for the first and gets its stored response", async () => {
    const offer = await publishableDraft(a);
    const args = keyed(expected(offer));
    const held = await holdLock("offer_publish", args);
    const retry = rpc(a.client, "offer_publish", args);
    expect(await stillPending(retry)).toBe(true);
    await held.commit();
    expect(ok(await retry)).toEqual(held.result);
  });
});

describe("atomicity (fault injection, criterion 21)", () => {
  it("a failure after the state change leaves no state change, audit event, key or queued cleanup", async () => {
    const victim = await createMember("victim");
    const offer = await publishableDraft(victim, 2);
    // Fails the last step (storing the response with the key), only for this member.
    await observer.query(`
      create or replace function private.test_fail_finish() returns trigger language plpgsql as $$
      begin raise exception 'injected failure'; end $$;
      create trigger test_fail_finish before update on private.idempotency_keys
      for each row when (new.actor_id = '${victim.id}') execute function private.test_fail_finish();`);
    try {
      const before = await auditCount(observer, offer.id);
      const key = newKey();
      for (const [fn, extra] of [["offer_publish", {}], ["offer_delete_draft", {}], ["offer_photo_remove", { p_photo_id: offer.photos[0]?.id }]] as const) {
        const result = await rpc(victim.client, fn, { ...expected(offer), ...extra, p_idempotency_key: key });
        expect(result.error?.message).toMatch(/injected failure/);
      }
      expect(await offerRow(observer, offer.id)).toMatchObject({ status: "draft", revision: offer.revision });
      expect(await auditCount(observer, offer.id)).toBe(before);
      const photos = await observer.query("select count(*)::int as n from public.offer_photos where offer_id = $1", [offer.id]);
      expect(photos.rows[0].n).toBe(2);
      const keys = await observer.query("select count(*)::int as n from private.idempotency_keys where actor_id = $1 and key = $2", [victim.id, key]);
      expect(keys.rows[0].n).toBe(0);
      const queued = await observer.query("select count(*)::int as n from private.storage_cleanup_queue where path like $1", [`${victim.id}/${offer.id}/%`]);
      expect(queued.rows[0].n).toBe(0);
    } finally {
      await observer.query("drop trigger test_fail_finish on private.idempotency_keys; drop function private.test_fail_finish();");
    }
    const fresh = await addPhoto(victim, offer);
    expect(fresh.photos).toHaveLength(3);
  });
});
