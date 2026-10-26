import type { Cash } from "../proposals/schemas.ts";
import type { OfferType } from "../offers/constants.ts";
import type { ItemView, OfferChoiceView, PartyRole, ProposalPartyView } from "../proposals/views.ts";
import type { AgreementStatus, VersionOutcome } from "./constants.ts";
import type { AgreementPermissions } from "./permissions.ts";
import type { ProblemReason } from "../safety/constants.ts";

// What the agreement endpoints return (specs/milestone-4.md, API), for
// both apps. Parties are named by role; no member ids.

export interface VersionView {
  id: string;
  number: number;
  proposed_by: PartyRole;
  outcome: VersionOutcome;
  gives: ItemView[];
  gets: ItemView[];
  cash: Cash | null;
  note: string;
  created_at: string;
  resolved_at: string | null;
}

interface AgreementCoreView {
  id: string;
  proposal_id: string;
  status: AgreementStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  viewer_role: PartyRole;
  proposer: ProposalPartyView;
  owner: ProposalPartyView;
  offer: { id: string; title: string; status: string } | null;
  binding_version_id: string;
  confirmed_by: PartyRole[];
  pending_by: PartyRole | null;
  cancel_requested_by: PartyRole | null;
  /** Milestone 8, D2: handover and changes wait while BATR reviews a problem. */
  paused: boolean;
  actions: AgreementPermissions;
  waits_on_viewer: boolean;
}

export interface AgreementView extends AgreementCoreView {
  versions: VersionView[];
  confirmations: { party: PartyRole; version_id: string; confirmed_at: string }[];
  cancellation: {
    id: string;
    requested_by: PartyRole;
    reason: string;
    created_at: string;
    outcome: "accepted" | "rejected" | "withdrawn" | null;
    resolved_at: string | null;
  } | null;
  listing_changed: boolean;
  pending_changed_offer_ids: string[];
  fee: {
    total_kobo: number;
    owner_share_kobo: number;
    proposer_share_kobo: number;
    requires_reconfirmation: boolean;
  } | null;
  my_listed_offers: { id: string; title: string; offer_type: OfferType }[];
  problem: AgreementProblemView;
  gives_choices: OfferChoiceView[];
}

/** Milestone 8, D1 and D2. The other member is never told who reported it. */
export interface AgreementProblemView {
  can_report: boolean;
  paused: boolean;
  current: {
    status: "open" | "reviewed";
    /** Only for the member who reported it. */
    reason: ProblemReason | null;
    reported_by_you: boolean;
    created_at: string;
    reviewed_at: string | null;
    can_reply: boolean;
    replied: boolean;
  } | null;
}

export interface AgreementSummaryView extends AgreementCoreView {
  terms: VersionView;
}
