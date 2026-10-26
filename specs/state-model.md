# Spec: Exchange State Model

The single definition of states, transitions, permissions, revision
history and renewed acceptance for offers, proposals and agreements.
`packages/shared` implements it; the API and the database enforce it;
the UI shows only states and actions listed here (labels in
`context/ui-context.md` → Status indicators).

## Approval status

| Section | Status |
| --- | --- |
| §1 Transaction and idempotency rules | Applies to all entities. Offer parts are in Milestone 1 |
| §2 Offer | **APPROVED in principle (owner, 2026-10-15)** for Milestone 1, including the clarifications added in this revision |
| §3 Terms and snapshots | **APPROVED (owner, 2026-10-20, with `milestone-3.md`)** for Milestone 3 |
| §4 How offer changes affect proposals and agreements | **APPROVED (owner, 2026-10-20)**: proposals with `milestone-3.md`, agreements with `milestone-4.md` |
| §5 Proposal | **APPROVED (owner, 2026-10-20, with `milestone-3.md`)**, with expiry after 14 days (P3) |
| §6 Agreement | **APPROVED (owner, 2026-10-20, with `milestone-4.md`)**. §6.3 fee enforcement waits for payments (A1) |
| §8 Decisions needing the owner | D5–D9 decided for Milestone 1; D1–D4 decided 2026-10-20 (owner kept every default) |

**Milestone 1 boundary.** Milestone 1 creates no proposal, revision,
agreement, version, handover or cancellation tables, functions,
transitions, endpoints or UI, and no automatic handling of proposals
when an offer changes (D1–D3). Only §1 (as it applies to offers) and
§2 are implemented.

Items marked **DEFAULT** are placeholders for a decision the owner has
not made; each one is listed in §8. Clarifications in this revision
add precision only; they do not change the business meaning of the
pending proposal and agreement rules.

## 1. Transaction and idempotency rules

**Atomicity.** Every state transition is a single database
transaction that:
1. locks the entity row (`SELECT … FOR UPDATE`);
2. re-checks the actor's permission and that the current state allows
   the action;
3. writes the new state and any dependent rows, and increases the
   entity's `revision` by one;
