import type { AgreementAction, AgreementBox, AgreementStatus } from "./constants.ts";

// Who may do what on an agreement (specs/state-model.md §6 with D4 and
// A3; specs/milestone-4.md, Rules and validation). The database
// functions repeat every rule; these drive the UI and the counts.

/** The parts of an agreement that permissions depend on. */
export interface AgreementAccess {
  status: AgreementStatus;
  proposer_id: string;
  owner_id: string;
  /** Parties who confirmed their handover. */
  confirmed_by: string[];
  /** Who proposed the pending change, if one is pending. */
  pending_by: string | null;
  /** Who asked to cancel, if a request is open. */
  cancel_requested_by: string | null;
  /** Milestone 8, D2: an exchange problem is open; no handover and no change until BATR reviews it. */
  paused?: boolean;
}

export type AgreementPermissions = Record<AgreementAction, boolean>;

const NONE: AgreementPermissions = {
  handover: false,
  propose_change: false,
  accept_change: false,
  reject_change: false,
  withdraw_change: false,
  request_cancel: false,
  accept_cancel: false,
  reject_cancel: false,
  withdraw_cancel: false,
};

const isParty = (agreement: AgreementAccess, viewerId: string | null): viewerId is string =>
  viewerId !== null && (viewerId === agreement.proposer_id || viewerId === agreement.owner_id);

/** The actions `viewerId` may take now. Only the two parties ever get any. */
export function agreementActions(agreement: AgreementAccess, viewerId: string | null): AgreementPermissions {
  if (!isParty(agreement, viewerId)) return NONE;
  const actions = statusActions(agreement, viewerId);
  return agreement.paused ? { ...actions, handover: false, propose_change: false, accept_change: false } : actions;
}

function statusActions(agreement: AgreementAccess, viewerId: string): AgreementPermissions {
  switch (agreement.status) {
    case "active":
      return {
        ...NONE,
        handover: !agreement.confirmed_by.includes(viewerId),
        // D4: changes only before anyone has handed over.
        propose_change: agreement.confirmed_by.length === 0,
        // A3: still allowed after a handover.
        request_cancel: true,
      };
    case "amendment_pending": {
      const mine = agreement.pending_by === viewerId;
      return { ...NONE, accept_change: !mine, reject_change: !mine, withdraw_change: mine };
    }
    case "cancellation_requested": {
      const mine = agreement.cancel_requested_by === viewerId;
      return { ...NONE, accept_cancel: !mine, reject_cancel: !mine, withdraw_cancel: mine };
    }
    default:
      return NONE;
  }
}

/**
 * A5: the agreement waits on the viewer: a change or cancellation to
 * answer, or a handover to confirm after the other party has.
 */
export function agreementWaitsOn(agreement: AgreementAccess, viewerId: string): boolean {
  if (!isParty(agreement, viewerId)) return false;
  const actions = agreementActions(agreement, viewerId);
  if (actions.accept_change || actions.accept_cancel) return true;
  return actions.handover && agreement.confirmed_by.length > 0;
}

/** A6: which Exchanges tab an agreement sits under. */
export function agreementBox(agreement: Pick<AgreementAccess, "status">): AgreementBox {
  return agreement.status === "completed" || agreement.status === "cancelled" ? "closed" : "active";
}
