# Milestone 4: Agreements on the Web

Status: **APPROVED by the owner (2026-10-20, "proceed"), with every
default in the decisions table kept.** Approving it also approves
`state-model.md` §6 (agreement) and the agreement column of §4, with
D4 as decided on 2026-10-20.

Order chosen by the owner on 2026-10-20: Agreements on the web come
before the mobile app (Milestone 2). Unit 20 (mobile agreements) moves
into Milestone 2.

Feature detail: `04-agreement-management.md`. Rules: `state-model.md`
§1, §4 and §6. Fees: `valuation-and-fees.md` §1–2. Where they differ,
`state-model.md` wins, then this file.

## Goal

After two members agree, the agreement carries them to the end. Each
member confirms they handed over their side, and the agreement
completes when both have. Before any handover, either member can
propose changed terms, which bind only once the other accepts them.
Either member can ask to cancel, which needs the other's agreement.
The terms that bind are always clear, and earlier versions are kept.

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| A1 | The platform fee: the approved policy says the exchange must not proceed until both 50% shares are paid, but payments are not activated, and payment deadlines are not defined (`valuation-and-fees.md` §11). | Fees aren't collected or enforced in this milestone. Where the target offer has a current fee quote, the agreement shows each member's share as information: "BATR's fee, not collected yet". No fee liability is created and handover isn't blocked. Enforcement comes with payments, after deadlines are approved |
| A2 | When an agreement completes, should the offers in it close automatically? | No, as with D1. Each member whose live offer is in the completed terms is prompted to close it |
| A3 | Can a member who has confirmed handover still ask to cancel? | Yes. The other member still has to agree |
| A4 | Should an unanswered change or cancellation request lapse? | No, not in this milestone. It stays until answered or withdrawn. Disputes stay out of scope (open question 9) |
| A5 | How does a member learn an agreement needs them, before notifications (Milestone 5)? | The count on "Exchanges" includes agreements waiting on them: a change or cancellation to answer, or a handover to confirm after the other member has |
| A6 | Where do agreements live? | A new "Agreed" tab in Exchanges (active agreements), with completed and cancelled ones under "Closed". Each opens `/agreements/:id`. The proposal's Agreed panel links there |

## In scope

- Units:
  - **18:** agreement versions, handover confirmations, cancellation requests, row-level security, transition functions and the API.
  - **19:** the web agreement view, the change composer and the Exchanges changes.
- The rules of `state-model.md` §6, including:
  - version 1 is the accepted proposal revision, already accepted by both;
  - at most one pending version, accepted or rejected only by the other member, naming its exact id;
  - D4: changes only before any handover is confirmed, and confirmations can't be undone.
- The agreement column of `state-model.md` §4: edits to or closing a live offer never change an agreement. Both members see "The listing has changed since you agreed" (already shown).
- Snapshots for every version, with photos kept viewable to both members, as for proposals.
- Audit events for every transition and idempotency keys on every write, as before.

## Out of scope

- The mobile app (Milestone 2, which gains unit 20, mobile agreements).
- Messaging, plus email, push and in-app notification feeds (Milestone 5). Members arrange the handover outside BATR for now.
- Fee collection, payment, refunds and payment deadlines (A1).
- Disputes, ratings, moderation and blocking.
- Structured handover scheduling (time and place).

## User journey (web)

1. **Agreed.** After acceptance, both members find the agreement under Exchanges → Agreed. The proposal page's Agreed panel links to it.
2. **Agreement view:**
   - the binding terms, locked, with the version number and when they were agreed;
   - progress: Agreed, then each member's handover, then Completed;
   - the fee shares, when a quote exists (A1);
   - earlier versions, with change chips;
   - only the actions the viewer may take.
3. **Handover.** Each member taps **I've handed over my side** and confirms in a dialog. The other member then sees "{name} has handed over" and their own action highlighted. When both have confirmed, the agreement is **Completed**, and members with live offers in it are prompted to close them (A2).
4. **Change the terms.** Before either handover, either member can **Propose a change**. The composer opens prefilled with the binding terms. The agreement then shows "Change proposed", and the old terms stay binding. The other member can **Accept change** or **Reject change**; the proposer can **Withdraw change**.
5. **Cancel.** Either member can **Ask to cancel**, with a reason. The other member sees the reason and can **Agree to cancel** or **Keep the agreement**; the requester can **Withdraw request**.
6. **Closed.** Completed and cancelled agreements are read-only, under Exchanges → Closed.