4. inserts exactly one `audit_events` row (it has no foreign key to
   the entity, so it survives the entity's deletion);
5. records the idempotency key (below);
6. commits.

If any step fails, the whole transaction rolls back: no state change,
no audit row, no idempotency record, and no partial dependent rows.

**Where it runs.** Each transition, and every other write (edits,
photo changes), is a Postgres function (for example
`offer_publish(offer_id, expected_status, idempotency_key)`) called
from the API with the caller's session. The function checks that the
caller is the owner; members cannot write the tables directly, and
row-level security governs every read. Each function locks the offer
row before checking anything, and commit-time triggers re-check the
state and publish rules (`milestone-1.md`, Concurrency). The allowed-transition table exists twice: as
data in `packages/shared` (used for UI and early validation) and in
the database function. A test asserts both tables are identical.

**Optimistic check.** Every mutation on an existing entity carries
two values the client last saw:
- `expected_revision`: the entity's `revision`, which increases by one
  on **every** successful write (material edits, non-material edits,
  photo add, remove and reorder, alt text, every transition). If it
  does not match, `409 CONFLICT` with `reason: stale_revision`;
  nothing changes. This stops two edits made in the same state from
  silently overwriting each other. Stale edits are rejected, never
  merged.
- `expected_status`: if the state has changed, `409 CONFLICT` with
  `reason: status_changed`.

`content_version` keeps its separate meaning (material changes only)
and is not used for conflict detection.

**Idempotency.** Defined in full in `milestone-1.md` (Idempotency);
this is a summary, and that section wins if they differ.
- Every mutation **requires** an `Idempotency-Key`; missing →
  `400 IDEMPOTENCY_KEY_REQUIRED`.
- Stored in `idempotency_keys` (actor_id, key, endpoint, resource_id,
  request_hash, response_status, response_body, created_at,
  expires_at), primary key (actor_id, key), in the same transaction
  as the change. Members cannot read or write the table directly.
- Scope: one member; one endpoint and resource. Same key on a
  different endpoint or resource, or with a different request hash
  (SHA-256 of the canonical body, or of the file bytes and fields for
  uploads) → `422 IDEMPOTENCY_KEY_REUSED`.
- Same key, same request, completed → the stored response, with no
  re-execution and no extra audit row. The key is checked before the
  revision, so a retry never becomes a `409`.
- Concurrent retries: the second request waits on the first's key
  row; it gets the stored response if the first commits, or executes
  normally if the first rolls back.
- Keys expire 24 hours after creation and are deleted by the cleanup
  job. A key reused after expiry is a new request; `expected_revision`
  prevents a double change.
- A repeated request **without** the same key is a new request and is
  stopped by `expected_revision`/`expected_status` (`409`), never a
  second change.

**Database constraints** back these rules: status columns are
constrained to the listed values; a trigger rejects any status change
not in the allowed-transition table; `audit_events` rows cannot be
updated or deleted by members.

## 2. Offer (APPROVED in principle, Milestone 1)

States: `draft`, `active`, `paused`, `closed`. `closed` is terminal.

| Action | From | To | Who | Conditions |
| --- | --- | --- | --- | --- |
| create | — | `draft` | any signed-in member | Draft field rules |
| edit (any field, photos, order, alt text) | `draft` | `draft` | owner | Draft field rules; `expected_revision` matches |
| edit (any field, photos, order, alt text) | `active`, `paused` | unchanged | owner | `expected_revision` matches, and the offer must still meet every publish rule after the edit; otherwise `409` or `422` and nothing changes |
| publish | `draft` | `active` | owner | All publish rules pass |
| pause | `active` | `paused` | owner | — |
| resume | `paused` | `active` | owner | All publish rules still pass |
| close | `active`, `paused` | `closed` | owner | Explicit confirmation in the UI |
| delete | `draft` | (removed) | owner | Drafts only; `expected_revision` matches. Offer and photo rows deleted and photo paths queued for storage deletion in one transaction; the `delete` audit event remains. Access guarantee below |

No other transitions exist. In particular, `closed` cannot be
reopened, and `active`/`paused` offers cannot return to `draft`.

### Material fields and content versions

Offer fields fall into three groups. The shared package
(`packages/shared`) defines the groups once; the API, the database
trigger and the tests all use that definition (full table in
`milestone-1.md`, Field groups).

- **Material:** title, description, condition, offering_text, and
  adding or removing a photo. These describe what is being exchanged.
- **Preference:** wants_text. What the owner would like in return;
  it guides proposers but is not part of the item.
- **Discovery metadata:** category, photo order, photo alt text.
  These help people find and view the offer; they do not change what
  is offered.
- Every change in any group increases `revision` (conflict
  detection, §1). Only material changes affect `content_version`. Preference and
  discovery changes are saved and audited but never count as a
  material change (later, they will not affect proposal snapshots;
  see §4, pending).
- Every successful edit that changes a material field increments
  `content_version` by exactly one, in the same transaction.
- Drafts also increment `content_version`, but nothing outside the
  owner can reference a draft.

### Editing an active or paused offer: eligibility and visibility

- An `active` or `paused` offer must **always** satisfy the publish
  rules. An edit that would break them (for example removing the last
  photo, or clearing the title) is rejected; the owner must keep the
  offer valid or close it.
- A valid edit to an `active` offer is visible in the marketplace
  immediately. The state stays `active`. There is no re-review step
  (no moderation exists yet).
- Editing never changes the state. Only the actions in the table do.

### Privacy of non-active offers

- Anyone may read an `active` offer (D6: signed-out visitors
  included). `draft`, `paused` and `closed` offers are readable only
  by their owner.
- To anyone else, a non-active offer does not exist: the API returns
  `404 NOT_FOUND` (never `403`), and the page shows "This offer isn't
  available". The response must not reveal its state.
- The marketplace query filters on `status = 'active'` in the
  database; row-level security enforces the same rule, so even a bug
  in the API cannot return other states.
- Photos live in a **private** storage bucket. Processed files are
  written by the server **with the owner's own session**, so storage
  policies apply to the write. Members can insert only into their own
  offer's folder (draft, active or paused) and can never overwrite or
  delete files directly; deletion is done by the server from the
  cleanup queue. A file can be read or signed only when a photo row
  exists for it and the viewer may read the offer.
- Photos are served through **signed URLs that expire after 10
  minutes** (D5, decided), created with the viewer's own session
  (never the service key), with a refresh endpoint for open pages.
- **Exact access guarantee** (details in `milestone-1.md`, Deletion
  and revocation):
  - Pause or close: from commit, no new link for anyone but the
    owner. Links issued earlier work until they expire (≤ 10 minutes).
  - Photo removal or draft deletion: from commit, no new link for
    anyone, the owner included. Links issued earlier work until they
    expire or the file is deleted, whichever is first: never more than
    10 minutes after the commit, even if storage deletion fails.
  - If storage deletion fails, the file stays stored but unreachable
    by members and visitors until the cleanup job deletes it.
  - Issued links are not revoked instantly, and copies already on a
    viewer's device cannot be revoked.
- Caching does not revoke anything. Photo files carry a cache
  lifetime no longer than the link lifetime; pages and API responses
  that include photo links or non-active offers are `private,
  no-store`, and nothing relies on a cache being cleared.
- Owner-only pages (drafts, My offers) are never cached.
- Status badges for `draft`, `paused`, `closed` appear only on
  owner-only pages.

## 3. Terms and snapshots (PENDING APPROVAL, Milestone 3)

**Terms** = `gives` (items the proposer hands over) + `gets` (items
the offer owner hands over). Each item is one of:
- `{ kind: "offer", offer_id, content_version, snapshot }`, where the
  snapshot copies every material field of the offer at that version
  (title, description, condition, offering_text, photo references);
- `{ kind: "text", description }`.

Snapshots are written once and never updated. Photos referenced by a
snapshot are copied to a snapshot location (or retained) so they stay
viewable even if the owner later removes them from the live offer.

Every field of the terms is material. The free-text note on a
revision is not material.

## 4. How offer changes affect proposals and agreements (APPROVED 2026-10-20)

These rules make §5–6 precise; they do not change their meaning.

**General rule:** a change to a live offer never modifies any proposal
revision or agreement version. Those keep their own snapshots
forever. Historical terms are always shown from snapshots, never from
the live offer.

| Live offer event | Open proposals referencing it | Accepted agreements referencing it |
| --- | --- | --- |
| Material edit | Snapshots unchanged. Revisions made before the edit can no longer be accepted (`TERMS_CHANGED`); the UI on both sides shows "This item changed after these terms were sent" with a link to compare. The turn party can counter with refreshed terms (new snapshot), which the other party must then accept. | Agreement versions unchanged and still binding. Both parties see "The listing has changed since you agreed; your agreement still uses the terms you accepted". No action is required. |
| Non-material edit | No effect | No effect |
| Pause | No effect on existing proposals (DEFAULT D3); no new proposals | No effect |
| Close | DEFAULT D2: auto-decline open proposals, with a system note and notification. Alternative in D2. | **No effect. Closing a listing never cancels, completes or changes an agreement.** The agreement stays in its current state and keeps its snapshot. Cancellation happens only through the agreement's own cancellation actions. |
| Delete | Not possible: only drafts can be deleted, and drafts cannot be referenced | Not possible |

Whether an offer that is part of an `active` agreement should stay
listed is decision D1.

## 5. Proposal (PENDING APPROVAL, Milestone 3)

States: `open`, `accepted`, `declined`, `withdrawn`, `expired`
(`expired` only if expiry is approved). All but `open` are terminal.

**Turn party** = the party who did not author the latest revision.

| Action | From | To | Who | Conditions |
| --- | --- | --- | --- | --- |
| create | — | `open` (revision 1) | any member except the offer owner | Offer `active`; no other `open` proposal by this member on this offer; every `kind: offer` item in `gives` is the proposer's own `active` offer |
| counter | `open` | `open` (revision N+1) | turn party | New terms differ materially from revision N; referenced offers `active` |
| accept(revision_id) | `open` | `accepted` | turn party | `revision_id` = latest; every referenced offer is `active` and its current `content_version` equals the snapshot's; creates Agreement version 1 in the same transaction |
| decline | `open` | `declined` | turn party | — |
| withdraw | `open` | `withdrawn` | author of the latest revision | — |
| auto-decline | `open` | `declined` | system | Target offer closed (DEFAULT D2) |
| expire | `open` | `expired` | system | Only if expiry is approved |

Revisions are append-only, each with number, author, terms, note and
timestamp; the UI shows all of them with change chips against the
previous revision. Acceptance applies to one exact revision; every
counteroffer requires the other party's acceptance.

## 6. Agreement (APPROVED 2026-10-20, Milestone 4)

States: `active`, `amendment_pending`, `cancellation_requested`,
`completed`, `cancelled`. `completed` and `cancelled` are terminal.

Version 1 is created from the accepted revision and counts as accepted
by both parties. The **binding version** is the latest version both
have accepted. Accepted versions are never edited.

| Action | From | To | Who | Conditions |
| --- | --- | --- | --- | --- |
| confirm handover | `active` | `active`, or `completed` once both have confirmed | each party, once | See §6.1 |
| propose amendment | `active` | `amendment_pending` | either party | No handover confirmed yet (DEFAULT D4); terms differ materially from the binding version; creates one pending version, implicitly accepted by its proposer |
| accept amendment(version_id) | `amendment_pending` | `active` | see §6.2 | Pending version becomes binding |
| reject amendment(version_id) | `amendment_pending` | `active` | see §6.2 | Pending version marked rejected; binding version unchanged |
| withdraw amendment(version_id) | `amendment_pending` | `active` | the party who proposed it | Pending version marked withdrawn |
| request cancellation | `active` | `cancellation_requested` | either party | Reason 3–500 characters |
| accept cancellation | `cancellation_requested` | `cancelled` | the other party | — |
| reject cancellation | `cancellation_requested` | `active` | the other party | — |
| withdraw cancellation | `cancellation_requested` | `active` | the requester | — |

### 6.1 Handover confirmation

- **Storage:** `handover_confirmations` (agreement_id, party_id,
  agreement_version_id, confirmed_at), primary key
  (agreement_id, party_id). One row per party, ever. The row records
  which binding version the party confirmed against.
- **Authorization:** only a party to the agreement, only while the
  agreement is `active` (not `amendment_pending` or
  `cancellation_requested`), and only for themselves.
- **Duplicate requests:** if the party has already confirmed, the
  request returns `200` with the existing confirmation; no new row and
  no new audit event. With an idempotency key, the stored response is
  returned.
- **Concurrency and completion:** the transaction locks the agreement
  row, inserts the confirmation, counts confirmations, and if both
  parties have confirmed sets `completed` in the same transaction.
  Because the row is locked, two simultaneous confirmations are
  serialized: the first records one confirmation; the second records
  the other and completes. A database constraint rejects `completed`
  unless two confirmations exist.
- Confirmations cannot be undone (DEFAULT, part of D4).

### 6.2 Amendment acceptance and rejection

- Only the party who did **not** propose the pending version may
  accept or reject it. The proposer may only withdraw it.
- The request must name the exact pending `version_id`. If it does
  not match the agreement's single pending version (for example it
  was withdrawn, or a different one is pending), the response is
  `409 CONFLICT` and nothing changes.
