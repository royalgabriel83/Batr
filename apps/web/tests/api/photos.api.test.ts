import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import type pg from "pg";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as close from "@/app/api/v1/offers/[id]/close/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as photo from "@/app/api/v1/offers/[id]/photos/[photoId]/route";
import * as photoUrls from "@/app/api/v1/offers/[id]/photo-urls/route";
import * as cleanup from "@/app/api/internal/storage-cleanup/route";
import { PHOTO_MESSAGES } from "@batr/shared";
import { storageUrl, TEST_STORAGE_URL_SETTING } from "@/server/storage/deleter";
import { PUBLISHABLE_FIELDS, admin, call, connect, expectations, member, phoneJpeg, photoForm, png, randomUUID, webp, type ApiMember } from "./support";

// Photos (milestone-1.md, Photos; Deletion, revocation and cleanup;
// Caching): processing, format and size checks, idempotent uploads,
// file deletion after commit, a storage failure during deletion, and
// the storage cleanup job. The job works on the whole queue and bucket,
// so its tests live in this file, never running beside the failure test.

let a: ApiMember;
let db: pg.Client;
const CRON_SECRET = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
beforeAll(async () => {
  a = await member("alice");
  db = await connect();
  process.env.CRON_SECRET = CRON_SECRET;
});
afterAll(async () => {
  await db.end();
});
afterEach(() => {
  Reflect.deleteProperty(process.env, TEST_STORAGE_URL_SETTING);
});

type Photo = { id: string; width: number; height: number; url: string | null; thumb_url: string | null };
type Offer = { id: string; status: string; revision: number; photos: Photo[] };

const BUCKET = "offer-photos";
const folder = (o: Offer) => `${a.id}/${o.id}`;
const paths = (o: Offer, p: { id: string }) => [`${folder(o)}/${p.id}-display.webp`, `${folder(o)}/${p.id}-thumb.webp`];

async function draft(): Promise<Offer> {
  return (await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as: a, body: PUBLISHABLE_FIELDS })).body.data as Offer;
}

const upload = (o: Offer, bytes: Uint8Array, name = "photo.jpg", type = "image/jpeg", key?: string) =>
  call<Offer>(photos.POST, "POST", `/api/v1/offers/${o.id}/photos`, { as: a, form: photoForm(bytes, o, name, type), params: { id: o.id }, key });

async function storedFiles(o: Offer): Promise<string[]> {
  const { data, error } = await admin.storage.from(BUCKET).list(folder(o));
  if (error) throw error;
  return data.map((f) => f.name).sort();
}

async function download(path: string): Promise<Buffer | null> {
  const { data } = await admin.storage.from(BUCKET).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

async function queued(list: string[]) {
  const { rows } = await db.query<{ path: string; reason: string; attempts: number; last_error: string | null }>(
    "select path, reason, attempts, last_error from private.storage_cleanup_queue where path = any($1) order by path",
    [list],
  );
  return rows;
}

/** Runs the storage cleanup job the way a scheduler or `pnpm cleanup:storage` does. */
const runCleanup = (secret: string | null = CRON_SECRET) =>
  call(cleanup.POST, "POST", "/api/internal/storage-cleanup", { key: null, headers: secret === null ? {} : { authorization: `Bearer ${secret}` } });

const fetchStatus = async (url: string) => (await fetch(url)).status;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("processing", () => {
  it("re-encodes a phone JPEG: rotation applied, all metadata (GPS included) removed, two WebP sizes", async () => {
    const original = await phoneJpeg(3000, 2000);
    const input = await sharp(original).metadata();
    expect([input.orientation, Boolean(input.exif), original.includes("TestCam")]).toEqual([6, true, true]); // GPS and camera data really present
    const result = await upload(await draft(), original);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    const o = result.body.data as Offer;
    const p = o.photos[0] as Photo;
    // Orientation 6 (rotated 90°): 3000×2000 is shown as 2000×3000.
    expect([p.width, p.height]).toEqual([1067, 1600]);
    const [displayPath, thumbPath] = paths(o, p);
    for (const [path, size] of [[displayPath, [1067, 1600]], [thumbPath, [533, 800]]] as const) {
      const file = (await download(path as string)) as Buffer;
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["webp", ...size]);
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(file.includes("Exif")).toBe(false);
      expect(file.includes("TestCam")).toBe(false);
    }
    expect(await storedFiles(o)).toEqual([`${p.id}-display.webp`, `${p.id}-thumb.webp`]);
  });

  it("accepts PNG and WebP and never enlarges small photos", async () => {
    let o = await draft();
    const fromPng = await upload(o, await png(800, 600), "a.png", "image/png");
    expect(fromPng.status).toBe(201);
    o = fromPng.body.data as Offer;
    const fromWebp = await upload(o, await webp(300, 200), "b.webp", "image/webp");
    expect(fromWebp.status).toBe(201);
    expect(fromWebp.body.data?.photos.map((p) => [p.width, p.height])).toEqual([[800, 600], [300, 200]]);
  });

  it.each([
    ["a PDF renamed to .jpg", Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n"), "UNSUPPORTED_FORMAT", PHOTO_MESSAGES.unsupported],
    ["a HEIC file sent as JPEG (browser check bypassed)", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(64)]), "UNSUPPORTED_FORMAT", PHOTO_MESSAGES.heic],
    ["a broken JPEG", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]), "UNSUPPORTED_FORMAT", PHOTO_MESSAGES.unsupported],
    ["a 12 MB image", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12 * 1024 * 1024)]), "VALIDATION_FAILED", PHOTO_MESSAGES.tooLarge],
  ])("refuses %s with 422 and stores nothing", async (_name, bytes, code, message) => {
    const o = await draft();
    const result = await upload(o, bytes);
    expect([result.status, result.body.error?.code, result.body.error?.message]).toEqual([422, code, message]);
    expect(result.body.error?.fields).toEqual({ file: message });
    expect(await storedFiles(o)).toEqual([]);
  });
});

