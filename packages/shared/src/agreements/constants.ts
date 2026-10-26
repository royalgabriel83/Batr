// Agreement constants from specs/milestone-4.md and specs/state-model.md
// §6. The database repeats every limit
// (supabase/migrations/20261020000200_agreements.sql);
// supabase/tests/parity.db.test.ts keeps them identical.

export const AGREEMENT_STATUSES = ["active", "amendment_pending", "cancellation_requested", "completed", "cancelled"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const AGREEMENT_LIMITS = {
  /** A reason to cancel, in characters. */
  cancelReasonMin: 3,
  cancelReasonMax: 500,
} as const;

/** What happened to each version of the terms. */
export const VERSION_OUTCOMES = ["binding", "pending", "rejected", "withdrawn", "superseded"] as const;
export type VersionOutcome = (typeof VERSION_OUTCOMES)[number];

/** A6: active agreements sit under "Agreed"; completed and cancelled ones under "Closed". */
export const AGREEMENT_BOXES = { active: "Agreed", closed: "Closed" } as const;
export type AgreementBox = keyof typeof AGREEMENT_BOXES;
export const AGREEMENT_BOX_IDS = Object.keys(AGREEMENT_BOXES) as [AgreementBox, ...AgreementBox[]];

/** The actions a party can take on an agreement. */
export const AGREEMENT_ACTIONS = [
  "handover",
  "propose_change",
  "accept_change",
  "reject_change",
  "withdraw_change",
  "request_cancel",
  "accept_cancel",
  "reject_cancel",
  "withdraw_cancel",
] as const;
export type AgreementAction = (typeof AGREEMENT_ACTIONS)[number];

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  active: "Agreed",
  amendment_pending: "Change proposed",
  cancellation_requested: "Cancellation requested",
  completed: "Completed",
  cancelled: "Cancelled",
};
