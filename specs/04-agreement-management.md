# Feature Spec: Agreement Management

Priority flow 3. Milestone 4. APPROVED 2026-10-20 through `milestone-4.md`, which wins where they differ.
> States, transitions, permissions, revision history and renewed
> acceptance are defined in `specs/state-model.md`. Where this file
> differs, `state-model.md` wins. In particular, agreement terms are versioned:
> a change creates a new version that both parties must accept, and the
> previous version stays binding until then.


## Goal

When a proposal is accepted, both parties get an agreement: the
accepted terms as version 1, which no one can edit (changes need a new
version accepted by both), and a shared
tracker that moves to **Completed** once both confirm their handover,
or to **Cancelled** if both agree to cancel.

## User Journey

1. Acceptance (spec 03) creates the agreement and shows a success
   screen: "You have a deal" with `AgreementTermsCard` and **Message
   {name}**.
2. Both parties find it under Deals → **Agreements** (Active,
   Completed, Cancelled).
3. Agreement detail: `AgreementTermsCard` (locked terms, accepted
   date, revision number), `AgreementProgress`, the message thread,
   and actions.
4. Parties arrange the handover by message (time and place are free
   text in messages; structured scheduling is out of scope).
5. Each party taps **I've handed over my side** (confirmation dialog).
   Progress updates for both.
6. When both have confirmed, status becomes `completed` and both are
   notified.
7. Before any handover is confirmed, either party can **Propose a
   change**. The agreement shows **Change proposed**; the current terms
   stay binding until the other party accepts the new version. If they
   reject it, nothing changes.
8. Before completion, either party can **Request cancellation** with
   a reason. The other party can **Agree to cancel** (→ `cancelled`)
   or **Keep the deal** (→ back to `active`).

## Design and UI States

- Progress steps: Agreed → You handed over → {Name} handed over →
  Completed, with icons and labels. Order of the middle steps follows
  whoever confirms first.
- Terms card has a lock icon and no edit affordance.

| State | What the member sees |
| --- | --- |
| Active, nobody confirmed | Primary action "I've handed over my side" |
| Active, you confirmed | Your step checked; "Waiting for {name} to confirm" |
| Active, they confirmed | Their step checked; your action highlighted |
| Cancellation requested by you | Warning badge, "Waiting for {name}"; Withdraw request |
| Cancellation requested by them | Warning banner with reason; Agree to cancel / Keep the deal |
| Completed | Success state, read-only |
| Cancelled | Neutral state, reason shown, read-only |
| Error / conflict | Inline error, refresh to latest state |

## Data Requirements

- `agreements`: id, proposal_id (unique), party_a_id (owner),
  party_b_id (proposer), status (see state model), binding_version_id,
  created_at, completed_at, cancelled_at.
- `agreement_versions`: id, agreement_id, number, terms, proposed_by,
  accepted_by_a_at, accepted_by_b_at, outcome
  (`binding | pending | rejected | withdrawn | superseded`).
- `handover_confirmations`: agreement_id, party_id, confirmed_at
  (unique per party).
- `cancellation_requests`: agreement_id, requested_by, reason,
  created_at, resolved_at, outcome.
- Offers referenced in the terms: PROPOSED that the owner's offer is
  set to `closed` when the agreement completes (open question).

## Permissions

- Read: the two parties only (plus moderators if approved).
- Confirm handover: each party once, only while `active`.
- Request cancellation: either party while `active`.
- Resolve cancellation: only the other party.
- Nobody can edit an accepted version. Either party can propose an
  amendment before any handover is confirmed; the other party must
  accept it (renewed acceptance) or the previous version stays binding.

## Validation

- Confirmation is idempotent: a second confirm by the same party is a
  no-op success.
- Cancellation reason: 3–500 characters.
- A party who already confirmed handover can still request
  cancellation (PROPOSED; confirm with owner).

## Failure Cases

- Both confirm at the same moment → both confirmations stored; status
  becomes `completed` once, via a transaction.
- Cancellation requested while the other party confirms → the
  confirmation is stored; the request still needs a response.
- One party disappears → no automatic resolution at launch; open
  question 9 (disputes).

## Acceptance Criteria

- [ ] Accepting a proposal creates one agreement whose version 1
      matches the accepted revision exactly.
- [ ] Editing or closing the original offer afterwards does not
      change the agreement's terms.
- [ ] After one party confirms, status stays `active` and both views
      show the correct step.
- [ ] After both confirm, status is `completed` and both parties are
      notified.
- [ ] Cancellation needs both parties; a single request moves to
      `cancellation_requested`, and "Keep the deal" returns to
      `active`.
- [ ] No action is available on completed or cancelled agreements.
- [ ] A proposed change leaves the previous version binding until the
      other party accepts that exact version; accepting a stale
      version id is rejected; rejecting leaves terms unchanged.
- [ ] Handover confirmation is blocked while a change is pending.
- [ ] Non-parties get `NOT_FOUND` from the API and never see the
      agreement.
- [ ] Every transition writes an audit event.
- [ ] Works at 375px and 1280px and on a mobile device build.

## Open Questions

Disputes (9), ratings after completion (8), whether completion closes
the offers involved, and whether a no-response timeout should exist.
