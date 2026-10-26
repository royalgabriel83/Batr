# Feature Spec: Messaging and Notifications

Milestone 5. Events referenced below follow `state-model.md`.

## Goal

The two parties of a proposal can message each other in one thread
that continues into their agreement, and members are told promptly
when something needs their attention.

## User Journey

1. Every proposal has one thread, visible in the negotiation view and
   in **Messages**. The thread carries over to the agreement.
2. System events appear inline in the thread (e.g. "Ada sent a
   counteroffer · Revision 3", "Agreement created").
3. The member types and sends; the other party sees it live if
   viewing, otherwise gets a notification.
4. **Messages** lists threads, most recent first, with unread counts.
5. The bell (web navbar, mobile Explore header) opens the
   notification list; tapping one deep-links to the subject.

## Notification Events

| Event | Recipient | In-app | Push / email (if approved) |
| --- | --- | --- | --- |
| New proposal on your offer | Owner | yes | yes |
| Counteroffer received | Turn party | yes | yes |
| Proposal accepted (agreement created) | Both | yes | yes |
| Proposal declined / withdrawn / expired | Other party | yes | yes |
| New message | Other party | yes (grouped) | yes (throttled) |
| Handover confirmed by other party | Other party | yes | yes |
| Agreement completed | Both | yes | yes |
| Cancellation requested / resolved | Other party | yes | yes |

## Design and UI States

- Thread: bubbles, own messages right on `--accent-soft`, other's
  left on `--bg-surface`; system events centered in `caption` style.
  Composer pinned to the bottom, keyboard-aware on mobile.
- States: loading, empty ("Say hello to {name}"), sending, failed
  (tap to retry), read-only (proposal closed or agreement finished:
  PROPOSED read-only after completion/cancellation + 30 days, open
  question), offline (queued send on mobile).
- Notification list: unread dot, icon per event type, relative time,
  "Mark all as read".

## Data Requirements

- `messages`: id, proposal_id, sender_id (null for system), kind
  (`text | system`), body, system_event, created_at.
- `thread_reads`: proposal_id, member_id, last_read_at.
- `notifications`: id, recipient_id, type, subject_type, subject_id,
  payload, created_at, read_at.
- `push_tokens` (if push approved): member_id, token, platform.
- Notification preferences: open question.

## Permissions

- Read and send in a thread: the two parties only.
- System messages are written only by the server during transitions.
- Notifications are readable only by their recipient.
- Realtime subscriptions are filtered by the same RLS policies.

## Validation

- Message body 1–2000 characters, trimmed; no attachments at launch
  (PROPOSED).
- Rate limit message sends per member (PROPOSED: 30 per minute).
- Links are rendered as plain text with a safety warning on tap
  (PROPOSED), because exchange marketplaces attract off-platform
  scams.

## Failure Cases

- Realtime disconnect → fall back to polling on focus; no lost
  messages (server is source of truth).
- Push token invalid → token deleted; in-app still works.
- Duplicate send from retry → idempotency key prevents a duplicate.
- Notification for a subject the member can no longer access →
  opens a "no longer available" state.

## Acceptance Criteria

- [ ] Two parties can exchange messages and see them live on web and
      mobile; a third member cannot read or subscribe.
- [ ] Counteroffer, acceptance and handover events appear as system
      messages in the thread.
- [ ] Every event in the table creates an in-app notification for the
      right recipient and none for the actor.
- [ ] Tapping a notification opens the exact proposal or agreement.
- [ ] Unread counts on threads and the bell update after reading.
- [ ] A failed send can be retried without duplicating the message.
- [ ] Push/email (unit 23) only ships if open question 20 is approved.
      The owner chose in-app first (2026-10-17); email and push each
      need their own spec and approval.

## Open Questions

Push and email at launch (20), notification preferences, message
attachments (photos), read receipts, message retention, and safety
features (blocking, reporting messages).
