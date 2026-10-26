// Shared setup for tests against the real local Supabase. Members are
// real Auth users signed in with their own sessions; the service key is
// used only here, to create those users and to inspect storage.
import { createHash, randomUUID } from "node:crypto";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run the tests with \`pnpm test:db\`.`);
  return value;
}

const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const dbUrl = required("SUPABASE_DB_URL");

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: test setup and inspection only. */
export const admin = createClient(url, serviceKey, clientOptions);

export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, clientOptions);
}

export type Member = { id: string; client: SupabaseClient };

export async function createMember(label: string): Promise<Member> {
  const email = `${label}-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (created.error) throw created.error;
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, client };
}

export const newKey = (): string => randomUUID();
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export type Photo = { id: string; position: number; display_path: string; thumb_path: string; alt_text: string };
export type Offer = {
  id: string;
  owner_id: string;
  status: "draft" | "active" | "paused" | "closed";
  title: string;
  wants_text: string;
  category: string | null;
  revision: number;
  content_version: number;
  photos: Photo[];
};

export type RpcResult<T> = { data: T | null; error: PostgrestError | null };

export async function rpc<T = Offer>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error } = await client.rpc(fn, args);
  return { data: data as T | null, error };
}

/** HTTP status, API code and JSON detail of a function error. */
export function failure(result: RpcResult<unknown>): { status: number; code: string; detail: Record<string, unknown> } {
  const error = result.error;
  if (!error) throw new Error(`Expected an error, got ${JSON.stringify(result.data)}`);
  const status = /^PT\d{3}$/.test(error.code) ? Number(error.code.slice(2)) : NaN;
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(error.details) as Record<string, unknown>;
  } catch {
    // not one of our errors
  }
  return { status, code: error.message, detail };
}

export function ok<T>(result: RpcResult<T>): T {
  if (result.error) throw new Error(`${result.error.code} ${result.error.message} ${result.error.details}`);
  return result.data as T;
}

export const PUBLISHABLE_FIELDS = {
  title: "Road bike",
  description: "Steel frame, 56 cm.",
  category: "sports_outdoors",
  condition: "good",
  offering_text: "A road bike",
  wants_text: "A camping tent",
};

/** The smallest file the bucket accepts: WebP header bytes, image/webp. */
export const WEBP_BYTES = Buffer.from("RIFF\x1a\x00\x00\x00WEBPVP8L\x0d\x00\x00\x00\x2f\x00\x00\x00\x10\x07\x10\x11\x11\x88\x88\xfe\x07\x00", "latin1");

export const photoPaths = (ownerId: string, offerId: string, photoId: string) => ({
  display: `${ownerId}/${offerId}/${photoId}-display.webp`,
  thumb: `${ownerId}/${offerId}/${photoId}-thumb.webp`,
});

/** Uploads a photo's two files with the member's own session, as the API will. */
export async function uploadPhotoFiles(member: Member, offerId: string, photoId = randomUUID()) {
  const paths = photoPaths(member.id, offerId, photoId);
  for (const path of [paths.display, paths.thumb]) {
    const { error } = await member.client.storage
      .from("offer-photos")
      .upload(path, WEBP_BYTES, { contentType: "image/webp", upsert: false });
    if (error) throw error;
  }
  return { photoId, ...paths };
}

export async function createOffer(member: Member, fields: Record<string, unknown> = {}): Promise<Offer> {
  return ok(await rpc(member.client, "offer_create", { p_fields: fields, p_idempotency_key: newKey() }));
}

export async function addPhoto(member: Member, offer: Offer, altText = ""): Promise<Offer> {
  const { photoId } = await uploadPhotoFiles(member, offer.id);
  return ok(
    await rpc(member.client, "offer_photo_add", {
      p_offer_id: offer.id,
      p_expected_status: offer.status,
      p_expected_revision: offer.revision,
      p_photo_id: photoId,
      p_width: 1600,
      p_height: 1200,
      p_request_hash: sha256(photoId),
      p_alt_text: altText,
      p_idempotency_key: newKey(),
    }),
  );
}

export async function transition(member: Member, action: string, offer: Offer): Promise<Offer> {
  return ok(
    await rpc(member.client, `offer_${action}`, {
      p_offer_id: offer.id,
      p_expected_status: offer.status,
      p_expected_revision: offer.revision,
      p_idempotency_key: newKey(),
    }),
  );
}

export async function edit(member: Member, offer: Offer, fields: Record<string, unknown>): Promise<RpcResult<Offer>> {
  return rpc(member.client, "offer_edit", {
    p_offer_id: offer.id,
    p_expected_status: offer.status,
    p_expected_revision: offer.revision,
    p_fields: fields,
    p_idempotency_key: newKey(),
  });
}

/** A draft that passes every publish rule, with `photos` photos. */
export async function publishableDraft(member: Member, photos = 1): Promise<Offer> {
  let offer = await createOffer(member, PUBLISHABLE_FIELDS);
  for (let i = 0; i < photos; i += 1) offer = await addPhoto(member, offer);
  return offer;
}

export async function offerIn(member: Member, status: Offer["status"], photos = 1): Promise<Offer> {
  let offer = await publishableDraft(member, photos);
  if (status === "draft") return offer;
  offer = await transition(member, "publish", offer);
  if (status === "paused") offer = await transition(member, "pause", offer);
  if (status === "closed") offer = await transition(member, "close", offer);
  return offer;
}

// Direct database connections (as the database owner) -----------------

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

/** Runs SQL inside an open transaction as `memberId`, the way PostgREST does. */
export async function beginAsMember(db: pg.Client, memberId: string): Promise<void> {
  await db.query("begin");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: memberId, role: "authenticated" }),
  ]);
}

export async function auditCount(db: pg.Client, offerId: string, action?: string): Promise<number> {
  const result = await db.query<{ n: string }>(
    "select count(*) as n from public.audit_events where entity_id = $1 and ($2::text is null or action = $2)",
    [offerId, action ?? null],
  );
  return Number(result.rows[0]?.n);
}

export async function offerRow(db: pg.Client, offerId: string) {
  const result = await db.query<{ status: string; revision: number; content_version: number; title: string }>(
    "select status, revision, content_version, title from public.offers where id = $1",
    [offerId],
  );
  return result.rows[0];
}

/** Resolves to "pending" if `promise` has not settled after `ms`. */
export async function stillPending(promise: Promise<unknown>, ms = 400): Promise<boolean> {
  const marker = Symbol("pending");
  const winner = await Promise.race([promise.then(() => null), new Promise((r) => setTimeout(() => r(marker), ms))]);
  return winner === marker;
}
