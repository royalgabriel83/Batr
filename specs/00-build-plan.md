# BATR Build Plan

Ordering rules: dependencies first, security before functionality,
backend before UI wiring, web before mobile for each flow, packages
installed only in the unit that first needs them.

Cross-cutting rules: `state-model.md` (states, transitions,
permissions, revision history, renewed acceptance).

| Feature spec | Covers |
| --- | --- |
| `state-model.md` | Offer, proposal and agreement state machines |
| `01-marketplace-discovery.md` | Feed, filters, offer detail |
| `02-offer-creation.md` | Create, preview, publish, manage offers |
| `03-exchange-proposals.md` | Propose, counter, accept, decline, withdraw |
| `04-agreement-management.md` | Agreement versions, amendments, handover, completion, cancellation |
| `05-auth-and-permissions.md` | Accounts, sessions, roles, access rules |
| `06-messaging-and-notifications.md` | Threads, in-app, push and email |

## Milestone 1: Offers on the web (APPROVED 2026-10-15; units 01–08 built, not release-ready)

Full specification and acceptance criteria: `milestone-1.md`.
Units 01–08: scaffold, tokens and primitives, shared offer rules,
database, auth, offer API, create and manage offers, marketplace.
Added by the owner on 2026-10-17: 08b design refresh and 08c password
reset.

## Later milestones (outline; each gets its own milestone spec before it starts)

Order changed by the owner on 2026-10-20: Milestone 3 (proposals on
the web, `milestone-3.md`, draft) comes before Milestone 2, and unit
17 moves into Milestone 2. On 2026-10-20 the owner also chose
Milestone 4 (agreements on the web, `milestone-4.md`, approved) before
Milestone 2; unit 20 moves into Milestone 2. On 2026-10-20 the owner
then chose Milestone 5 units 21–22 (messages and in-app notifications
on the web, `milestone-5.md`, approved) before Milestone 2; the mobile
thread and notification list move into Milestone 2. On 2026-10-20 the owner
then chose Milestone 6 (safety on the web: block, report, moderate,
`milestone-6.md`, approved) before Milestone 2. On 2026-10-22 the
owner approved Milestone 2 Part 1 (units 09–12, `milestone-2.md`);
Part 2 (units 17, 20, the mobile thread, notifications and safety)
was approved on 2026-10-23 (`milestone-2-part-2.md`, "Approve all").

| Milestone | Units | Introduces |
| --- | --- | --- |
| 2. Mobile offers | 09 Expo app shell and tokens · 10 mobile auth (including password reset) · 11 mobile create offer and My offers · 12 mobile marketplace and detail · 12b optional profile photos, web and mobile (owner, 2026-10-17; draft criteria below) | `apps/mobile` |
| 3. Propose and negotiate | 13 proposal tables and security · 14 proposal API · 15 web composer · 16 web negotiation view · 17 mobile propose and negotiate | Proposal rules from `state-model.md` §3–5 (needs owner approval) |
| 4. Agreements | 18 agreement tables and API (versions, amendments, handover, cancellation) · 19 web agreements · 20 mobile agreements | Agreement rules from `state-model.md` §4 and §6 (needs owner approval) |
| 5. Messaging and notifications | 21 messages and realtime · 22 in-app notifications (owner: in-app first, 2026-10-17) · 23 push and email, each specified and approved separately | Realtime, push |
| Later, only if approved | Keyword search, location (on hold; a consolidated spec is prepared for review), ratings, verification, moderation, saved offers (open), dashboards and analytics (deferred) | Each needs a defined evidence source before any UI claim |

Requirements to define before Milestone 2 planning is final (owner,
2026-10-17): reporting, blocking and moderation, addressed before any
iOS release. No report reasons, moderation actions or admin dashboard
are built until they are approved.

### Unit 12b: optional profile photos (draft acceptance criteria, PENDING APPROVAL)

- Optional everywhere: never required to sign up, publish or propose;
  the neutral initial stays the fallback.
- JPEG, PNG or WebP; re-encoded on the server to square WebP sizes;
  all metadata, including location, removed.
- Only the member can upload, replace or remove their own photo,
  enforced by row-level security and storage policies; the service
  key is not used.
- Shown wherever the display name is shown (cards, offer page,
  header); hidden from screen readers there because the name is
  already read.
- Removing a photo ends access under the same guarantee as offer
  photos (no new link at once, old links expire within 10 minutes).
- No text, badge or layout suggests that a photo verifies identity
  or trustworthiness.
- How reported photos are handled follows the moderation
  requirements, which are still open.
- Tests: storage security, API, end to end and axe on web and mobile.