describe("idempotent and refused uploads", () => {
  it("the same key and file returns the first response without storing anything again; another file with that key is 422", async () => {
    const o = await draft();
    const bytes = await png(400, 300);
    const key = randomUUID();
    const first = await upload(o, bytes, "a.png", "image/png", key);
    const again = await upload(o, bytes, "a.png", "image/png", key);
    expect(again.status).toBe(201);
    expect(again.body.data?.photos.map((p) => p.id)).toEqual(first.body.data?.photos.map((p) => p.id));
    expect(await storedFiles(o)).toHaveLength(2);
    const other = await upload(o, await png(401, 300), "a.png", "image/png", key);
    expect(other.body.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("two concurrent uploads with the same key add one photo, and the spare files are deleted", async () => {
    const o = await draft();
    const bytes = await png(500, 300);
    const key = randomUUID();
    const results = await Promise.all([upload(o, bytes, "a.png", "image/png", key), upload(o, bytes, "a.png", "image/png", key)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(new Set(results.map((r) => r.body.data?.photos.map((p) => p.id).join()))).toHaveProperty("size", 1);
    expect(results[0]?.body.data?.photos).toHaveLength(1);
    expect(await storedFiles(o)).toHaveLength(2);
  });

  it("a database refusal after the files were stored (stale revision) deletes those files", async () => {
    const o = await draft();
    const result = await upload({ ...o, revision: o.revision + 5 }, await png());
    expect(result.body.error?.reason).toBe("stale_revision");
    expect(await storedFiles(o)).toEqual([]);
    const { rows } = await db.query("select count(*)::int as n from private.storage_cleanup_queue where path like $1", [`${folder(o)}/%`]);
    expect(rows[0].n).toBe(0);
  });

  it("an upload to a closed offer is 409 and stores nothing", async () => {
    let o = (await upload(await draft(), await png())).body.data as Offer;
    o = (await call<Offer>(publish.POST, "POST", "", { as: a, body: expectations(o), params: { id: o.id } })).body.data as Offer;
    const closed = (await call<Offer>(close.POST, "POST", "", { as: a, body: expectations(o), params: { id: o.id } })).body.data as Offer;
    const before = await storedFiles(closed);
    const result = await upload(closed, await png());
    expect(result.status).toBe(409);
    expect(await storedFiles(closed)).toEqual(before);
  });
});

describe("caching", () => {
  it("stored files may be reused for at most the link lifetime (600 s)", async () => {
    const o = (await upload(await draft(), await png())).body.data as Offer;
    const p = o.photos[0] as Photo;
    const { data } = await admin.storage.from(BUCKET).list(folder(o));
    for (const file of data ?? []) expect(file.metadata?.cacheControl).toBe("max-age=600");
    // Local storage does not send the stored header on signed downloads;
    // whatever it sends must not allow reuse beyond the link lifetime.
    // (The hosted CDN is checked at the deployment milestone.)
    const response = await fetch(p.url as string);
    expect(response.status).toBe(200);
    const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1];
    expect(maxAge === undefined || Number(maxAge) <= 600).toBe(true);
  });
});

describe("deletion and revocation", () => {
  it("removing a photo deletes its files at once, ending a link issued earlier", async () => {
    let o = await draft();
    o = (await upload(o, await png())).body.data as Offer;
    o = (await upload(o, await png())).body.data as Offer;
    const gone = o.photos[0] as Photo;
    expect(await fetchStatus(gone.url as string)).toBe(200);
    const result = await call<Offer>(photo.DELETE, "DELETE", "", { as: a, params: { id: o.id, photoId: gone.id }, body: expectations(o) });
    expect(result.status).toBe(200);
    expect(await fetchStatus(gone.url as string)).not.toBe(200);
    expect(await storedFiles(o)).not.toContain(`${gone.id}-display.webp`);
    expect(await queued(paths(o, gone))).toEqual([]);
  });

  it("deleting a draft deletes every file and empties the queue; its audit event remains", async () => {
    let o = await draft();
    o = (await upload(o, await png())).body.data as Offer;
    const link = o.photos[0]?.url as string;
    const result = await call(offer.DELETE, "DELETE", "", { as: a, params: { id: o.id }, body: expectations(o) });
    expect(result.status).toBe(200);
    expect(await fetchStatus(link)).not.toBe(200);
    expect(await storedFiles(o)).toEqual([]);
    expect(await queued(paths(o, o.photos[0] as Photo))).toEqual([]);
    const { rows } = await db.query("select action, from_state, to_state from public.audit_events where entity_id = $1 and action = 'delete'", [o.id]);
    expect(rows).toEqual([{ action: "delete", from_state: "draft", to_state: null }]);
  });

  it("if storage cannot be reached during deletion: rows gone, paths queued with the error, no new links, old links expire, cleanup later deletes", async () => {
    let o = await draft();
    o = (await upload(o, await png())).body.data as Offer;
    o = (await upload(o, await png())).body.data as Offer;
    const gone = o.photos[0] as Photo;
    const files = paths(o, gone);
    // A link issued just before, with a short test lifetime.
    const { data: shortLink } = await a.client.storage.from(BUCKET).createSignedUrl(files[0] as string, 3);
    expect(await fetchStatus(shortLink?.signedUrl as string)).toBe(200);

    process.env[TEST_STORAGE_URL_SETTING] = "http://127.0.0.1:9"; // nothing listens there
    const result = await call<Offer>(photo.DELETE, "DELETE", "", { as: a, params: { id: o.id, photoId: gone.id }, body: expectations(o) });
    expect(result.status).toBe(200);
    expect(result.body.data?.photos.map((p) => p.id)).not.toContain(gone.id);

    const { rows: photoRows } = await db.query("select id from public.offer_photos where id = $1", [gone.id]);
    expect(photoRows).toEqual([]);
    const { rows: audit } = await db.query("select count(*)::int as n from public.audit_events where entity_id = $1 and action = 'photo_remove'", [o.id]);
    expect(audit[0].n).toBe(1);
    const queue = await queued(files);
    expect(queue.map((q) => [q.path, q.reason, q.attempts])).toEqual(files.map((f) => [f, "photo_removed", 1]).sort());
    expect(queue.every((q) => q.last_error)).toBe(true);

    // Nobody, the owner included, can obtain a new link.
    const fresh = await call(photoUrls.GET, "GET", "", { as: a, params: { id: o.id } });
    expect(fresh.body.data.map((p: Photo) => p.id)).not.toContain(gone.id);
    const { data: ownerSign } = await a.client.storage.from(BUCKET).createSignedUrl(files[0] as string, 60);
    expect(ownerSign).toBeNull();

    // The earlier link still works until it expires, then stops, although the file is still stored.
    expect(await fetchStatus(shortLink?.signedUrl as string)).toBe(200);
    await sleep(4000);
    expect(await fetchStatus(shortLink?.signedUrl as string)).not.toBe(200);
    expect(await download(files[0] as string)).not.toBeNull();

    // The cleanup job while storage is still unreachable: the entries stay queued, one more attempt each.
    const retried = await runCleanup();
    expect(retried.status).toBe(200);
    expect(retried.body.data.queue.failed).toBeGreaterThanOrEqual(2);
    expect((await queued(files)).map((q) => q.attempts)).toEqual([2, 2]);
    expect(await download(files[0] as string)).not.toBeNull();

    // Storage reachable again: the cleanup job deletes the files and empties the queue.
    Reflect.deleteProperty(process.env, TEST_STORAGE_URL_SETTING);
    const cleaned = await runCleanup();
    expect(cleaned.status).toBe(200);
    expect(cleaned.body.data.queue.deleted).toBeGreaterThanOrEqual(2);
    for (const file of files) expect(await download(file)).toBeNull();
    expect(await queued(files)).toEqual([]);
  });

  it("the unreachable-storage setting is refused in production", () => {
    process.env[TEST_STORAGE_URL_SETTING] = "http://127.0.0.1:9";
    const nodeEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(() => storageUrl()).toThrow(/refused in production/);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
    }
  });
});

describe("storage cleanup job", () => {
  /** Puts a file straight into the member's own folder, with no photo row, as a member bypassing the API could. */
  async function strayFile(o: Offer): Promise<string> {
    const path = `${folder(o)}/${randomUUID()}-display.webp`;
    const { error } = await a.client.storage.from(BUCKET).upload(path, await webp(), { contentType: "image/webp", upsert: false });
    if (error) throw error;
    return path;
  }
  const storedAgo = (path: string, hours: number) =>
    db.query("update storage.objects set created_at = now() - make_interval(hours => $2) where bucket_id = $3 and name = $1", [path, hours, BUCKET]);

  it("deletes files with no photo row once they are older than 24 hours, and keeps newer ones and real photos", async () => {
    let o = await draft();
    o = (await upload(o, await png())).body.data as Offer;
    const real = paths(o, o.photos[0] as Photo);
    const old = await strayFile(o);
    const recent = await strayFile(o);
    await storedAgo(old, 25);
    await storedAgo(recent, 23);
    for (const file of real) await storedAgo(file, 48);

    const result = await runCleanup();
    expect(result.status).toBe(200);
    expect(result.body.data.orphans.deleted).toBeGreaterThanOrEqual(1);
    expect(await download(old)).toBeNull();
    expect(await download(recent)).not.toBeNull();
    for (const file of real) expect(await download(file)).not.toBeNull();
    // The real photo still opens for its owner.
    const urls = await call(photoUrls.GET, "GET", "", { as: a, params: { id: o.id } });
    expect(await fetchStatus(urls.body.data[0].url)).toBe(200);
  });

  it("removes expired idempotency keys and keeps live ones", async () => {
    const expired = randomUUID();
    const live = randomUUID();
    await db.query(
      `insert into private.idempotency_keys (actor_id, key, endpoint, request_hash, created_at, expires_at)
       values ($1, $2, 'test', 'x', now() - interval '2 days', now() - interval '1 day'), ($1, $3, 'test', 'x', now(), now() + interval '1 day')`,
      [a.id, expired, live],
    );
    const result = await runCleanup();
    expect(result.status).toBe(200);
    expect(result.body.data.idempotency_keys.deleted).toBeGreaterThanOrEqual(1);
    const { rows } = await db.query("select key from private.idempotency_keys where key = any($1)", [[expired, live]]);
    expect(rows.map((r) => r.key)).toEqual([live]);
  });

  it("runs only with the cron secret: missing, wrong, or a member's session is refused, and nothing is cached", async () => {
    const memberToken = await call(cleanup.POST, "POST", "/api/internal/storage-cleanup", { as: a, key: null });
    for (const result of [await runCleanup(null), await runCleanup("not-the-secret"), memberToken]) {
      expect(result.status).toBe(401);
      expect(result.body.error?.code).toBe("UNAUTHENTICATED");
      expect(result.headers.get("cache-control")).toBe("private, no-store");
    }
    expect((await runCleanup()).headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses every call when no cron secret is configured", async () => {
    process.env.CRON_SECRET = "";
    try {
      expect((await runCleanup("")).status).toBe(401);
      expect((await runCleanup(null)).status).toBe(401);
    } finally {
      process.env.CRON_SECRET = CRON_SECRET;
    }
  });
});
