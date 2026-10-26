import type { OfferStatus } from "../offers/constants.ts";
import type { ProposalAction, ProposalBox, ProposalStatus } from "./constants.ts";

// Who may do what on a proposal (specs/state-model.md §5;
// specs/milestone-3.md, Rules and validation). The database functions
// repeat every rule; these drive the UI and early checks.

/** The parts of a proposal that permissions depend on. */
export interface ProposalAccess {
  status: ProposalStatus;
  proposer_id: string;
  owner_id: string;
  /** Author of the latest revision. */
  latest_author_id: string;
  expires_at: string;
}

/** `open` past its expiry reads as `expired`, before the sweep records it (P3). */
export function effectiveStatus(proposal: Pick<ProposalAccess, "status" | "expires_at">, now: Date): ProposalStatus {
  return proposal.status === "open" && Date.parse(proposal.expires_at) <= now.getTime() ? "expired" : proposal.status;
}

/** The member whose turn it is: the party who did not write the latest terms. */
export function turnPartyId(proposal: ProposalAccess): string {
  return proposal.latest_author_id === proposal.owner_id ? proposal.proposer_id : proposal.owner_id;
}

export type ProposalPermissions = Record<ProposalAction, boolean>;

const NONE: ProposalPermissions = { counter: false, accept: false, decline: false, withdraw: false };

/** The actions `viewerId` may take now. Only the two parties ever get any. */
export function proposalActions(proposal: ProposalAccess, viewerId: string | null, now: Date): ProposalPermissions {
  if (viewerId === null || effectiveStatus(proposal, now) !== "open") return NONE;
  if (viewerId !== proposal.proposer_id && viewerId !== proposal.owner_id) return NONE;
  const turn = turnPartyId(proposal) === viewerId;
  return { counter: turn, accept: turn, decline: turn, withdraw: !turn };
}

/** Which Exchanges tab a proposal sits under for `viewerId`. */
export function proposalBox(proposal: ProposalAccess, viewerId: string, now: Date): ProposalBox {
  if (effectiveStatus(proposal, now) !== "open") return "closed";
  return turnPartyId(proposal) === viewerId ? "turn" : "waiting";
}

export type ProposeBlock = "sign_in" | "own_offer" | "unavailable";

/**
 * Whether the viewer may start a proposal on an offer (milestone-3.md,
 * Create): signed in, not the owner, offer active. The "one open
 * proposal per member and offer" rule is the database's.
 */
export function canPropose(viewerId: string | null, offer: { owner_id: string; status: OfferStatus }): ProposeBlock | null {
  if (offer.status !== "active") return "unavailable";
  if (viewerId === null) return "sign_in";
  if (viewerId === offer.owner_id) return "own_offer";
  return null;
}
