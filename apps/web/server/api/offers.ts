import {
  CreateOfferInputSchema,
  EditOfferInputSchema,
  OFFER_CATEGORY_IDS,
  OfferActionInputSchema,
  PhotoAltTextInputSchema,
  ReorderPhotosInputSchema,
  OFFER_STATUSES,
  OFFER_TYPE_IDS,
  type OfferCategory,
  type OfferStatus,
  type OfferType,
} from "@batr/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteQueuedFiles } from "@/server/storage/deleter";
import { getCaller, requireId, requireIdempotencyKey, requireMember } from "./auth";
import { parseBody } from "./body";
import { callFunction, ownerOfferView } from "./db";
import { ApiError, ok } from "./respond";
import { OFFER_SELECT, offerSummaries, offerView, readOffer, signPaths, type OfferRow } from "./views";

// The offer endpoints (specs/milestone-1.md, API). Every mutation:
// signed in, Idempotency-Key, body checked with the shared schemas,
// then one database function that locks the offer, checks owner,
// expected status and revision, writes, audits and stores the response.

type Transition = "publish" | "pause" | "resume" | "close";
type DeleteResponse = { id: string; deleted: true; cleanup_paths: string[] };
type PhotoRemoveResponse = OfferRow & { cleanup_paths: string[] };

export async function createOffer(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const fields = await parseBody(request, CreateOfferInputSchema);
  const row = await callFunction<OfferRow>(caller, "offer_create", { p_fields: fields, p_idempotency_key: key });
  return ok(await ownerOfferView(caller, row), 201);
}

export async function editOffer(request: Request, offerId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const id = requireId(offerId);
  const body = await parseBody(request, EditOfferInputSchema);
  const row = await callFunction<OfferRow>(caller, "offer_edit", {
    p_offer_id: id,
    p_expected_status: body.expected_status,
    p_expected_revision: body.expected_revision,
    p_fields: body.fields,
    p_idempotency_key: key,
  });
  return ok(await ownerOfferView(caller, row));
}

export async function transitionOffer(request: Request, offerId: string, action: Transition): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const id = requireId(offerId);
  const body = await parseBody(request, OfferActionInputSchema);
  const row = await callFunction<OfferRow>(caller, `offer_${action}`, {
    p_offer_id: id,
    p_expected_status: body.expected_status,
    p_expected_revision: body.expected_revision,
    p_idempotency_key: key,
  });
  return ok(await ownerOfferView(caller, row));
}

export async function deleteDraft(request: Request, offerId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const id = requireId(offerId);
  const body = await parseBody(request, OfferActionInputSchema);
  const result = await callFunction<DeleteResponse>(caller, "offer_delete_draft", {
    p_offer_id: id,
    p_expected_status: body.expected_status,
    p_expected_revision: body.expected_revision,
    p_idempotency_key: key,
  });
  await deleteQueuedFiles(result.cleanup_paths);
  return ok({ id: result.id, deleted: true });
}

export async function removePhoto(request: Request, offerId: string, photoId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const id = requireId(offerId);
  const photo = requireId(photoId);
  const body = await parseBody(request, OfferActionInputSchema);
  const { cleanup_paths: paths, ...row } = await callFunction<PhotoRemoveResponse>(caller, "offer_photo_remove", {
    p_offer_id: id,
    p_photo_id: photo,
    p_expected_status: body.expected_status,
    p_expected_revision: body.expected_revision,
    p_idempotency_key: key,
  });
  await deleteQueuedFiles(paths);
  return ok(await ownerOfferView(caller, row));
}

export async function reorderPhotos(request: Request, offerId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const id = requireId(offerId);
  const body = await parseBody(request, ReorderPhotosInputSchema);
  const row = await callFunction<OfferRow>(caller, "offer_photo_reorder", {
    p_offer_id: id,
    p_photo_ids: body.photo_ids,
    p_expected_status: body.expected_status,
    p_expected_revision: body.expected_revision,
    p_idempotency_key: key,
  });
  return ok(await ownerOfferView(caller, row));
}

export async function setPhotoAltText(request: Request, offerId: string, photoId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const id = requireId(offerId);
  const photo = requireId(photoId);
  const body = await parseBody(request, PhotoAltTextInputSchema);
  const row = await callFunction<OfferRow>(caller, "offer_photo_set_alt_text", {
    p_offer_id: id,
    p_photo_id: photo,
    p_alt_text: body.alt_text,
    p_expected_status: body.expected_status,
    p_expected_revision: body.expected_revision,
    p_idempotency_key: key,
  });
  return ok(await ownerOfferView(caller, row));
}

