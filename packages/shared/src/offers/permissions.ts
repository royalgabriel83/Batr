import type { OfferStatus } from "./constants.ts";
import type { OfferRuleError } from "./errors.ts";
import type { MemberId } from "./ids.ts";

// Permission rules from specs/state-model.md §2 (Privacy of non-active
// offers) and specs/milestone-1.md (Authorization, Error states).

export type Actor = { kind: "member"; id: MemberId } | { kind: "anonymous" };

/** The parts of an offer that permissions depend on. */
export type OfferAccess = { owner_id: MemberId; status: OfferStatus };

export type OfferRole = "owner" | "member" | "anonymous";

export function offerRole(actor: Actor, offer: OfferAccess): OfferRole {
  if (actor.kind === "anonymous") return "anonymous";
  return actor.id === offer.owner_id ? "owner" : "member";
}

/** Only active offers are visible to anyone other than their owner. */
export function isPubliclyVisible(status: OfferStatus): boolean {
  return status === "active";
}

/** Any signed-in member may create a draft. */
export function canCreateOffer(actor: Actor): OfferRuleError | null {
  return actor.kind === "member" ? null : { code: "UNAUTHENTICATED" };
}

/**
 * Reading: anyone may read an active offer; other states only by the
 * owner. To everyone else a non-active offer does not exist (404, never
 * 403), so its state is never revealed.
 */
export function canReadOffer(actor: Actor, offer: OfferAccess): OfferRuleError | null {
  if (isPubliclyVisible(offer.status) || offerRole(actor, offer) === "owner") return null;
  return { code: "NOT_FOUND" };
}

/**
 * Writing (edits, photo changes, transitions, draft delete): owner only.
 * Signed out → 401. Another member → 403 on an active offer (which they
 * can see), otherwise 404.
 */
export function canWriteOffer(actor: Actor, offer: OfferAccess): OfferRuleError | null {
  const role = offerRole(actor, offer);
  if (role === "anonymous") return { code: "UNAUTHENTICATED" };
  if (role === "owner") return null;
  return isPubliclyVisible(offer.status) ? { code: "FORBIDDEN" } : { code: "NOT_FOUND" };
}
