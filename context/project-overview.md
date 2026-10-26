# BATR

## Overview

BATR is a peer-to-peer exchange marketplace on web and native
mobile. A member publishes an **offer** describing what they have
and what they would take in return. Another member answers with an
**exchange proposal**. The two negotiate through **counteroffers**
until one side accepts the other's latest terms, which creates an
**agreement**: a fixed record of who gives what to whom, which both
parties then track to completion. BATR is not a store. There is no
seller-to-buyer checkout; every transaction has two parties who
each give something.

> Source of this definition: the owner's brief (BATR name, logo,
> "peer-to-peer exchange marketplace", the three priority flows and
> the six feature areas). Anything beyond that is listed under
> Open Questions in `progress-tracker.md` instead of being assumed.

## Goals

1. A signed-in member can create and publish an offer in one
   uninterrupted flow on web and on mobile.
2. A member can propose an exchange against a published offer, and
   both parties can counter until terms are accepted, declined,
   withdrawn or expired, with every revision preserved.
3. Accepting the latest terms produces an agreement both parties
   can review and track to a completed or cancelled end state.
4. Every proposal, counteroffer and agreement is visible only to its
   two parties (and to moderators, if moderation is approved).
5. Web and mobile share one domain model and one set of state rules,
   so a proposal looks and behaves the same on both.

## Core User Flow

1. A visitor browses or searches published offers (signed out
   allowed: see Open Questions).
2. The visitor signs up or signs in to act.
3. **Create an offer:** the member adds photos, a title, a
   description, a category, condition, what they are offering, and
   what they want in return, previews it, and publishes it.
4. Another member opens the offer and taps **Propose exchange**.
5. **Propose:** they choose what they will give (from their own
   offers or a free-text item) and what they ask for from the offer,
   add a note, and send. The offer owner is notified.
6. **Negotiate:** the owner accepts, declines, or counters. Each
   counter is a new revision of the proposal. The thread alternates
   until one side accepts the other's latest revision, or someone
   declines or withdraws, or the proposal expires.
7. **Agreement:** acceptance creates an agreement whose terms are the
   accepted revision. Both parties see it in **Agreements**. Any later
   change to the terms needs renewed acceptance by both; until then
   the earlier terms stay binding.
8. **Track:** the parties arrange the handover by message, each party
   marks their side as handed over, and when both confirm the
   agreement is completed. Either party can request cancellation
   before completion.
9. Messaging and notifications run alongside steps 5–8.

## Features

### Marketplace discovery
- Browse feed of published offers, search, and category filters.
- Offer detail page with photos, terms and owner summary.
- Detail in `specs/01-marketplace-discovery.md`.

### Offers
- Create, preview, publish, edit, pause and close an offer.
- "My offers" list with status.
- Detail in `specs/02-offer-creation.md`.

### Proposals and counteroffers
- Propose against an offer, counter, accept, decline, withdraw.
- Revision history with clear "what changed" diff.
- Detail in `specs/03-exchange-proposals.md`.

### Agreements
- Versioned terms (changes need renewed acceptance), status
  timeline, per-party handover confirmation, completion and
  cancellation.
- Detail in `specs/04-agreement-management.md`.

### Accounts and permissions
- Sign up, sign in, sign out, profile basics, role-based access.
- Detail in `specs/05-auth-and-permissions.md`.

### Messaging and notifications
- One message thread per proposal (continuing into its agreement).
- In-app notifications; push on mobile and email are PROPOSED.
- Detail in `specs/06-messaging-and-notifications.md`.

## BATR Exchange and BATR Professionals (owner, 2026-10-17)

BATR Professionals is part of the same BATR platform, not a separate
app or unrelated product. BATR Exchange covers the general product,
skill and service exchange marketplace; BATR Professionals serves the
professional-services dimension. Professionals keep one identity and
can take part in relevant product, service and cash-supported
exchanges. The design system and the underlying exchange
infrastructure are shared where appropriate. The professional-specific
requirements are documented and approved before those workflows are
designed or built.

Open points raised by this decision (not resolved here):
- "Cash-supported exchanges" and the out-of-scope rule on money
  moving through BATR below: recorded only (open question 2) or
  processed payments? Until the owner decides, BATR records a cash
  part at most and moves no money. (2026-10-17: valuation records the
  cash part and quotes the fee; no money is collected.)
- Kinds of exchange (open question 1): this statement names
  products, skills and services; see the tracker.



### In Scope
- Web app and native mobile app (iOS and Android) sharing one
  backend and domain model.
- The six feature areas above.
- The three priority flows end to end: create an offer; propose and
  negotiate; review, accept and track an agreement.

### Out of Scope (until the owner decides otherwise)
- Money moving through BATR: payment collection, escrow, wallets,
  invoices. (Owner, 2026-10-17: structured valuation and the 3%
  platform fee calculation and quotes are in scope and built; barter
  plus cash is an exchange type. Collecting fees needs a payment
  provider and the decisions in `specs/valuation-and-fees.md` §8.)
- Shipping labels, courier integration, delivery tracking.
- Ratings, reviews, verification badges and any other trust claim,
  until a defined and implemented evidence source exists.
- Dispute resolution workflow beyond a cancellation request.
- Identity verification / KYC.
- Admin back office beyond what moderation needs, if approved.
- Promotions, sales banners, newsletters, coupons.
- AI features.

## Success Criteria

1. A signed-in member can publish an offer with at least one photo on
   web and on mobile, and it appears in the discovery feed.
2. A second member can send a proposal against that offer; the owner
   sees it and is notified.
3. The two members can exchange at least three counteroffers, and each
   revision remains viewable with its changes highlighted.
4. Accepting the latest revision creates exactly one agreement whose
   terms match that revision; accepting a stale revision is rejected.
5. Both parties can mark their handover; the agreement shows
   **Completed** only after both have.
6. A third member cannot read or act on that proposal or agreement
   through the UI or the API.
