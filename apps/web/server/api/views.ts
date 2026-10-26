import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PHOTO_LINK_TTL_SECONDS,
  type OfferArea,
  type OfferExchangeMode,
  type OfferHandoverMethod,
  type OfferStatus,
  type OfferType,
} from "@batr/shared";

// What the API returns for offers. Storage paths and owner ids never
// leave the server; photos are returned as signed links created with
// the viewer's own session, so storage applies its read policy at
// signing time (milestone-1.md, Storage and access).

export const BUCKET = "offer-photos";

/** An offer row as the database functions and table reads return it. */
export interface OfferRow {
  id: string;
  owner_id: string;
  offer_type: OfferType;
  title: string;
  description: string;
  category: string | null;
  condition: string | null;
  offering_text: string;
  wants_text: string;
  area: OfferArea | null;
  exchange_mode: OfferExchangeMode | null;
  handover_methods: OfferHandoverMethod[];
  status: OfferStatus;
  content_version: number;
  revision: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  closed_at: string | null;
  /** Set when a moderator removed the offer (milestone-6.md, S5). */
  removed_at?: string | null;
  photos?: PhotoRow[];
  offer_photos?: PhotoRow[];
  owner?: { display_name: string | null; created_at: string } | null;
}

export interface PhotoRow {
  id: string;
  position: number;
  display_path: string;
  thumb_path: string;
  width: number;
  height: number;
  alt_text: string;
}

export interface PhotoView {
  id: string;
  position: number;
  width: number;
  height: number;
  alt_text: string;
  url: string | null;
  thumb_url: string | null;
}

/** Signed links for many paths at once; a path the viewer may not read maps to null. */
export async function signPaths(client: SupabaseClient, paths: string[]): Promise<Map<string, string | null>> {
  const links = new Map<string, string | null>(paths.map((path) => [path, null]));
  if (paths.length === 0) return links;
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, PHOTO_LINK_TTL_SECONDS);
  if (error) throw error;
  for (const item of data) if (item.path && !item.error) links.set(item.path, item.signedUrl);
  return links;
}

const photosOf = (row: OfferRow) => [...(row.photos ?? row.offer_photos ?? [])].sort((a, b) => a.position - b.position);

function photoView(photo: PhotoRow, links: Map<string, string | null>): PhotoView {
  return {
    id: photo.id,
    position: photo.position,
    width: photo.width,
    height: photo.height,
    alt_text: photo.alt_text,
    url: links.get(photo.display_path) ?? null,
    thumb_url: links.get(photo.thumb_path) ?? null,
  };
}

const memberSince = (createdAt: string | undefined) => (createdAt ? createdAt.slice(0, 7) : null);

/** Public fields only (milestone-1.md, Authorization), plus owner-only fields for the owner. */
function offerFields(row: OfferRow, viewerId: string | null) {
  const isOwner = viewerId !== null && row.owner_id === viewerId;
  const base = {
    id: row.id,
    offer_type: row.offer_type,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    offering_text: row.offering_text,
    wants_text: row.wants_text,
    // General area and logistics only: BATR stores no address or coordinates.
    area: row.area,
    exchange_mode: row.exchange_mode,
    handover_methods: row.handover_methods,
    status: row.status,
    revision: row.revision,
    published_at: row.published_at,
    owner: { display_name: row.owner?.display_name ?? null, member_since: memberSince(row.owner?.created_at) },
    is_owner: isOwner,
  };
  return isOwner
    ? {
        ...base,
        content_version: row.content_version,
        created_at: row.created_at,
        updated_at: row.updated_at,
        closed_at: row.closed_at,
        removed_at: row.removed_at ?? null,
      }
    : base;
}

/**
 * The viewer's own likes and saves among these offers. Read with the
 * viewer's session, so row-level security returns only their rows.
 * Empty for visitors who aren't signed in.
 */
export async function viewerMarks(client: SupabaseClient, viewerId: string | null, offerIds: string[]) {
  const marks = { liked: new Set<string>(), saved: new Set<string>() };
  if (!viewerId || offerIds.length === 0) return marks;
  const [likes, saves] = await Promise.all([
    client.from("offer_likes").select("offer_id").eq("member_id", viewerId).in("offer_id", offerIds),
    client.from("offer_saves").select("offer_id").eq("member_id", viewerId).in("offer_id", offerIds),
  ]);
  if (likes.error) throw likes.error;
  if (saves.error) throw saves.error;
  for (const row of likes.data as { offer_id: string }[]) marks.liked.add(row.offer_id);
  for (const row of saves.data as { offer_id: string }[]) marks.saved.add(row.offer_id);
  return marks;
}

type Marks = Awaited<ReturnType<typeof viewerMarks>>;

/** `liked` and `saved` for a signed-in viewer who doesn't own the offer; nothing otherwise. */
function markFields(row: OfferRow, viewerId: string | null, marks: Marks) {
  if (!viewerId || row.owner_id === viewerId) return {};
  return { liked: marks.liked.has(row.id), saved: marks.saved.has(row.id) };
}

/** Full offer with every photo's display and thumbnail link. */
export async function offerView(client: SupabaseClient, row: OfferRow, viewerId: string | null) {
  const photos = photosOf(row);
  const [links, marks] = await Promise.all([
    signPaths(client, photos.flatMap((p) => [p.display_path, p.thumb_path])),
    viewerMarks(client, viewerId, [row.id]),
  ]);
  return { ...offerFields(row, viewerId), ...markFields(row, viewerId, marks), photos: photos.map((p) => photoView(p, links)) };
}

/** List entries: the cover photo's thumbnail only. */
export async function offerSummaries(client: SupabaseClient, rows: OfferRow[], viewerId: string | null) {
  const covers = rows.map((row) => photosOf(row)[0] ?? null);
  const [links, marks] = await Promise.all([
    signPaths(client, covers.flatMap((c) => (c ? [c.thumb_path] : []))),
    viewerMarks(client, viewerId, rows.map((row) => row.id)),
  ]);
  return rows.map((row, i) => {
    const cover = covers[i];
    return {
      ...offerFields(row, viewerId),
      ...markFields(row, viewerId, marks),
      photo_count: photosOf(row).length,
      cover: cover
        ? { id: cover.id, width: cover.width, height: cover.height, alt_text: cover.alt_text, thumb_url: links.get(cover.thumb_path) ?? null }
        : null,
    };
  });
}

/** Columns read for an offer, with its owner's public profile and photos. The owner is named by its foreign key: saves and likes also join offers to profiles. */
export const OFFER_SELECT =
  "id, owner_id, offer_type, title, description, category, condition, offering_text, wants_text, area, exchange_mode, handover_methods, status, content_version, revision, created_at, updated_at, published_at, closed_at, removed_at, owner:profiles!offers_owner_id_fkey(display_name, created_at), offer_photos(id, position, display_path, thumb_path, width, height, alt_text)";

/** Reads one offer as the viewer may see it, or null (RLS hides what they may not). */
export async function readOffer(client: SupabaseClient, id: string): Promise<OfferRow | null> {
  const { data, error } = await client.from("offers").select(OFFER_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as OfferRow | null;
}
