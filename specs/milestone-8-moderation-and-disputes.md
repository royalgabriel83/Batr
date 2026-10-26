# Milestone 8: Moderation Workspace and Exchange Problems

Status: **APPROVED by the owner (2026-10-23, "Approve all"), with every
default kept.**

Proposed after the UI/UX and Trust & Safety review (2026-10-23,
roadmap P1). It builds on `milestone-6.md` (reports, blocks,
suspensions and the moderation log) and `milestone-4.md` (agreements).
Where they differ, `state-model.md` wins, then this file.

## Goal

Moderators can find, sort and work through cases quickly, with
everything they need on one page and nothing they shouldn't see. A
member whose handover went wrong can tell BATR, and both members know
what happens next. BATR never claims to hold or return money, because
no money passes through it.

## Decisions in this spec (defaults; the owner can change any)

### Workspace

| # | Question | Default proposed |
| --- | --- | --- |
| W1 | What is a case? | Every open report, every exchange problem (D1) and every automatic report from contact-detail checks (`milestone-7-contact-details.md`, C7). Each has a short case number ("Case 0152"), a type, a reason, a status (Open, In review, Closed) and an assignee |
| W2 | Risk | High: scam or fraud, prohibited item, exchange problem, or a member with 3 or more reports in 30 days. Medium: harassment, misleading, contact details. Low: spam and something else. Risk only orders the queue; it never acts on its own |
| W3 | Queue | High risk first, then oldest first. Filters: type, risk, status, assigned to me, unassigned. Search by case number, offer title or member display name |
| W4 | Assignment | "Take this case" assigns it to the viewer; another moderator can take it over, and the change is logged. Unassigned cases stay in the queue |
| W5 | What a case shows | What it points to (as `milestone-6.md`, S6), the exact reported or flagged text highlighted with the reason, the reporter's details, and the member's history **as counts only** (reports in 30 days, earlier actions, current suspension), never other cases' content |
| W6 | Actions | As S5, chosen by case type: an offer case offers Dismiss, Remove the offer, Suspend; a message or member case offers Dismiss, Warn, Suspend; an exchange problem offers the outcomes in D3. A note of at least 10 characters for every action; Remove, Suspend and any exchange outcome confirm once more (built for Remove and Suspend) |
| W7 | Warn | New: the member sees a banner once, "BATR reviewed a report about you. Please follow the rules", with a link to the rules. No limits are applied |
| W8 | Senior moderator | New role `senior_moderator`, granted by SQL like the other staff roles. Only they can lift a suspension that isn't theirs and decide appeals (W9) |
| W9 | Appeals | A suspended member can ask for one review, by email to the S8 address at first. A senior moderator records the outcome in the case. An in-app appeal is later work |
| W10 | States | Each list and case has loading, empty ("No open cases"), error with Retry, and a toast after each action |

### Exchange problems

| # | Question | Default proposed |
| --- | --- | --- |
| D1 | Who can report a problem, and when? | Either member of an agreement that is active, amendment pending or cancellation requested, or completed less than 14 days ago: "Report a problem with this exchange". Reasons: Item not as described; The other member didn't show up; Not received after I handed over; Safety concern; Something else. Details are required (at least 20 characters) |
| D2 | What happens straight away? | For an agreement that isn't completed, handover confirmation and changes are paused for both members, with the line "Paused while BATR reviews a problem with this exchange". Both members are told a person will review it. The other member isn't told who reported it, but can add their side once (up to 1000 characters) |
| D3 | What can BATR decide? | Only these: **Resume** (pause lifted, nothing else changes); **Cancel the agreement** (both told why, in neutral words); **Record that one member didn't keep to the agreement** (shown to moderators as a count, not to other members); and any action in W6 against either member. **BATR doesn't move, hold or refund money**, and every screen says so: "BATR records the agreed amount only. It can't return money or items" |
| D4 | What can't be reported as a problem? | Cancelled agreements, and completed ones older than 14 days |
| D5 | Limits | One open problem per agreement. A member can report at most 3 problems in 30 days |
| D6 | Records | Every report, reply, pause, decision and note goes in the append-only moderation log. Agreement times use the record format ("23 Oct 2026, 07:13 WAT") |

## In scope

- Cases, risk, assignment, filters and search in the database and
  `/moderation`, with row-level security and the API.
- Warn (W7), the senior role (W8) and recording appeals (W9).
- "Report a problem with this exchange" on web and mobile, the pause,
  the other member's reply and the outcomes in D3.
- Audit events for each action.

## Out of scope

- Payments, escrow, refunds or holding items.
- Ratings or public trust scores.
- In-app appeals, legal or law-enforcement requests.
- A mobile moderation workspace (moderators use the web).

## Acceptance criteria

1. A non-moderator gets "not found" for every moderation page and
   endpoint, including the new ones.
2. The queue orders high risk first, then oldest; each filter and the
   search narrow it correctly; assignment changes are logged.
3. A case never shows another case's content, only counts.
4. Reporting a problem pauses handover and changes for both members, in
   the database, and resuming lifts it.
5. No screen says or implies that BATR holds, returns or refunds money.
6. Every outcome needs a note and confirmation, and is logged with the
   moderator, time and note.
7. Loading, empty and error states exist for every list and case, at
   375 and 1280 px, with no serious accessibility issues.

## Test plan

- Database tests for risk, ordering, the pause and every decision.
- API tests for each endpoint and permission.
- Browser tests for the workspace and the problem report; a Maestro flow
  for reporting a problem in the app.
