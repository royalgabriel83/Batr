import type { NotificationKind, Party, SystemEvent } from "./constants.ts";

// What the message and notification endpoints return
// (specs/milestone-5.md, API), for both apps. The database works out
// who each line is from ("you", "them" or BATR), so no member id is
// returned.

export interface MessageView {
  id: number;
  kind: "text" | "system";
  from: Party;
  body: string | null;
  event: SystemEvent | null;
  actor: Party;
  created_at: string;
}

/** A message just sent, with the sender's warning when it may hold contact details (milestone-7-contact-details.md, C4). */
export interface SentMessageView extends MessageView {
  warning?: string;
}

export interface ThreadView {
  items: MessageView[];
  more: boolean;
  closed: boolean;
  unread: number;
}

export interface ThreadSummaryView {
  proposal_id: string;
  agreement_id: string | null;
  other_name: string;
  offer_title: string;
  last: MessageView;
  unread: number;
  closed: boolean;
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  count: number;
  actor_name: string | null;
  offer_title: string;
  proposal_id: string;
  agreement_id: string | null;
  read: boolean;
  created_at: string;
  updated_at: string;
}

/** `GET /me/status` (specs/milestone-2-part-2.md, Q8): the app's counts and banner. */
export interface MemberStatusView {
  /** Proposals and agreements waiting on the member (P5, A5): the tab's count. */
  exchanges: number;
  /** The same, split for the Your turn and Agreed tabs in Exchanges. */
  waiting: { turn: number; agreements: number };
  /** Conversations with unread messages. */
  messages: number;
  /** Unread messages by proposal id, for the Exchanges rows (N2). */
  unread_by_proposal: Record<string, number>;
  /** Unread notifications. */
  notifications: number;
  suspended: boolean;
  /** Milestone 8, W7: show the warning banner once. */
  warned: boolean;
}