- The agreement row is locked during the check; at most one version
  can be pending at a time (database constraint).
- Third parties get `404 NOT_FOUND`; the proposing party trying to
  accept gets `403 FORBIDDEN`.

### 6.3 Platform fee (owner's fee policy approved 2026-10-18; built with §6)

This adds no state and does not approve §6. When agreements are
built, they follow `specs/valuation-and-fees.md` §1–2: the fee becomes
due once both parties accept the final agreement, including the
applicable assessed value and fee quote, and before performance
begins; no liability exists before that; each party pays their own
50% share; the exchange does not proceed until both shares are
confirmed paid (deadlines and expiry to be defined first); a revised
fee quote needs both parties' reconfirmation; refunds follow §2 of
that spec, with no partial releases.

## 7. Permissions summary

| Data | Who can read |
| --- | --- |
| `active` offer | everyone (D6) |
| `draft`, `paused`, `closed` offer | owner only; others get 404 |
| Proposal and its revisions | the proposer and the offer owner |
| Agreement, versions, confirmations | its two parties |
| Audit events | not exposed in the UI at launch |

## 8. Decisions needing the owner

| # | Decision | DEFAULT used in the specs | Needed by |
| --- | --- | --- | --- |
| D1 | When an offer becomes part of an accepted agreement, should the listing stay active, be paused automatically, or be closed automatically? | **DECIDED 2026-10-20 (owner): default kept.** Nothing automatic: the listing stays as it is and the owner is prompted to pause or close it | Milestone 3 |
| D2 | When an offer is closed, what happens to its open proposals? Auto-decline them, or keep them open but unacceptable until they are withdrawn? | **DECIDED 2026-10-20 (owner): default kept.** Auto-decline with a system note | Milestone 3 |
| D3 | When an offer is paused, can open proposals on it still be accepted? | **DECIDED 2026-10-20 (owner): default kept.** Yes | Milestone 3 |
| D4 | Amendments only before any handover is confirmed, and confirmations cannot be undone? | **DECIDED 2026-10-20 (owner): default kept.** Yes to both | Milestone 4 |
| D5 | How long a photo link lasts | **DECIDED 2026-10-15: 10 minutes, with refresh.** Issued links are not revoked; the bounded window is documented in §2 | Milestone 1 |
| D6 | Can signed-out visitors browse active offers? | **DECIDED 2026-10-15: yes** (default kept) | Milestone 1 |
| D7 | Category and condition lists | **DECIDED 2026-10-15: defaults kept** (see `milestone-1.md`) | Milestone 1 |
| D8 | iPhone photos (HEIC) | **DECIDED 2026-10-15: option A**, JPEG, PNG and WebP only. iPhone conversion to JPEG is an assumption verified on a real iPhone in unit 07; HEIC that arrives anyway gets a clear error. Options B (server conversion) and C (browser conversion) stay available for later | Milestone 1 |
| D9 | How a real iPhone reaches the app for the unit 07 test | **DECIDED 2026-10-15:** try a temporary private link first; fall back to a preview deployment with owner-created free accounts | Milestone 1, unit 07 |

