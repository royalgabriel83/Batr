# Milestone 3: Propose and Negotiate on the Web

Status: **APPROVED by the owner (2026-10-20, "proceed"), with
every default in the decisions table kept.** Approving it also approves `state-model.md` §3 (terms and snapshots), §4 (as it
applies to proposals) and §5 (proposal), with D1–D3 as decided on
2026-10-20.

Order changed by the owner on 2026-10-20: proposals on the web come
before the mobile app (Milestone 2), so the app is built once with
proposals in it. Unit 17 (mobile propose and negotiate) moves into
Milestone 2.

Feature detail: `03-exchange-proposals.md`. Rules: `state-model.md`
§1, §3–5. Where they differ, `state-model.md` wins, then this file.

## Goal

A signed-in member proposes an exchange on another member's active
offer. The two members counter back and forth until the member whose
turn it is accepts the latest terms, or the proposal is declined,
withdrawn or expires. Every set of terms is kept, changes between
them are obvious, and accepting records exactly what both agreed.

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| P1 | Can a proposal bundle several items on each side? (open question 3) | Yes, up to 3 items per side |
| P2 | Can terms include cash? (open question 2) | Yes, an optional cash amount in naira and who pays it. BATR records it only; it moves no money. This is also the cash the exchange animation shows |
| P3 | Do proposals expire? (open question 7) | Yes, after 14 days with no new terms. The member whose turn it is can no longer act; either member can start a new proposal |
| P4 | What does accepting create, before agreements are built (Milestone 4)? | An agreement record holding the accepted terms, shown read-only as "Agreed". Handover, amendments and cancellation come in Milestone 4 |
| P5 | How does a member learn it is their turn, before notifications (Milestone 5)? | A count on "Exchanges" in the header and tab bar, and the "Your turn" tab. No email or push |
| P6 | Does an offer's owner see every proposal on that offer? | Yes, as a list on the offer, each opening its own negotiation. Proposers never see each other |

## In scope

- Units:
  - **13:** proposal, revision and agreement-record tables, row-level security and the transition functions.
  - **14:** the proposal API.
  - **15:** the web composer.
  - **16:** the web negotiation view and the Exchanges list.
- The rules of `state-model.md` §5, with D1–D3 as decided:
  - **D1:** an accepted offer stays listed, and its owner is prompted to pause or close it.
  - **D2:** closing an offer declines its open proposals, with a system note.
  - **D3:** proposals on a paused offer can still be accepted.
- Material edits to a referenced offer make earlier terms unacceptable (`TERMS_CHANGED`). The member whose turn it is counters with refreshed terms.
- Snapshots of every referenced offer (title, description, condition, offering and wants text, cover photo) are written once with each revision. Snapshot photos stay viewable to both parties even if removed from the live offer.
- Audit events for every transition, and idempotency keys on every write, as in Milestone 1.

## Out of scope

- The mobile app.
- Handover, amendments and cancellation of agreements (Milestone 4).
- Messaging, plus email, push and in-app notification feeds (Milestone 5).
- Payments or fee collection. The valuation fee is not charged here.
- Ratings, moderation and blocking (requirements still open).
- Keyword search and location matching.

## User journey (web)

1. **Start.** An active offer that isn't the member's own shows **Propose an exchange**. Signed out, it leads to sign-in and back.
2. **Composer.** Three parts:
   - **You give:** pick from your own active offers, or describe an item in words, up to 3 items.
   - **You get:** the offer, plus up to 2 described extras.
   - **Cash (optional):** an amount and who pays it.
   - An optional note goes with it.

   As the member fills it in, the exchange builder shows both sides sliding together and the cash appearing between them. A review step restates the terms before sending.
3. **Send.** The proposal opens at revision 1. It appears under "Your turn" for the offer owner and under "Waiting" for the proposer.
4. **Respond.** The member whose turn it is can **Accept**, **Counter** (the composer opens prefilled with the latest terms) or **Decline**. The author of the latest terms can **Withdraw**.
5. **Exchanges page:**
   - three tabs: Your turn, Waiting and Closed;
   - each row shows the other member, both sides and the time of the latest terms.
6. **Negotiation view:**
   - whose turn it is;
   - the latest terms as an exchange pair, with cash between the sides;
   - every earlier revision, with change chips (Added, Removed, Cash changed, Note);
   - only the actions the viewer may take.

   Accept and Decline confirm in a dialog that restates the terms.
