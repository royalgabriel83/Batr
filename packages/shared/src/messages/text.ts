import type { NotificationKind, Party, SystemEvent } from "./constants.ts";

// The words for system lines and notifications (specs/milestone-5.md,
// User journey). One sentence each, from the viewer's side.

type Phrase = { you: string; them: string } | string;

const EVENT_PHRASES: Record<SystemEvent, Phrase> = {
  "proposal.create": { you: "You sent a proposal", them: "{name} sent a proposal" },
  "proposal.counter": { you: "You sent a counteroffer", them: "{name} sent a counteroffer" },
  "proposal.accept": { you: "You accepted. You have an agreement", them: "{name} accepted. You have an agreement" },
  "proposal.decline": { you: "You declined the proposal", them: "{name} declined the proposal" },
  "proposal.withdraw": { you: "You withdrew the proposal", them: "{name} withdrew the proposal" },
  "proposal.auto_decline": "The proposal was declined because the offer was closed",
  "proposal.expire": "The proposal expired",
  // S1 (Milestone 6): closed because one member blocked the other,
  // worded so the blocked member isn't told.
  "proposal.block_decline": "This proposal was closed",
  "agreement.handover": { you: "You confirmed your handover", them: "{name} confirmed their handover" },
  "agreement.completed": {
    you: "You confirmed your handover. The agreement is complete",
    them: "{name} confirmed their handover. The agreement is complete",
  },
  "agreement.propose_change": { you: "You proposed a change", them: "{name} proposed a change" },
  "agreement.accept_change": { you: "You accepted the change", them: "{name} accepted the change" },
  "agreement.reject_change": { you: "You rejected the change", them: "{name} rejected the change" },
  "agreement.withdraw_change": { you: "You withdrew your change", them: "{name} withdrew their change" },
  "agreement.request_cancel": { you: "You asked to cancel", them: "{name} asked to cancel" },
  "agreement.accept_cancel": {
    you: "You agreed to cancel. The agreement is cancelled",
    them: "{name} agreed to cancel. The agreement is cancelled",
  },
  "agreement.reject_cancel": { you: "You kept the agreement", them: "{name} kept the agreement" },
  "agreement.withdraw_cancel": { you: "You withdrew your request to cancel", them: "{name} withdrew their request to cancel" },
  // Milestone 8 (D2, D3): never says who reported the problem.
  "agreement.problem_reported": "A problem was reported with this exchange. A person at BATR will review it",
  "agreement.problem_reviewed": "BATR has reviewed the problem reported with this exchange",
  "agreement.moderation_cancel": "BATR cancelled this agreement after reviewing a problem",
};

/** A system line in a thread: who did what, by the viewer's reading. */
export function systemLineText(event: SystemEvent, actor: Party, otherName: string): string {
  const phrase = EVENT_PHRASES[event];
  if (typeof phrase === "string") return `${phrase}.`;
  return `${(actor === "you" ? phrase.you : phrase.them).replace("{name}", otherName)}.`;
}

/** A notification's line. The actor is never the recipient (N7). */
export function notificationText(kind: NotificationKind, actorName: string | null, count = 1): string {
  const name = actorName ?? "A member";
  if (kind === "message") return count > 1 ? `${name} sent you ${String(count)} messages.` : `${name} sent you a message.`;
  if (kind === "proposal.create") return `${name} sent you a proposal.`;
  return systemLineText(kind, actorName === null ? null : "them", name);
}
