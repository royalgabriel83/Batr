# Milestone 5: Messages and In-App Notifications on the Web

Status: **APPROVED by the owner (2026-10-20, "Proceed?"), with every
default in the decisions table kept**, and N2 changed by the owner the
same day to add a Messages page. Approving it also settles the open questions of
`06-messaging-and-notifications.md` listed in the decisions table.

Order: proposed on 2026-10-20 after Milestone 4, because agreements
tell members to arrange the handover and BATR has no way yet to do
that. The mobile app (Milestone 2) gains the mobile thread and
notification list.

Feature detail: `06-messaging-and-notifications.md`. Rules:
`state-model.md`. Where they differ, `state-model.md` wins, then this
file.

## Goal

The two members of a proposal can message each other in one thread
that carries on into their agreement, and each member is told in
BATR when something needs them.

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| N1 | How "live" must a thread be? | An open thread checks for new messages every 5 seconds while visible, and at once when the tab regains focus. No realtime service in this milestone; the server stays the source of truth. Realtime can replace polling later without changing the data |
| N2 | Where do members find their threads? | On the proposal and agreement pages, under the terms, and on a **Messages** page (owner, 2026-10-20: "yes") listing every thread, latest activity first, with the other member, the offer, the last line and an unread count. Messages sits beside the bell in the header (the phone tab bar is full) and in the desktop navigation. Exchanges rows also show an unread count |
| N3 | Links in messages | Shown as plain text, never clickable. A standing line above the composer: "Keep payments to the agreed terms. BATR never asks for your bank details in a message." |
| N4 | Sending limits | Body 1–2000 characters, trimmed, text only (no photos). At most 30 messages a minute per member, enforced in the database (`RATE_LIMITED`, 429) |
| N5 | When does a thread become read-only? | When the proposal ends without agreement (declined, withdrawn, expired), and 30 days after the agreement completes or is cancelled. It stays readable to both members |
| N6 | Editing, deleting and retention | Messages can't be edited or deleted by members, and are kept as long as the proposal. Retention policy comes with the launch privacy work |
| N7 | Which events notify? | Every row of the feature spec's table, plus agreement changes (proposed, accepted, rejected or withdrawn). Never the member who acted. Messages are grouped: one unread notification per thread, updated with the latest message and a count |
| N8 | Notification preferences, push and email | Not in this milestone. In-app only (owner, 2026-10-17) |

## In scope

- Units:
  - **21:** messages, thread read markers, system events in the thread, row-level security, the rate limit, and the API.
  - **22:** in-app notifications written by the database on each event, the bell with an unread count, the notification list, and deep links.
- One thread per proposal, keyed by the proposal, continuing on the agreement page.
- System lines in the thread for each proposal and agreement event (sent, countered, accepted, declined, withdrawn, expired, handover confirmed, change proposed or answered, cancellation requested or answered, completed), written in the same transaction as the event.
- Idempotency keys on sends, as on every other write.

## Out of scope

- The mobile app (Milestone 2).
- Push, email and SMS notifications (unit 23, each specified and approved separately).
- Notification preferences, attachments, read receipts, typing indicators.
- Blocking and reporting messages. These stay open requirements before any iOS release; until then the only safety measures are N3 and N4.

## User journey (web)

1. **Thread.** On a proposal or agreement page, under the terms, the member sees the thread: their own messages on the right (`--accent-soft`), the other member's on the left (`--bg-surface`), and system lines centred in caption style. Empty state: "Say hello to {name}".
2. **Send.** They type and press **Send**. The message appears at once as sending; on failure it shows **Retry**, which never duplicates it.
3. **Receive.** The other member sees it within a few seconds if the page is open (N1). Otherwise the bell and the Exchanges row show it unread.
4. **Bell.** The header bell (web navbar, and the phone header) shows the unread count. It opens the notification list, newest first: an icon for each kind, a line of text, relative time, an unread dot, and **Mark all as read**. Tapping one opens the exact proposal or agreement and marks it read.
5. **Read-only.** A closed thread shows its messages and "This conversation is closed" in place of the composer (N5).

## Data

- `messages`: id, proposal_id, sender_id (null for system lines), kind (`text | system`), body, system_event, created_at. Append-only.
- `thread_reads`: proposal_id, member_id, last_read_at.
- `notifications`: id, recipient_id, kind, subject_type (`proposal | agreement`), subject_id, payload (no email or storage paths), count, created_at, updated_at, read_at.

## Rules

- Only the two members can read or send in a thread, through row-level security and security-definer functions as before. Anyone else gets `NOT_FOUND`.
- System lines and notifications are written only by the database, during the transition that causes them.
- Notifications are readable and markable only by their recipient. Opening a subject the member can no longer read shows "no longer available".

## API

`/api/v1`, cookie or Bearer session, the existing error shape.

| Method and path | Purpose |
| --- | --- |
| `GET /messages?cursor=` | The viewer's threads for the Messages page (N2) |
| `GET /proposals/:id/messages?after=&before=` | Messages, newest page first, or newer than a cursor (polling) |
| `POST /proposals/:id/messages` | Send `{ body }`, with an idempotency key |
| `POST /proposals/:id/messages/read` | Mark the thread read up to now |
| `GET /notifications?cursor=` | The viewer's notifications |
| `GET /notifications/count` | Unread count for the bell |
| `POST /notifications/:id/read` | Mark one read |
| `POST /notifications/read-all` | Mark all read |

## Acceptance criteria

- [ ] Two members exchange messages on a proposal; the thread continues on the agreement page after acceptance. A third member gets `NOT_FOUND` through the API and direct database reads.
- [ ] A new message shows on the other member's open page within 10 seconds, without a reload.
- [ ] Each proposal and agreement event writes exactly one system line, in the same transaction.
- [ ] Each event in N7 creates an in-app notification for the right member and none for the actor. Messages group into one notification per thread.
- [ ] Tapping a notification opens the exact proposal or agreement and marks it read. Unread counts on the bell and Exchanges rows update after reading.
- [ ] A retried send with the same key doesn't duplicate. The 31st message in a minute gets `RATE_LIMITED`.
- [ ] Links are not clickable. Closed threads refuse sends (N5).
- [ ] Messages can't be edited or deleted by members through the UI, the API or direct database writes.
- [ ] The journey (message, counter, accept, handover, notification deep link) passes in Playwright at 375 and 1280px with no serious axe issues. Lint, typecheck, unit, database and API tests pass against local Supabase.