## Rules and validation

- **Confirm handover:**
  - a party, for themselves, only while the agreement is `active`;
  - a repeat returns the existing confirmation, with no new row or event;
  - the second confirmation completes the agreement in the same transaction, and a constraint rejects `completed` without two confirmations.
- **Propose a change:**
  - either party, only while `active` with no handover confirmed (D4);
  - the same item, cash and note rules as a proposal;
  - the terms must differ materially from the binding version;
  - every referenced offer is active or paused, and belongs to the side that gives it.
- **Accept a change:**
  - only the party who didn't propose it, naming the pending version id (otherwise `CONFLICT`);
  - every referenced offer is unchanged since the change was proposed (otherwise `TERMS_CHANGED`).
- **Reject a change:** only the party who didn't propose it, naming the pending version id.
- **Withdraw a change:** only its proposer.
- **Ask to cancel:**
  - either party while `active`;
  - the reason is 3–500 characters;
  - allowed after a handover (A3).
- **Answer a cancellation request:** agreeing or keeping it is only for the other party; withdrawing is only for the requester.
- **Completed and cancelled agreements:** no action succeeds on either.
- **Privacy:** only the two parties can read an agreement, its versions and confirmations; anyone else gets `NOT_FOUND`. No email or storage path is returned.

## API (unit 18)

`/api/v1`, cookie or Bearer session, idempotency keys on writes, the
existing error shape.

| Method and path | Purpose |
| --- | --- |
| `GET /agreements?box=active\|closed&cursor=` | The viewer's agreements |
| `GET /agreements/:id` | One agreement, with every version, the confirmations, any open request and the fee shares (A1) |
| `POST /agreements/:id/handover` | Confirm the viewer's handover |
| `POST /agreements/:id/changes` | Propose a change, `{ terms, note, expected_version }` |
| `POST /agreements/:id/changes/:version_id/accept` | Accept the pending change |
| `POST /agreements/:id/changes/:version_id/reject` | Reject the pending change |
| `POST /agreements/:id/changes/:version_id/withdraw` | Withdraw the viewer's pending change |
| `POST /agreements/:id/cancellation` | Ask to cancel, `{ reason }` |
| `POST /agreements/:id/cancellation/accept` | Agree to cancel |
| `POST /agreements/:id/cancellation/reject` | Keep the agreement |
| `POST /agreements/:id/cancellation/withdraw` | Withdraw the viewer's request |

## States the member sees

Loading; Agreed, with nobody handed over; "You've handed over, waiting
for {name}"; "{name} has handed over"; Change proposed (by you, or by
them, with the changes); Cancellation requested (by you, or by them,
with the reason); Completed; Cancelled, with the reason; "Something
changed, refresh to see the latest" when the view is stale (actions
disabled until refreshed); error with Retry; an empty Agreed tab.

## Acceptance criteria

- [ ] Accepting a proposal still creates exactly one agreement, whose version 1 matches the accepted revision exactly.
- [ ] Editing, pausing or closing an offer afterwards changes no agreement version or status.
- [ ] After one member confirms handover, the agreement stays active and both views show the right step. A repeat confirm changes nothing.
- [ ] Two simultaneous final confirmations complete the agreement exactly once.
- [ ] A proposed change leaves the old version binding until the other member accepts that exact version. A stale version id gets `CONFLICT`. Rejecting or withdrawing leaves the terms unchanged.
- [ ] Changes are refused after any handover. Handover is refused while a change or cancellation is pending.
- [ ] Cancelling needs both members. One request moves to cancellation requested; Keep the agreement returns to active; Agree to cancel ends it as cancelled.
- [ ] No action succeeds on a completed or cancelled agreement.
- [ ] Member C gets `NOT_FOUND` for the agreement through the API and sees it in no list.
- [ ] Earlier versions and confirmations can't be changed or deleted through the UI, the API or direct database writes by members.
- [ ] Fee shares are shown only as information, and no fee liability or payment record is created (A1).
- [ ] Every transition writes an audit event. Writes with a repeated idempotency key don't repeat.
- [ ] The full journey (handover by both, a change accepted, a change rejected, a cancellation agreed) passes in Playwright at 375 and 1280px, with no serious axe issues. Lint, typecheck, unit, database and API tests pass against local Supabase.
