// Proposal constants from specs/milestone-3.md (Decisions P1–P3, Rules
// and validation) and specs/state-model.md §5. The database repeats
// every limit (supabase/migrations/20261020000100_proposals.sql);
// supabase/tests/parity.db.test.ts keeps them identical.

export const PROPOSAL_STATUSES = ["open", "accepted", "declined", "withdrawn", "expired"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_LIMITS = {
  /** P1: up to 3 items on each side. */
  itemsPerSideMax: 3,
  textItemMin: 3,
  textItemMax: 200,
  noteMax: 1000,
  /** P2: whole naira. */
  cashNairaMin: 1,
  cashNairaMax: 100_000_000,
  /** P3: days after the latest terms. */
  expiryDays: 14,
} as const;

/** Who pays the cash in a set of terms (P2). BATR records it only. */
export const CASH_PAYERS = ["proposer", "owner"] as const;
export type CashPayer = (typeof CASH_PAYERS)[number];

/** The three Exchanges tabs. */
export const PROPOSAL_BOXES = {
  turn: "Your turn",
  waiting: "Waiting",
  closed: "Closed",
} as const;
export type ProposalBox = keyof typeof PROPOSAL_BOXES;
export const PROPOSAL_BOX_IDS = Object.keys(PROPOSAL_BOXES) as [ProposalBox, ...ProposalBox[]];

/** The actions a party can take on an open proposal. */
export const PROPOSAL_ACTIONS = ["counter", "accept", "decline", "withdraw"] as const;
export type ProposalAction = (typeof PROPOSAL_ACTIONS)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  open: "Open",
  accepted: "Agreed",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};
