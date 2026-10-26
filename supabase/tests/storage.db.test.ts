import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_LINK_TTL_SECONDS } from "../../packages/shared/src/index.ts";
import {
  admin,
  anonClient,
  createMember,
  newKey,
  offerIn,
  ok,
  photoPaths,
  rpc,
  transition,
  uploadPhotoFiles,
  WEBP_BYTES,
  type Member,
  type Offer,
} from "./support/db.ts";

// Storage security with the real bucket and policies
// (milestone-1.md, Photos: Storage and access; Automated tests: Storage
// security; criteria 10, 23, 33, 34).

const BUCKET = "offer-photos";
let a: Member;
let b: Member;
let anon: SupabaseClient;

beforeAll(async () => {
  [a, b] = await Promise.all([createMember("alice"), createMember("bob")]);
  anon = anonClient();
});
afterAll(() => undefined);

const upload = (client: SupabaseClient, path: string, options: { contentType?: string; upsert?: boolean; body?: Buffer } = {}) =>
  client.storage.from(BUCKET).upload(path, options.body ?? WEBP_BYTES, {
    contentType: options.contentType ?? "image/webp",
    upsert: options.upsert ?? false,
  });

const sign = (client: SupabaseClient, path: string, seconds = PHOTO_LINK_TTL_SECONDS) =>
  client.storage.from(BUCKET).createSignedUrl(path, seconds);

async function exists(path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const { data } = await admin.storage.from(BUCKET).list(folder);
  return (data ?? []).some((file) => path.endsWith(`/${file.name}`));
}

const fetchStatus = async (url: string) => (await fetch(url)).status;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("the bucket", () => {
  it("is private and accepts only WebP files up to 2 MB", async () => {
    const { data } = await admin.storage.getBucket(BUCKET);
    expect(data).toMatchObject({ public: false, file_size_limit: 2 * 1024 * 1024, allowed_mime_types: ["image/webp"] });
  });
});

describe("uploads", () => {
  it("the owner can add files to their own draft, active and paused offers", async () => {
    for (const status of ["draft", "active", "paused"] as const) {
      const offer = await offerIn(a, status);
      await expect(uploadPhotoFiles(a, offer.id)).resolves.toBeTruthy();
    }
  });

  it("refuses a closed offer, another member's folder, another member's offer, a bad name, non-WebP and oversized files", async () => {
    const closed = await offerIn(a, "closed");
    const draft = await offerIn(a, "draft");
    const id = () => randomUUID();
    const attempts = [
      upload(a.client, photoPaths(a.id, closed.id, id()).display),
      upload(b.client, photoPaths(a.id, draft.id, id()).display),
      upload(b.client, photoPaths(b.id, draft.id, id()).display),
      upload(a.client, `${a.id}/${draft.id}/photo.webp`),
      upload(a.client, photoPaths(a.id, draft.id, id()).display, { contentType: "image/png" }),
      upload(a.client, photoPaths(a.id, draft.id, id()).display, { body: Buffer.alloc(2 * 1024 * 1024 + 1) }),
    ];
    for (const result of await Promise.all(attempts)) expect(result.error).not.toBeNull();
    expect(await uploadPhotoFiles(a, draft.id)).toBeTruthy();
  });

  it("nobody can overwrite or delete stored files directly, the owner included", async () => {
    const offer = await offerIn(a, "active");
    const path = offer.photos[0]?.display_path ?? "";
    expect((await upload(a.client, path)).error).not.toBeNull();
    expect((await upload(a.client, path, { upsert: true })).error).not.toBeNull();
    expect((await upload(b.client, path, { upsert: true })).error).not.toBeNull();
    for (const client of [a.client, b.client, anon]) await client.storage.from(BUCKET).remove([path]);
    expect(await exists(path)).toBe(true);
  });
});

describe("reading and signing", () => {
  let offers: Record<Offer["status"], Offer>;
  beforeAll(async () => {
    offers = {
      draft: await offerIn(a, "draft"),
      active: await offerIn(a, "active"),
      paused: await offerIn(a, "paused"),
      closed: await offerIn(a, "closed"),
    };
  });

  it("the owner can sign links for photos in every state", async () => {
    for (const offer of Object.values(offers)) {
      const { data, error } = await sign(a.client, offer.photos[0]?.thumb_path ?? "");
      expect(error).toBeNull();
      expect(await fetchStatus(data?.signedUrl ?? "")).toBe(200);
    }
  });

  it("others (members and signed-out visitors) can sign only active offers' photos", async () => {
    for (const client of [b.client, anon]) {
      for (const [status, offer] of Object.entries(offers)) {
        const { error } = await sign(client, offer.photos[0]?.display_path ?? "");
        expect([status, error === null]).toEqual([status, status === "active"]);
      }
    }
  });

  it("a file with no photo row cannot be read or signed by anyone, the owner included", async () => {
    const files = await uploadPhotoFiles(a, offers.draft.id);
    for (const client of [a.client, b.client, anon]) {
      expect((await sign(client, files.display)).error).not.toBeNull();
      expect((await client.storage.from(BUCKET).download(files.display)).error).not.toBeNull();
    }
  });

  it("signed links stop working after they expire", async () => {
    const { data } = await sign(anon, offers.active.photos[0]?.display_path ?? "", 1);
    expect(await fetchStatus(data?.signedUrl ?? "")).toBe(200);
    await sleep(2500);
    expect(await fetchStatus(data?.signedUrl ?? "")).not.toBe(200);
  });
});

describe("after pause, close, photo removal and draft deletion", () => {
  it("pause and close: no new link for others; a link issued earlier works until it expires", async () => {
    for (const action of ["pause", "close"]) {
      let offer = await offerIn(a, "active");
      const path = offer.photos[0]?.display_path ?? "";
      const early = (await sign(anon, path, 3)).data?.signedUrl ?? "";
      offer = await transition(a, action, offer);
      expect((await sign(anon, path)).error).not.toBeNull();
      expect((await sign(b.client, path)).error).not.toBeNull();
      expect((await sign(a.client, path)).error).toBeNull();
      expect(await fetchStatus(early)).toBe(200);
      await sleep(3500);
      expect(await fetchStatus(early)).not.toBe(200);
    }
  });

  it("photo removal and draft deletion: no new link for anyone, the owner included", async () => {
    let offer = await offerIn(a, "draft", 2);
    const removed = offer.photos[0];
    offer = ok(await rpc(a.client, "offer_photo_remove", {
      p_offer_id: offer.id, p_photo_id: removed?.id, p_expected_status: "draft",
      p_expected_revision: offer.revision, p_idempotency_key: newKey(),
    }));
    expect((await sign(a.client, removed?.display_path ?? "")).error).not.toBeNull();
    const remaining = offer.photos[0]?.display_path ?? "";
    expect((await sign(a.client, remaining)).error).toBeNull();
    ok(await rpc(a.client, "offer_delete_draft", {
      p_offer_id: offer.id, p_expected_status: "draft", p_expected_revision: offer.revision, p_idempotency_key: newKey(),
    }));
    expect((await sign(a.client, remaining)).error).not.toBeNull();
    // Files stay until the server deletes them from the cleanup queue (unit 06).
    expect(await exists(remaining)).toBe(true);
  });
});
