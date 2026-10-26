import type { OfferCategory, OfferType } from "@batr/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readSaved } from "@/server/api/marks";
import { readMarketplace } from "@/server/api/offers";
import type { OfferSummary, OwnerOffer, PublicOffer, SavedItem } from "@/lib/offers/types";
import { OFFER_SELECT, offerSummaries, offerView, readOffer, type OfferRow } from "@/server/api/views";

// Reads for server-rendered offer pages, with the member's own session
// (row-level security decides what exists) and the same views as the
// API, so a page and the API never disagree.

export type OwnOfferLookup =
  | { kind: "own"; offer: OwnerOffer }
  /** An active offer that belongs to someone else: they can't change it. */
  | { kind: "not_owner" }
  /** Doesn't exist, or isn't readable: never says which. */
  | { kind: "missing" };

export async function loadOwnOffer(memberId: string, offerId: string): Promise<OwnOfferLookup> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return { kind: "missing" };
  const client = await createSupabaseServerClient();
  const row = await readOffer(client, offerId);
  if (!row) return { kind: "missing" };
  if (row.owner_id !== memberId) return { kind: "not_owner" };
  return { kind: "own", offer: (await offerView(client, row, memberId)) as OwnerOffer };
}

/** Every offer the member owns, most recently changed first. */
export async function loadMyOffers(memberId: string): Promise<OfferSummary[]> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("offers")
    .select(OFFER_SELECT)
    .eq("owner_id", memberId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (await offerSummaries(client, data as unknown as OfferRow[], memberId)) as OfferSummary[];
}

/** An offer as this viewer may see it (anyone for active; the owner otherwise), or null. */
export async function loadOfferForViewer(viewerId: string | null, offerId: string): Promise<PublicOffer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return null;
  const client = await createSupabaseServerClient();
  const row = await readOffer(client, offerId);
  if (!row) return null;
  // Only the owner ever reads a non-active offer (row-level security); checked here too.
  if (row.status !== "active" && row.owner_id !== viewerId) return null;
  return (await offerView(client, row, viewerId)) as PublicOffer;
}

/** One marketplace page for the viewer, as the API returns it. */
export async function loadMarketplace(viewerId: string | null, category: OfferCategory | null, cursor: string | null = null, type: OfferType | null = null) {
  const client = await createSupabaseServerClient();
  const page = await readMarketplace(client, viewerId, category, cursor, type);
  return { offers: page.offers as OfferSummary[], next_cursor: page.next_cursor };
}

/** One page of the member's saved offers, newest saved first, as the API returns it. */
export async function loadSaved(memberId: string, cursor: string | null = null) {
  const client = await createSupabaseServerClient();
  const page = await readSaved(client, memberId, cursor);
  return { items: page.items as SavedItem[], next_cursor: page.next_cursor };
}
