# Structured valuation, assessment, appeals and the 3% platform fee

Status: built locally on 2026-10-17 from the owner's brief of the same
day ("Structured Valuation, Assessment, Appeals & Integrated 3%
Platform Fee"). The owner approved the launch policies on 2026-10-18
("Finalize Valuation and Fee Policies"), with two changes from the
recommendations: **two appeals per valuation**, and **the assessed
value is shown to signed-in members only**. On 2026-10-18 the owner
also made the final decisions on four open questions: keep the visitor
indicator (§7), members-only value (§7), repeat valuations (§6.1) and
**PDF uploads disabled until malware scanning is integrated and
tested** (§4). Not pushed, merged or deployed. Proposals, agreements, milestones, disputes and completion
are not built (their specs, `state-model.md` §3–6, are still pending
approval), so the fee is calculated and quoted here but is never owed
or collected yet. No payment collection is authorized.

Code: `packages/shared/src/valuation/`, migrations
`supabase/migrations/20261017000400_valuation.sql` and
`20261018000100_valuation_policy_decisions.sql` and
`20261018000200_valuation_final_decisions.sql`, API in
`apps/web/server/api/valuation.ts` and `apps/web/app/api/v1/{valuations,review,offers/[id]/valuation,payments}`,
screens at `/offers/[id]/valuation`, `/review` and `/review/valuations/[id]`.

Each approved policy below says whether it is **built now** or
**applies when** a later milestone is built (§10 lists them together).

## 1. Platform fee (approved; built now)

The owner's rules, quoted: "BATR charges a 3% platform fee on the
applicable total exchange value. The total platform fee is calculated
once, and the two parties each bear 50%… Both parties pay their
respective shares to BATR in cash."

| Exchange type | Fee basis | Owner's example |
| --- | --- | --- |
| Pure barter | Assessed non-cash value | ₦100,000 → fee ₦3,000; ₦1,500 each |
| Barter plus cash | Assessed non-cash value + agreed cash, counted once | ₦100,000 + ₦20,000 → fee ₦3,600; ₦1,800 each |
| Cash only | Agreed cash value | ₦100,000 → fee ₦3,000; ₦1,500 each |

No separate 3% is ever charged on the cash in a barter-plus-cash
exchange. Each exchange type enforces its own inputs: pure barter has
no cash and needs an assessed value; barter plus cash needs both; cash
only has nothing to assess and needs the cash amount.

### Arithmetic and rounding

- Every amount is an integer number of kobo (NGN minor units). No
  floating point is used: the browser and API use integer and BigInt
  arithmetic, the database uses `bigint`.
- Total fee = basis × 300 / 10,000, **rounded half up** to the kobo.
- Party B's share = ⌊total / 2⌋; party A's share = total − party B's
  share. The shares always add up exactly to the total.
- When the total is an odd number of kobo, **party A (the offer
  owner) bears the extra kobo** (approved 2026-10-18).
- The calculation exists twice, `calculatePlatformFee` (shared) and
  `private.platform_fee` (database, authoritative). A parity test
  compares them on every exchange type, rounding edges and the largest
  allowed amount (₦1 trillion).

### Policy versions

The fee rate lives in `private.fee_policies` (version
`fees-2026-10-17`, 300 basis points, 50/50, NGN; unchanged by the
approval). A new version is added, never edited; every fee quote
stores the basis, the rate, both shares and the policy version it was
calculated under.

### Quotes, the liability point and fee timing

- A **fee quote** is created when a value is approved (or when a
  cash-only valuation is sent). **A quote alone is not a debt.**
- When an appeal (or any later decision) revises the value, the old
  quote is marked superseded and linked to the new one, and the new
  quote is flagged `requires_reconfirmation`: **both parties must
  reconfirm the revised fee before the exchange proceeds**. Built now:
  the supersession and flag. Applies when agreements are built: the
  agreement workflow refuses to proceed until both have reconfirmed.
- **Liability-creation point (approved):** the fee becomes due after
  both parties accept the final agreement, including the applicable
  assessed value and fee quote, and before exchange performance
  begins. No fee liability exists before that point. Each party then
  owes and pays their own 50% share.
- **Enforcement (applies when agreements are built):** the exchange
  must not proceed until both shares are confirmed paid. Payment
  deadlines, expiry and what happens when a share is not paid in time
  must be defined before enforcement is implemented (§11).
- Built now: `private.create_fee_liabilities` creates one liability
  per party from a current quote, idempotently, and is called only in
  tests. Payment attempts, verified payments, refunds and adjustments
  are separate tables. Cash the members exchange with each other is
  never recorded as BATR money.

### Payment provider, charges and tax (approved; applies before live payments)

- **Flutterwave** remains the intended provider.
- **BATR absorbs provider processing charges** at launch, so each
  member's agreed share is unchanged. Charges are recorded in
  `fee_payments.provider_charge_kobo` as BATR's cost, never added to a
  share.
- **Taxes are shown separately** from the platform fee
  (`fee_payments.tax_kobo`; the fee breakdown gains a separate tax
  line when a tax treatment exists). No tax is calculated today.
- **Qualified Nigerian tax advice** is required before live payments.
- Before production payment activation: transaction verification with
  the provider, authenticated webhook processing, reconciliation,
  idempotency, and tested refund handling.

### What payment functionality is operational

None. No payment provider account, keys or webhook are configured, and
BATR does not start payments. The Flutterwave notification route
(`POST /api/v1/payments/flutterwave/webhook`) answers 503 until
`FLUTTERWAVE_WEBHOOK_HASH` is set. When set, it accepts only
notifications whose `verif-hash` header matches (constant-time
comparison), stores each event once by provider event id with only the
fields needed to match a payment (no customer name, email or phone),
and does not apply it to any liability: Flutterwave's transaction
verification call is not implemented. The screens say the fee is a
quote, not a bill, that it becomes due only when both members accept
the final agreement, and that it cannot be paid in BATR yet.

### Escrow and payment protection (approved)

There is no escrow or payment protection at launch. BATR's platform
fee is never described as insurance, escrow, a delivery guarantee or
protection against loss; the fee note says so. Any future protection
service is a separately scoped product and policy decision.

### Currency (approved)

NGN only. The fee policy table accepts only `NGN`. No other currency
until fee calculation, rounding, exchange rates, refunds and tax
treatment have been designed and tested.

## 2. Refunds, cancellations and disputes (approved; applies with agreements and payments)

Prepared for the agreement and payment milestones; nothing here is
implemented, and nothing writes refunds or adjustments today.

1. No fee liability exists before the liability-creation point (§1),
   so cancelling before it involves no fee.
2. **Cancelled after fees are paid but before either party starts
   performance:** refund both platform fees, subject to applicable law
   and clearly disclosed payment-provider costs.
3. **BATR cancels because of its own error:** refund the affected
   platform fees.
4. **Dispute after performance begins:** BATR reviews the
   circumstances before deciding a refund or adjustment. No automatic
   penalty for either party, and no automatic refund promised in a
   disputed case.
5. **No partial releases** at launch.
6. Every refund, adjustment and cancellation is auditable and
   idempotent. Today `fee_refunds` (payment, amount, reason, status)
   and `fee_adjustments` (liability, amount, reason, created by) exist
   but nothing writes them. Required when implemented: an acting
   member on refunds, an idempotency key and the provider's refund
   reference on both, writes only through database functions with the
   same idempotency handling as everything else, and refund status
   changes kept as history rather than overwritten.

Open before implementation (§11): what "starts performance" means for
goods, services and skills; whether provider costs are ever deducted
from a refund or BATR absorbs them as it does charges; who in BATR
decides a dispute and within what time; how a member is told.

## 3. Submission form (built now)

A member starts a valuation from their own offer (not a closed one).
One open valuation per offer; a withdrawn or refused one stays as
history.

Common fields: exchange type, cash amount (barter plus cash, cash
only), and one or more items (up to 10), each with kind (physical
goods, service, skill), category, optional subcategory, description,
quantity, unit and the value the member proposes. A mixed exchange is
items of more than one kind.

Category-specific questions are one list, `details.ts`, read by the
form, the API and the database (`private.valuation_detail_fields`,
parity-tested):

- Physical goods: product name, brand, model, model number,
  identifiers (serial or IMEI; seen only by the member and reviewers),
  purchase date or approximate age, new/used/refurbished/repaired,
  condition, condition notes, whether it works, test results, known
  defects (yes/no, and a description when yes), missing parts,
  previous repairs, accessories, specifications, dimensions, warranty,
  authenticity, usage history, price paid, similar items seen.
- Services and skills: type, scope, deliverables, acceptance
  criteria, estimated hours, complexity, schedule, recurrence,
  sessions, materials, travel, extra expenses, experience,
  qualifications, revisions included, exclusions, dependencies,
  limitations, comparable rates.

Condition grades, as given: New or unused; Excellent; Good; Fair;
Poor; For parts or repair; Unknown or not assessed.

Sending for review needs: every required answer; a description of at
least 10 characters; a proposed value; at least **two photos of the
actual item** for each physical item; the exchange-type rules above;
and the declaration that the information and evidence are accurate and
complete, every known defect is disclosed and the photos show the
actual item. The database checks all of this again
(`private.valuation_problems`).

## 4. Evidence protection, document safety and retention

### Protection (built now)

- Private bucket `valuation-evidence`; files at
  `{member}/{valuation}/{evidence}.webp`, 10 MB each, at most 30
  per valuation. (The `.pdf` path and `application/pdf` type return
  only if PDF uploads are re-enabled; see Document safety.)
- Photos: JPEG, PNG or WebP, checked by signature, then re-encoded as
  WebP on the server, removing hidden data such as GPS location and
  camera details. The original is never stored.
- Receipts, invoices, warranties, repair records and supporting
  documents are marked sensitive. Receipts, serial numbers, private
  evidence and internal reviewer notes are restricted to the
  submitting member and authorized BATR staff. Nothing is shown to
  the other party.
- Reading a file needs a link that expires after two minutes, created
  with the reader's own session. The storage policy allows only the
  uploader, and BATR staff once the valuation has been sent. Other
  members and visitors cannot read, sign, list or overwrite files.
- Evidence can be removed only from a draft that was never sent. Once
  BATR has seen it, it is kept with the history.
- The upload form asks members to cover personal details they don't
  need to show (card and account numbers, home address, other people's
  names).

### Document safety: PDFs disabled (owner decision 2026-10-18; built now)

**PDF uploads are disabled until malware scanning is integrated and
tested.** Members photograph or screenshot a receipt, invoice,
warranty or other document instead; those images go through the same
checks as item photos (signature check, re-encoding to WebP, metadata
removed) and are still marked sensitive. Permitted image uploads are
unchanged.

Enforced at every layer, so no route can store a PDF:

- **Policy:** `pdf_uploads_enabled` is false in valuation policy
  `valuation-2026-10-18b`, parity-tested with the shared constant
  `VALUATION_POLICY.pdfUploadsEnabled`.
- **Storage:** the `valuation-evidence` bucket accepts only
  `image/webp`, so even a direct upload with the member's session is
  refused.
- **Database:** a trigger on `public.valuation_evidence` refuses any
  `application/pdf` row while the policy disables PDFs (422
  `UNSUPPORTED_FORMAT`, reason `pdf_disabled`), whichever function or
  direct write tries it.
- **API:** the shared file check refuses a PDF before anything is
  stored, with "BATR isn't accepting PDF files yet. Upload a photo or
  screenshot of the document instead (JPEG, PNG or WebP)."
- **Screen:** the file picker no longer offers PDFs and the documents
  section says so.

Re-enabling PDFs needs a tested malware scanner first, then a new
policy version, the bucket's allowed types, and the owner's approval.
The structural PDF check (refusing files that name scripts, launch
actions, embedded files, rich media or XFA forms) stays in the code
for that day, but **it is not a malware scan**.

### Retention and deletion (approved default; not implemented)

- Proposed default: keep valuation evidence and records for **24
  months after the valuation closes** (withdrawn, or no longer
  appealable and not used in an agreement), then delete files and
  personal fields.
- Longer retention where there are legitimate legal obligations,
  active disputes, investigations or other applicable requirements, as
  a recorded hold with a reason and an expiry or review date.
- **Account deletion:** files and records not under a hold are
  deleted; records that must be kept (for example a fee payment, a
  disputed agreement, or a valuation used in an agreement) are kept
  under their hold, separated from the profile and reduced to what the
  obligation needs.
- **Current behaviour does not satisfy this policy:** there is no
  account-deletion feature yet, and if a member's account is removed
  from the database their valuation rows go with it by cascade while
  their evidence files are not queued for deletion; there is no closure timestamp or scheduled deletion,
  and holds do not exist. Implementing it needs a closure date on
  submissions, a hold table, a retention job (alongside the unscheduled
  storage cleanup job) and an account-deletion path that respects
  holds.
- Before launch: publish a clear retention policy and verify the
  applicable Nigerian data-protection requirements (NDPA 2023).

## 5. Review, staffing and inspections

### Staff roles (built now)

Reviewers and inspectors are BATR staff listed in
`private.staff_roles`, granted only with SQL by the service role.
There is no admin screen (G5 and G14). Every grant, change and removal
is recorded in the append-only `private.staff_role_events` (member,
role, action, database role and acting member, time). Staff never see
or act on their own valuations (the database refuses with
`own_submission`).

### Reviewer workspace (built now)

The workspace shows every answer and file, and records:

- **Market comparisons**: source, link, date seen, asking price,
  verified sale price or quoted rate, condition and characteristics,
  and adjustments (age, condition, defects, quantity, completeness,
  scope, other; −90% to +90% each). Adjusted price = price × (100% +
  the sum), rounded half up; the database and shared code are parity
  tested. A comparison can be excluded with a reason and included
  again. The workspace shows the low, median and high of the included
  comparisons per item.
- **Decisions**: approve a value (one value per item; the total is
  the assessed non-cash value), ask for more evidence, require an
  inspection, or not approve. Every decision needs a rationale and a
  confidence level; limitations and a message to the member are
  optional (a message is required when asking for something).
- **Internal notes**, never shown to members.

Assessments are append-only versions with the reviewer, rationale,
confidence, limitations, whether an inspection was completed, and the
valuation policy version.

### Inspections (approved; built now)

A reviewer may require a physical inspection case by case, with a
documented rationale (the decision's rationale and a message of at
least 10 characters saying why). Staff schedule it (date, place and
arrangements), complete it (findings of at least 20 characters and,
optionally, the condition confirmed) or cancel it with a reason.
**Once an inspection is required, no value can be approved until it
is completed.**

The automatic inspection threshold
(`private.valuation_policies.inspection_threshold_kobo`) **stays
unset**; no value requires inspection automatically. If the owner
ever sets one, approving a total at or above it needs a completed
inspection.

To document before inspections run for real (§11): who schedules and
travels, who bears travel costs, safety rules (public places,
daylight, two people, no cash carried), each party's responsibilities,
and what completion evidence is kept (findings today; photos taken at
the inspection are not yet supported).

## 6. Appeals: two per valuation (approved; built now)

- A member can appeal **up to two times per valuation**. Each appeal
  challenges the **latest eligible decision**: the latest assessment
  (an approved value or a refusal), or a later appeal decision that
  upheld it. A valuation can be appealed only while it is `assessed`
  or `not_approved`, so a second appeal is possible only after the
  first one concludes.
- **Who handles an appeal:** never the reviewer whose decision is
  being appealed, and never a reviewer whose decision was appealed
  earlier on the same valuation. After the first appeal is upheld,
  the second appeal excludes the reviewer who upheld it as well as the
  original reviewer. A reviewer whose decision was appealed has
  **read-only access** to that valuation from then on: no decisions,
  comparisons, notes, evidence requests, inspection updates or appeal
  assignments.
- **The database enforces this**, not the screens: the appeal
  function counts appeals under the submission's row lock; a trigger
  refuses a third insert; a check holds `appeal_number` to 1 or 2 and
  a unique key allows one appeal per number; a trigger on assignment
  refuses an excluded reviewer, the submitter or anyone without the
  reviewer role, whichever function or direct write tries it; and
  triggers on comparisons, notes, requests, inspections and
  assessments refuse writes by an excluded reviewer. The limit is part
  of the valuation policy (`appeals_max`, version
  `valuation-2026-10-18`), parity-tested with the shared constant.
- **First appeal outcomes:** upheld; revised (a new assessment version
  and a new fee quote needing both parties' reconfirmation); more
  evidence required; inspection required; not approved. After evidence
  or an inspection, a reviewer who is not excluded makes the next
  decision, which the second appeal can then challenge.
- **The second appeal is final.** It has the same outcomes; no third
  appeal is accepted (409 `appeal_limit_reached`).
- Assessment history, appeal history (each numbered), fee-quote
  supersession and the reconfirmation flag are all kept.
- The member can add evidence while an appeal is open. New evidence
  after the limit is reached means starting a new valuation, under the
  repeat rules in §6.1.
- A repeated appeal request with the same idempotency key returns the
  stored response and does not use up the second appeal.
- If no eligible reviewer exists, the appeal waits; running two
  appeals needs at least three reviewers.

### 6.1 Repeat valuations (owner decision 2026-10-18; built now)

A genuinely new valuation receives its own allowance of up to two
appeals, the second final. Resubmitting the same thing must not get
round a decision, so:

- **When the rule applies.** A new valuation is a *repeat* when the
  same member already has an earlier valuation that BATR decided (it
  has an assessment), and the new one is either for the **same
  offer** or reuses **any of the same files** (on any offer). The
  rule applies after any decided valuation, not only once both appeals
  are used, so withdrawing and resubmitting cannot be used to reset
  the appeal count either.
- **What a repeat needs.** At least one of:
  - **genuinely new evidence:** a file whose fingerprint appears in
    none of the member's earlier valuations; or
  - **a material change:** a change to the exchange type, the cash
    amount, or an item's kind, category, subcategory, description,
    quantity, unit or answers.

  Changing only the value the member proposes does not count. Without
  either, sending is refused (409 `repeat_without_change`: "BATR has
  already decided a valuation of this item. To send a new one, add new
  evidence or change the details, and tell BATR what's new."). A
  repeat also needs a note of at least 20 characters saying what is
  new (422, field `note`).
- **How it is detected.** In `public.valuation_submit`, under the
  submission's row lock. A file's fingerprint is the MD5 that storage
  records for the stored bytes (the eTag); because photos are
  re-encoded deterministically, sending the same photo again produces
  the same fingerprint. Facts are compared after normalizing case and
  spacing and ignoring ids and proposed values. A file with no
  fingerprint never counts as new.
- **What is recorded.** The repeat stores `repeat_of` (the earlier
  valuation) and `repeat_reason` (the member's note), and the
  `submitted` event records both. The member sees, while drafting, that
  the earlier valuation was decided and what is needed. Reviewers see
  a banner on the repeat with the earlier outcome, appeals used,
  whether it was final, a link to it, and the member's note. Reviewers
  judge whether the change is genuine; a trivial edit or a slightly
  altered photo passes the database check, so the reviewer can decide
  it on its merits, and can refuse it with a rationale.
- **Reviewer independence.** Every reviewer excluded on the earlier
  valuation (because a decision of theirs was appealed) stays excluded
  on the repeat, following the `repeat_of` chain. They have read-only
  access to it and cannot take its appeals.
- **Fee quote.** A repeat's first fee quote is flagged as needing
  both parties' reconfirmation when the earlier valuation had a quote,
  exactly as a revised value does.
- **Appeals.** The repeat starts with two appeals of its own, the
  second final.

## 7. Assessment visibility: signed-in members only (approved; built now)

| Viewer | Sees |
| --- | --- |
| Signed-out visitor | "Assessed by BATR. Sign in to see the assessed value." on an active assessed offer (kept by the owner on 2026-10-18). No amount, confidence, date, inspection status or other detail. |
| Signed-in member | On an active offer: the assessed total, confidence, whether it was inspected, and the date (any authenticated BATR member, owner decision 2026-10-18). |
| The submitting member | Their whole valuation: answers, evidence, assessments with rationale and limitations, included comparisons, appeals and the fee quote. Never staff identities, internal notes, internal events or excluded comparisons. |
| Authorized BATR staff | Everything, except on their own valuations. |

Enforced on every path, not just the page component:

- `public.offer_valuation_summary` is granted to signed-in callers
  only and also returns nothing without a caller.
  `public.offer_assessment_indicator` (granted to visitors) returns
  only true or false.
- The offer page loads the summary only for a signed-in member; a
  visitor's server-rendered HTML and RSC payload never contain the
  value. Offer pages are rendered per request and not publicly cached.
- The offer API (`GET /api/v1/offers/:id` and the list) never
  includes valuation data; the valuation endpoints need sign-in and
  belong to the submitting member; page metadata contains only the
  offer title.
- Regression tests at the database, API and browser levels prove a
  signed-out visitor cannot retrieve the exact assessed value.

## 8. States

`draft` → `submitted` → `evidence_requested` | `inspection_required` |
`assessed` | `not_approved`; `evidence_requested` → `submitted` when
the member sends it back; `assessed` or `not_approved` → `appealed`
(at most twice) → an appeal outcome; any open state → `withdrawn` by
the member. A cash-only valuation goes from `draft` straight to
`assessed` with a fee quote and no assessment.

Every change is a database function that checks who is acting, the
revision the caller last saw and the allowed states, records an event
(`valuation_events`, with internal events hidden from members) and
stores the response against the idempotency key.

## 9. Integration with later milestones

Built now so agreements can use it: the fee quote with its basis,
shares and policy version; supersession and the reconfirmation flag;
the liability, attempt, payment, refund and adjustment records; and
the idempotent provider-event store. Not built: proposals, agreements,
milestones, disputes, completion, notifications, and the step that
ties a quote to an agreement and both parties.

## 10. Where each approved policy lands

| Policy | Built in this milestone | Applies when later work is built |
| --- | --- | --- |
| A. Fee calculation | Yes (unchanged; odd kobo to the offer owner) | — |
| B. Inspections | Yes (threshold unset; case by case; approval blocked until complete) | Logistics and safety rules before real inspections |
| C. Two appeals | Yes (database-enforced limit, conflict rules, repeat valuations) | — |
| D. Refunds, cancellations, disputes | Ledger tables only | Agreement, payment and dispute milestones |
| E. Fee timing | Quote is not a debt; liabilities only from agreements | Agreement workflow: due point, both shares paid before performance, deadlines |
| F. Provider, charges, tax | Charge and tax columns; webhook route off until configured | Provider integration, tax advice, verification, reconciliation |
| G. No escrow | Wording on the fee note | Separate product decision if ever |
| H. Retention | — | Retention job, holds, account deletion path, published policy |
| I. Staffing and safety | Roles, audit log, conflict rules, PDF uploads disabled | Malware scanning (then the owner decides on re-enabling PDFs); inspection procedures |
| J. Members-only value | Yes (database, API, page, tests) | Visibility inside proposals and agreements |
| K. NGN only | Yes (fee policy accepts NGN only) | — |

## 11. Outstanding before production

The owner answered the four open policy questions on 2026-10-18
(visitor indicator kept; any signed-in member sees the value; repeat
valuations per §6.1; PDFs disabled). Still needed before the related
feature ships (owner, legal, operations or provider):

1. Payment deadlines, quote expiry, and cancellation when a share is
   not paid in time.
2. What "starts performance" means for each kind of exchange, for the
   refund rule.
3. Whether provider costs are ever deducted from a refund.
4. Who decides disputes, the time allowed, and how members are told.
5. Tax treatment of the fee (qualified Nigerian tax advice).
6. Flutterwave account, keys, webhook hash, verification and
   reconciliation. No live credentials are configured and payments
   are not activated.
7. A malware scanning service, integrated and tested, before PDFs can
   be re-enabled.
8. Retention: NDPA compliance check, the hold process, the retention
   job, an account-deletion path, and the published policy.
9. Reviewer and inspector staffing (at least three reviewers for two
   appeals), who grants roles, and inspection logistics, costs and
   safety.
10. What happens to an evidence request that the member never answers
    (no expiry today).
11. Verification still outstanding: GitHub CI, WebKit and the
    real-iPhone test. BATR is not production-ready.