// Reads ----------------------------------------------------------------

export async function getOffer(request: Request, offerId: string): Promise<Response> {
  const caller = await getCaller(request);
  const row = await readOffer(caller.client, requireId(offerId));
  // Row-level security hides non-active offers from everyone but the owner.
  if (!row) throw new ApiError("NOT_FOUND");
  return ok(await offerView(caller.client, row, caller.user?.id ?? null));
}

export async function getPhotoUrls(request: Request, offerId: string): Promise<Response> {
  const caller = await getCaller(request);
  const row = await readOffer(caller.client, requireId(offerId));
  if (!row) throw new ApiError("NOT_FOUND");
  const photos = row.offer_photos ?? [];
  const links = await signPaths(caller.client, photos.flatMap((p) => [p.display_path, p.thumb_path]));
  return ok(
    [...photos]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, url: links.get(p.display_path) ?? null, thumb_url: links.get(p.thumb_path) ?? null })),
  );
}

export const PAGE_SIZE = 20;

/** Cursor: the last entry's published_at and id, so pages never skip or repeat. */
function encodeCursor(row: OfferRow): string {
  return Buffer.from(JSON.stringify([row.published_at, row.id])).toString("base64url");
}

/** Exactly the timestamp form the database returns, so nothing else reaches the filter. */
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function decodeCursor(cursor: string): { publishedAt: string; id: string } {
  try {
    const [publishedAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as [unknown, unknown];
    if (typeof publishedAt === "string" && CURSOR_TIME.test(publishedAt) && typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)) {
      return { publishedAt, id };
    }
  } catch {
    // fall through
  }
  throw new ApiError("VALIDATION_FAILED", { fields: { cursor: "This page link is no longer valid." } });
}

export async function listMarketplace(request: Request): Promise<Response> {
  const caller = await getCaller(request);
  const params = new URL(request.url).searchParams;
  const category = params.get("category");
  if (category && !OFFER_CATEGORY_IDS.includes(category as OfferCategory)) {
    throw new ApiError("VALIDATION_FAILED", { fields: { category: "Choose a category from the list." } });
  }
  // Milestone 9, V5: items, services, or both when absent.
  const type = params.get("type");
  if (type && !OFFER_TYPE_IDS.includes(type as OfferType)) {
    throw new ApiError("VALIDATION_FAILED", { fields: { type: "Choose items or services." } });
  }
  return ok(
    await readMarketplace(
      caller.client,
      caller.user?.id ?? null,
      (category as OfferCategory | null) || null,
      params.get("cursor"),
      (type as OfferType | null) || null,
    ),
  );
}

export interface MarketplacePage {
  offers: Awaited<ReturnType<typeof offerSummaries>>;
  next_cursor: string | null;
}

/**
 * One page of active offers, newest first, as the viewer's client may
 * read them. Used by the API and by the marketplace page, so both list
 * the same offers in the same order.
 */
export async function readMarketplace(
  client: SupabaseClient,
  viewerId: string | null,
  category: OfferCategory | null,
  cursor: string | null,
  type: OfferType | null = null,
): Promise<MarketplacePage> {
  let query = client
    .from("offers")
    .select(OFFER_SELECT)
    .eq("status", "active")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (category) query = query.eq("category", category);
  if (type) query = query.eq("offer_type", type);
  if (cursor) {
    const { publishedAt, id } = decodeCursor(cursor);
    query = query.or(`published_at.lt."${publishedAt}",and(published_at.eq."${publishedAt}",id.lt.${id})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data as unknown as OfferRow[];
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    offers: await offerSummaries(client, page, viewerId),
    next_cursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

export async function listMyOffers(request: Request): Promise<Response> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  const status = new URL(request.url).searchParams.get("status");
  if (status && !OFFER_STATUSES.includes(status as OfferStatus)) {
    throw new ApiError("VALIDATION_FAILED", { fields: { status: "Choose draft, active, paused or closed." } });
  }
  let query = caller.client
    .from("offers")
    .select(OFFER_SELECT)
    .eq("owner_id", caller.user.id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return ok({ offers: await offerSummaries(caller.client, data as unknown as OfferRow[], caller.user.id) });
}
