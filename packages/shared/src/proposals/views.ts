import type { Cash } from "./schemas.ts";
import type { ProposalStatus } from "./constants.ts";
import type { ProposalPermissions } from "./permissions.ts";

// What the proposal endpoints return (specs/milestone-3.md, API), for
// both apps. Members are named by role and display name only; photos
// are links signed with the viewer's session.

export type PartyRole = "proposer" | "owner";

export interface SnapshotPhotoView {
  width: number;
  height: number;
  alt_text: string;
  url: string | null;
  thumb_url: string | null;
}

export type ItemView =
  | {
      kind: "offer";
      offer_id: string;
      content_version: number;
      /** The listing has changed since these terms were written. */
      changed: boolean;
      snapshot: {
        /** Missing on snapshots taken before services (milestone 9): an item. */
        offer_type?: "item" | "service";
        title: string;
        description: string;
        condition: string | null;
        category: string | null;
        offering_text: string;
        wants_text: string;
        photo: SnapshotPhotoView | null;
      };
    }
  | { kind: "text"; description: string };

export interface RevisionView {
  id: string;
  number: number;
  author: PartyRole;
  gives: ItemView[];
  gets: ItemView[];
  cash: Cash | null;
  note: string;
  created_at: string;
}

export interface ProposalPartyView {
  display_name: string | null;
}

export interface OfferChoiceView {
  id: string;
  title: string;
  thumb_url: string | null;
}

export interface ProposalView {
  id: string;
  offer_id: string;
  status: ProposalStatus;
  close_reason: "offer_closed" | "blocked" | null;
  revision: number;
  latest_revision_id: string;
  latest_author: PartyRole;
  turn: PartyRole | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  viewer_role: PartyRole;
  proposer: ProposalPartyView;
  owner: ProposalPartyView;
  offer: { id: string; title: string; status: string } | null;
  agreement_id: string | null;
  changed_offer_ids: string[];
  actions: ProposalPermissions;
  gives_choices: OfferChoiceView[];
  revisions: RevisionView[];
}

export interface ProposalSummaryView {
  id: string;
  offer_id: string;
  status: ProposalStatus;
  close_reason: "offer_closed" | "blocked" | null;
  revision: number;
  latest_author: PartyRole;
  turn: PartyRole | null;
  expires_at: string;
  updated_at: string;
  viewer_role: PartyRole;
  proposer: ProposalPartyView;
  owner: ProposalPartyView;
  latest: RevisionView;
}