## 9. Acceptance criteria for this model

- [ ] `packages/shared` exports the offer transition table and a
      transition function that returns the next state or a typed
      error; tests cover every allowed row and, for every action, at
      least one rejected state and one rejected actor.
- [ ] A test asserts the database transition table equals the shared
      one.
- [ ] Fault-injection tests prove that when the audit insert (or any
      later step) fails, the state is unchanged and no audit or
      idempotency row exists.
- [ ] Idempotency tests: a missing key returns 400; same key returns
      the same response once executed; same key with a different
      body, endpoint or resource returns 422; two members' identical
      keys are independent; a concurrent retry with the same key waits
      and returns the stored response; a repeat without the same key
      and a stale revision or state returns 409.
- [ ] Concurrency test: two simultaneous publish calls produce one
      transition and one audit row.
- [ ] Every UI status label comes from the shared status-label
      function, and the label set equals the table in `ui-context.md`.
- [ ] Stale-revision tests: two writes based on the same revision
      (material edit, non-material edit, alt text, reorder, photo add
      or remove, transition) never both apply; the second gets `409`
      and nothing changes.
- [ ] Draft deletion leaves its `delete` audit event in place.
- [ ] Photo access follows the exact guarantee in §2, including when
      storage deletion fails.
- [ ] Proposal and agreement tests cover §5–6 (approved 2026-10-20).
