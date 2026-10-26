import type { OfferCategory, OfferCondition, OfferStatus, OfferType } from "./constants.ts";
import type { ApiErrorCode } from "./errors.ts";
import type { OfferArea, OfferExchangeMode, OfferHandoverMethod } from "./location.ts";

// Offer shapes as the offer API returns them (server/api/views.ts).
// The web reads them on the server and in the browser; the mobile app
// receives them from the API.

export interface OfferPhoto {
  id: string;
  position: number;
  width: number;
  height: number;
  alt_text: string;
  url: string | null;
  thumb_url: string | null;
}

export interface OfferOwner {
  display_name: string | null;
  /** "YYYY-MM" of account creation. */
  member_since: string | null;
}

/** What the owner sees of their own offer. */
export interface OwnerOffer {
  id: string;
  /** Milestone 9, V1; existing offers are items. */
  offer_type: OfferType;
  title: string;
  description: string;
  category: OfferCategory | null;
  condition: OfferCondition | null;
  offering_text: string;
  wants_text: string;
  /** General area only ("Bodija, Ibadan"); BATR stores no address or coordinates. */
  area: OfferArea | null;
  exchange_mode: OfferExchangeMode | null;
  handover_methods: OfferHandoverMethod[];
  status: OfferStatus;
  revision: number;
  content_version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  /** Set when BATR removed the offer (milestone-6.md, S5). */
  removed_at: string | null;
  owner: OfferOwner;
  is_owner: boolean;
  /** The signed-in viewer's own like and save; absent when signed out or for the owner. */
  liked?: boolean;
  saved?: boolean;
  photos: OfferPhoto[];
}

/** What anyone may see of an offer (owner-only fields left out; `removed_at` is there for the owner). */
export type PublicOffer = Omit<OwnerOffer, "content_version" | "created_at" | "updated_at" | "closed_at" | "removed_at"> &
  Partial<Pick<OwnerOffer, "removed_at">>;

/** One row of a list: the cover thumbnail only. */
export interface OfferSummary extends Omit<OwnerOffer, "photos"> {
  photo_count: number;
  cover: { id: string; width: number; height: number; alt_text: string; thumb_url: string | null } | null;
}

/** One saved offer; `offer` is null when it is no longer available (never says why). */
export interface SavedItem {
  offer_id: string;
  saved_at: string;
  offer: OfferSummary | null;
}

export interface ApiErrorBody {
  /** API codes, plus NETWORK when no response arrived. */
  code: ApiErrorCode | "NETWORK";
  message: string;
  fields?: Record<string, string>;
  reason?: "status_changed" | "stale_revision";
  current_status?: OfferStatus | null;
  current_revision?: number;
  offer?: OwnerOffer;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiErrorBody };
