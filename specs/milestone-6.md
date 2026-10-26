# Milestone 6: Safety on the Web (Block, Report, Moderate)

Status: **APPROVED by the owner (2026-10-20, "move on to the next
phase" after this draft and the recommendation), with every default in
the decisions table kept.** The S8 contact address and the S9 list
wording are still the owner's to supply; placeholders are marked until
then. Approving it settles open question 10 (moderation)
and the G5 requirement: reporting, blocking and moderation are defined
before Milestone 2 planning is final and before any iOS release.

Proposed on 2026-10-20 after Milestone 5, because members can now
message each other. The mobile app (Milestone 2) gains the same
actions later.

Rules: `state-model.md`. Roles: `05-auth-and-permissions.md` and the
staff-role model in `architecture.md`. Where they differ,
`state-model.md` wins, then this file.

## Goal

A member can stop contact with another member, and can tell BATR about
an offer, a member or a message that breaks the rules. BATR staff can
review each report and act on it, and every action is recorded.

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| S1 | What does blocking do? | Both ways: neither member can send the other a proposal or a message, and neither sees the other's offers in Explore or search. Open proposals between them are declined by BATR with the line "Declined because a member blocked the other". Conversations between them close. **Active agreements are not changed**: either member can still confirm a handover or ask to cancel. The blocked member is never told; they see "This member isn't available" |
| S2 | Undoing a block | Any time, from Account → Blocked members. Declined proposals stay declined |
| S3 | What can be reported, and why? | An offer, a member, or one message. Reasons: Prohibited item; Scam or fraud; Harassment or abuse; Misleading or fake; Spam; Something else. Details are optional (up to 1000 characters), except "Something else", which needs at least 10 |
| S4 | Who reviews reports? | A new staff role, `moderator`, granted only with SQL like the valuation roles, every grant logged. No admin screen for granting. Moderators never handle a report about themselves or one they made |
| S5 | What can a moderator do? | **Dismiss** the report; **Remove the offer** (closed, marked "Removed by BATR", its open proposals declined); **Suspend the member** (they can still sign in and see their agreements, but can't publish, propose or message, and their offers are hidden); **Lift a suspension**. Every action needs a note of at least 10 characters and is kept in an append-only log |
| S6 | What can a moderator read? | Only what the report points to: the offer, the member's public profile and offers, or the reported message with the 10 messages before and after it in that conversation. Nothing else of anyone's conversations |
| S7 | What is the reporter told? | "Thanks. BATR will review this." The report then shows as Received, then Reviewed, under Account → My reports. The outcome and the moderator's note are never shown. The reported member is never told who reported them |
| S8 | What is the suspended member told? | A banner: "Your account is limited. You can't publish, propose or message for now." with a contact address for questions (owner to supply). Appeals are handled by email outside BATR for now |
| S9 | Prohibited items | A "What can't be offered" page, linked from the create form and the report dialog. **The owner supplies or approves the list wording before release**; the draft list is weapons and ammunition, drugs and drug equipment, stolen goods, counterfeit goods, live animals, adult content, recalled or unsafe products, personal or financial data, cash or currency swaps, and anything illegal in Nigeria |
| S10 | Limits | Up to 10 reports a day per member; one open report per member per offer, member or message. Blocking has no limit |

## In scope

- Units:
  - **24:** blocks, reports, moderator role, suspensions and the moderation log in the database, with row-level security, and the API.
  - **25:** Block and Report on offers, member names and messages; Account → Blocked members and My reports; the "What can't be offered" page.
  - **26:** the moderation workspace (`/moderation`): a queue of open reports, oldest first, each with what it points to and the actions in S5.
- Blocking and suspension enforced in the database for proposals, messages, publishing and Explore, not only in the UI.
- Audit events for every block, unblock, report and moderator action.

## Out of scope

- The mobile app (Milestone 2).
- Automatic filtering of messages or photos.
- Appeals inside BATR, legal takedown requests, law-enforcement requests.
- Deleting accounts or content permanently. Removed offers and the reported messages are kept for the record.
- Ratings, verification and disputes.

## Acceptance criteria

- [ ] After A blocks B, neither can propose on the other's offers or message the other (API and database), neither sees the other's offers in Explore, and open proposals between them are declined with a system line. An active agreement between them can still be handed over or cancelled.
- [ ] B is not told about the block. Unblocking restores proposing, messaging and Explore, and leaves declined proposals declined.
- [ ] A member can report an offer, a member or a message, once while it is open, up to 10 a day, and sees it under My reports as Received, then Reviewed.
- [ ] Only moderators can open `/moderation` or the moderation API; everyone else gets 404. A moderator can't handle a report about themselves or one they made.
- [ ] A moderator sees only what S6 allows.
- [ ] Remove the offer closes it as "Removed by BATR" and declines its open proposals. Suspend stops publishing, proposing and messaging and hides the member's offers; lifting it restores them. Each action needs a note and writes one log row that can't be edited or deleted.
- [ ] The reporter never sees the outcome or note; the reported member never sees who reported them.
- [ ] Journeys for blocking, reporting and moderating pass in Playwright at 375 and 1280px with no serious axe issues. Lint, typecheck, unit, database and API tests pass against local Supabase.
