// Messages and in-app notifications (specs/milestone-5.md, N1–N8).
// The database repeats these (private.message_limits and the kind
// checks on messages and notifications; parity.db.test.ts).

export const MESSAGE_LIMITS = {
  /** N4: characters in a message, after trimming. */
  bodyMax: 2000,
  /** N4: messages a member may send in one minute. */
  perMinute: 30,
  /** N5: days a thread stays open after its agreement ends. */
  closedThreadDays: 30,
} as const;

/** N1: how often an open thread checks for new messages. */
export const THREAD_POLL_MS = 5000;

/** What a system line or notification is about (N7). */
export const SYSTEM_EVENTS = [
  "proposal.create",
  "proposal.counter",
  "proposal.accept",
  "proposal.decline",
  "proposal.withdraw",
  "proposal.auto_decline",
  "proposal.expire",
  "proposal.block_decline",
  "agreement.handover",
  "agreement.completed",
  "agreement.propose_change",
  "agreement.accept_change",
  "agreement.reject_change",
  "agreement.withdraw_change",
  "agreement.request_cancel",
  "agreement.accept_cancel",
  "agreement.reject_cancel",
  "agreement.withdraw_cancel",
  // Milestone 8: exchange problems, with no actor named.
  "agreement.problem_reported",
  "agreement.problem_reviewed",
  "agreement.moderation_cancel",
] as const;
export type SystemEvent = (typeof SYSTEM_EVENTS)[number];

export const NOTIFICATION_KINDS = ["message", ...SYSTEM_EVENTS] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Who did something, as the viewer reads it; null is BATR itself. */
export type Party = "you" | "them" | null;