7. **Accepted.** Both members see "Agreed" with the accepted terms. The offer owner is prompted to pause or close the offer (D1).

## Rules and validation

- **Create:**
  - signed in;
  - not the offer's owner;
  - the offer is active;
  - no other open proposal by this member on this offer;
  - every "your offer" item is the proposer's own active offer.
- **Items:**
  - 1–3 per side;
  - a described item is 3–200 characters;
  - the note is 0–1000 characters;
  - cash is a whole number of naira from ₦1 to ₦100,000,000, with payer `proposer` or `owner`.
- **Counter:** only the member whose turn it is, only while open, and the terms must differ materially from the latest. A note-only change is refused.
- **Accept:**
  - only the member whose turn it is;
  - must name the latest revision id (otherwise `CONFLICT`);
  - every referenced offer is still active or paused (D3), with an unchanged content version (otherwise `TERMS_CHANGED`);
  - the proposal is still open and unexpired.
  - It creates the agreement record in the same transaction.
- **Decline:** the member whose turn it is.
- **Withdraw:** the author of the latest terms.
- **Expiry:**
  - 14 days after the latest revision;
  - checked inside every action and shown in every list;
  - a scheduled sweep records the `expired` status, with the same hosting caveat as the photo cleanup.
- **Closing an offer:** declines every open proposal on it, in the same transaction, with a system note (D2).
- **Privacy:**
  - only the two members can read a proposal; anyone else gets `NOT_FOUND`;
  - the API never returns a member's email.

## API (unit 14)

`/api/v1`, cookie or Bearer session, idempotency keys on writes, the
Milestone 1 error shape.

| Method and path | Purpose |
| --- | --- |
| `POST /proposals` | Create, with revision 1 |
| `GET /proposals?box=turn\|waiting\|closed&cursor=` | The viewer's proposals |
| `GET /proposals/:id` | One proposal with all revisions and snapshots |
| `POST /proposals/:id/counter` | New revision |
| `POST /proposals/:id/accept` | `{ revision_id }` |
| `POST /proposals/:id/decline` | Decline |
| `POST /proposals/:id/withdraw` | Withdraw |
| `GET /offers/:id/proposals` | Owner only: proposals on their offer |
| `GET /agreements/:id` | The two members only: the accepted terms |

## States the member sees

Loading, Your turn, Waiting, "New terms from {name}" when the view is
stale (actions disabled until refreshed), Agreed, Declined, Withdrawn,
Expired, "This offer was closed" (declined automatically), "This item
changed after these terms were sent", error with Retry (terms kept),
and an empty state for each Exchanges tab.

## Acceptance criteria

- [ ] Member B sends a proposal on member A's active offer, giving one of B's offers, a described item and ₦20,000 cash from B. A sees it under Your turn, and B sees it under Waiting.
- [ ] A cannot propose on A's own offer. B cannot open a second open proposal on the same offer. A paused or closed offer can't receive new proposals.
- [ ] A and B alternate at least three counters. Each revision shows its author, time and correct change chips. A note-only counter is refused.
- [ ] Earlier revisions and snapshots cannot be changed or deleted through the UI, the API or direct database writes by members.
- [ ] Only the member whose turn it is can accept, counter or decline (`FORBIDDEN` otherwise). Only the author of the latest terms can withdraw.
- [ ] Accepting with a stale revision id returns `CONFLICT` and creates nothing. Two simultaneous accepts create exactly one agreement record.
- [ ] Accepting the latest revision sets the proposal to accepted and creates exactly one agreement record with the accepted terms, in one transaction.
- [ ] A material edit to a referenced offer makes earlier revisions unacceptable (`TERMS_CHANGED`) and shows the "changed" notice. Counter with refreshed terms works.
- [ ] Closing the target offer declines its open proposals with a system note. Pausing it doesn't, and those proposals can still be accepted.
- [ ] A proposal with no new terms for 14 days shows Expired, and no action succeeds on it.
- [ ] Member C gets `NOT_FOUND` for the proposal and agreement through the API and sees neither in any list.
- [ ] Every transition writes an audit event. Writes with a repeated idempotency key don't repeat.
- [ ] The full journey passes in Playwright at 375 and 1280px, with no serious axe issues. Lint, typecheck, unit, database and API tests pass against local Supabase.
