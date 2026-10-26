# Feature Spec: Exchange Proposals and Counteroffers

Priority flow 2. Milestone 3. PENDING APPROVAL.
> States, transitions, permissions, revision history and renewed
> acceptance are defined in `specs/state-model.md`. Where this file
> differs, `state-model.md` wins.


## Goal

A member proposes an exchange against someone's active offer, and
the two parties negotiate through counteroffers until one accepts the
other's latest terms (creating an agreement) or the proposal is
declined, withdrawn or expires. Every revision is kept and the
difference between revisions is obvious.

## Definitions

- **Proposal:** the negotiation between a proposer and an offer
  owner about one offer.
- **Revision:** one complete set of terms. Revision 1 is the
  proposal; each counteroffer is a new revision by the other party.
- **Terms:** `gives` (what the proposer hands over) and `gets` (what
  the proposer receives from the owner), each a list of items, plus
  an optional note. An item is either a reference to one of the
  author's offers or a free-text description.
- **Turn:** the party who did not author the latest revision.

## User Journey

1. On an active offer, the member taps **Propose exchange**.
2. **Composer:** "You give" (select from their own active offers via
   `OfferCard.select`, or describe an item in text); "You get"
   (prefilled with the offer; editable if bundling is approved);
   optional note. Review screen shows `ExchangeSummary`.
3. **Send:** proposal created with revision 1; owner notified.
4. **Owner responds:** Accept, Counter, or Decline.
5. **Counter:** opens the composer prefilled with the latest terms;
   the author edits and sends; a new revision is appended; the other
   party is notified; the turn flips.
6. Repeat until:
   - the party whose turn it is **accepts** → agreement created
     (`04-agreement-management.md`);
   - either party **declines** (turn party) or **withdraws** (author
     of the latest revision, or the proposer at any time);
   - the proposal **expires** (if approved, open question 7).
7. Proposals list ("Deals" → Proposals): tabs **Your turn**,
   **Waiting**, **Closed**.

## Design and UI States

- Negotiation view: `TurnIndicator` at top, `ExchangeSummary` of the
  latest revision, `RevisionTimeline` with change chips, and
  `ProposalActionBar` (sticky on mobile). Web `lg`: two columns
  (thread left once messaging ships in unit 21; until then revision
  notes act as the thread).
- Actions are shown only when allowed for the viewer: Accept,
  Counter and Decline for the turn party; Withdraw for the author of
  the latest revision.
- Accept and Decline use confirmation dialogs restating the terms.

| State | What the member sees |
| --- | --- |
| Loading | Skeleton of summary and timeline |
| Your turn | Info badge, action bar enabled |
| Waiting | Neutral badge, "Waiting for {name}", Withdraw available |
| Stale view | Banner "New terms from {name}" with Refresh; actions disabled until refreshed |
| Accepted | Success badge, link to the agreement |
| Declined / Withdrawn / Expired | Neutral closed state, read-only history |
| Offer closed while open | Banner explaining; per PROPOSED rule the proposal is declined automatically |
| Error | Inline error with Retry; terms not lost |

## Data Requirements

- `proposals`: id, offer_id, proposer_id, owner_id, status
  (`open | accepted | declined | withdrawn | expired`),
  latest_revision_id, created_at, updated_at, expires_at (nullable),
  closed_at.
- `proposal_revisions`: id, proposal_id, number, author_id,
  gives (JSON list of items), gets (JSON list of items), note,
  created_at. Items: `{ kind: "offer", offer_id, title_snapshot,
  photo_snapshot } | { kind: "text", description }`.
- Snapshots of offer title and cover photo are stored on the
  revision so later offer edits do not rewrite history.
- Change chips are computed by diffing revision N against N-1 in
  `packages/shared`.

## Permissions

- Create: signed-in member, not the offer owner, offer `active`, no
  other `open` proposal by this member on this offer.
- Read: proposer and owner only.
- Counter, accept, decline: only the turn party, only while `open`.
- Withdraw: proposer at any time while `open`; owner may decline.
- Referenced own offers in `gives` must be owned by the author and
  `active` at send time.

## Validation

- At least one item in `gives` and one in `gets`.
- Free-text item: 3–200 characters. Note: 0–1000 characters.
- A counter must differ from the latest revision (no-op counters
  rejected).
- Accept must include `revision_id` equal to `latest_revision_id`.
- Bundles: at most 1 item per side until open question 3 is
  answered (PROPOSED default).

## Failure Cases

- Both parties act at once (accept vs counter) → first commit wins;
  the second gets `CONFLICT` and sees the stale-view banner.
- Offer paused or closed during negotiation → new proposals blocked;
  existing behavior per spec 02 open question.
- A referenced own offer becomes closed before acceptance → accept is
  rejected with a message to counter with updated terms.
- Network failure on send → draft terms kept; retry is idempotent.
- Member blocked or suspended (if moderation approved) → actions
  disabled with explanation.

## Acceptance Criteria

- [ ] Member B can send a proposal on member A's active offer; A sees
      it under **Your turn** and B under **Waiting**.
- [ ] A cannot propose on their own offer; B cannot open a second
      open proposal on the same offer.
- [ ] A and B can alternate at least three counteroffers; each
      revision is listed with author, time and correct change chips.
- [ ] Earlier revisions cannot be edited or deleted through UI or API.
- [ ] Only the turn party sees and can use Accept, Counter, Decline;
      API returns `FORBIDDEN` otherwise.
- [ ] Accepting with a stale revision id returns `CONFLICT` and no
      agreement is created.
- [ ] Accepting the latest revision sets the proposal to `accepted`
      and creates exactly one agreement in one transaction.
- [ ] Decline and withdraw close the proposal; no further actions are
      possible.
- [ ] Member C gets `NOT_FOUND` for the proposal by API and cannot
      see it in any list.
- [ ] All transitions write audit events and notify the other party.
- [ ] The flow works end to end in Playwright (web) and on a mobile
      device build.

## Open Questions

Cash top-ups (2), bundles (3), expiry (7), effect of offer closure,
and whether an owner can see other people's proposals on the same
offer side by side (PROPOSED: yes, owner sees a list per offer).
