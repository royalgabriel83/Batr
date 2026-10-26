# Architecture Context

> **Status.** Platforms APPROVED by the owner: a web app and a native
> mobile app. The web stack below is APPROVED for Milestone 1
> (owner, 2026-10-15). Expo was confirmed by the Milestone 2 spec
> (owner, 2026-10-22) and Part 1 of the app is built. No existing BATR
> codebase was available (the earlier shared chat link could not be
> opened and no repository is attached); if one appears, it overrides
> this file and conflicts are listed in `progress-tracker.md` first.

## Principle: smallest structure that works

Start with one web app, one shared package and the database. Add a
mobile app when the first mobile unit starts (Milestone 2). Add any
other package or service only when a unit needs it, and record why in
the tracker's Architecture Decisions.

## Stack (APPROVED; Expo confirmed for M2)

| Layer | Technology | Role | Introduced |
| --- | --- | --- | --- |
| Repo | pnpm workspaces (no build orchestrator yet) | One repo for apps and the shared package | M1 |
| Language | TypeScript, strict | Shared types everywhere | M1 |
| Web + API | Next.js (App Router) | Web UI and the HTTP API used by web and, later, mobile | M1 |
| Styling (web) | Tailwind CSS reading token CSS variables | Token-driven styling | M1 |
| Shared logic | `packages/shared` (plain TS + Zod) | Schemas, state machines, permission rules, design tokens | M1 |
| Database | PostgreSQL hosted by Supabase | System of record | M1 |
| Auth | Supabase Auth (email + password first) | Identity and sessions | M1 |
| File storage | Supabase Storage (private bucket) + `sharp` for server-side photo processing | Offer photos, location data stripped, WebP | M1 |
| Tests | Vitest (unit + API integration), Playwright (web end to end) | Verification | M1 |
| Mobile | Expo SDK 58 (React Native) + Expo Router | Native iOS and Android app | M2 |
| Tests (mobile) | Jest (jest-expo) + React Native Testing Library; Maestro flows (written, not yet run) | Screen tests here; end to end on a simulator or CI | M2 |
| Realtime | Supabase Realtime | Live messages and status | M5 |
| Push / email | Expo Notifications / email provider TBD | Notifications, if approved | M5 |

Not introduced unless a unit proves the need: Turborepo, separate UI
packages, a separate API client package, a separate backend service,
a state-management library, an ORM.

## System Boundaries

```
apps/
  web/                  (M1) Next.js
    app/(public)/       Marketplace and offer detail pages
    app/(member)/       Signed-in pages
    app/api/v1/         HTTP API: the ONLY place state changes happen
    server/             Server-only: db access, auth guard, storage, audit
    components/ui/      Web UI components
  mobile/               (M2) Expo app; calls apps/web/app/api/v1 only
    app/                Screens (Expo Router: tabs, auth, offers)
    components/ui/      Native UI components
    lib/                API client (Bearer token), session store,
                        photo picking and conversion, paged lists
    maestro/            End-to-end flows (not yet run)
packages/
  shared/               Zod schemas, state machines, permission rules,
                        status-label functions, design tokens. No I/O.
supabase/
  migrations/           SQL schema and row-level-security policies
```

- `packages/shared` owns business rules. Apps never re-implement a
  transition or permission check.
- `apps/web/app/api/v1` owns every mutation for both apps.
- `apps/web/server` owns database and storage access.
- UI components present data only; no fetching inside them.

## Domain Model

States, transitions, permissions, revision history and the renewed
acceptance rule are defined in `specs/state-model.md`. That spec is
the single source; code in `packages/shared` implements it exactly.

| Entity | Introduced | Notes |
| --- | --- | --- |
| Profile | M1 | 1:1 with auth user |
| Offer, OfferPhoto | M1 | Offer states: draft, active, paused, closed |
| OfferLike, OfferSave | M1 (owner, 2026-10-17) | Private to the member; no counts, no notifications; never a proposal or reservation |
| AuditEvent | M1 | Every state transition |
| ValuationSubmission, Component, Evidence, Request, Comparison, Assessment, Appeal, Inspection, Note, Event | M1 (owner's valuation brief, 2026-10-17; policies approved 2026-10-18) | One open valuation per offer; at most two appeals; a repeat after a decided valuation needs new evidence or a material change; assessments and events append-only; see `specs/valuation-and-fees.md` |
| StaffRoleEvent | M1 (2026-10-18) | Append-only log of staff role grants, changes and removals |
| FeeQuote | M1 (2026-10-17) | 3% of the applicable total, 50/50, with basis and policy version; superseded quotes need reconfirmation |
| FeeLiability, FeePaymentAttempt, FeePayment, FeeRefund, FeeAdjustment, PaymentProviderEvent | M1 schema only | Nothing writes them outside tests until agreements and a payment provider exist |
| Proposal, ProposalRevision, ProposalEvent, Agreement record | M3 (built locally 2026-10-20) | Append-only revisions, each with snapshots of the offers it names; one open proposal per member and offer; expires 14 days after the latest terms; accepting writes the agreement record in the same transaction (P4); `proposal_events` is the proposal audit trail |
| Agreement, AgreementVersion, HandoverConfirmation, CancellationRequest, AgreementEvent | M4 (built locally 2026-10-20) | Versions are forward-only (binding, pending, rejected, withdrawn, superseded), at most one pending and one binding; a change needs the other member's acceptance and is refused once either handover is confirmed (D4); completed needs both handovers; cancelling needs both members; every write records one `agreement_events` row; `revision` counts every change for staleness checks |
| Message, ThreadRead, Notification | M5 (built locally 2026-10-20, web, in-app only) | One thread per proposal, continuing into its agreement; messages append-only; system lines and notifications written by triggers on the proposal and agreement event tables in the same transaction; messages grouped into one unread notification per thread; open pages poll (no realtime service yet, N1) |
| Block, Report, MemberSuspension, ModerationAction | M6 (built locally 2026-10-20, web) | Blocks work both ways and are enforced by triggers on proposals, revisions, agreements, messages and publishing, plus a restrictive policy on offers (blocked and suspended members' offers are hidden); a block declines open proposals between the pair quietly (`block_decline`) and leaves agreements unchanged; one open report per reporter and subject, 10 a day; one suspension in force per member; `moderation_actions` is append-only; offers gain `removed_at` |

## Storage Model

- **PostgreSQL:** all entities, states, revisions, agreement versions,
  audit events.
- **Object storage:** offer photos only, in the private
  `offer-photos` bucket, guarded by storage policies. The server writes
  processed photos with the owner's own session; members cannot
  overwrite or delete files directly. Readers get 10-minute signed
  URLs created with their own session, only for offers they may read.
  Deleted photos' files are removed by the server from a cleanup
  queue; the exact access guarantee is in `specs/state-model.md` §2.
  The storage cleanup job (`/api/internal/storage-cleanup`, protected
  by `CRON_SECRET`, or `pnpm cleanup:storage` against a running app)
  retries the queue, deletes files with no photo row older than 24
  hours, removes expired idempotency keys and records proposals past
  their expiry. Scheduling it on a host is part of the deployment
  decision.
- **Proposal snapshot photos (M3):** a revision keeps the cover photo
  paths of the offers it names (`proposal_snapshot_photos`). Those
  files are never queued for deletion, are not orphans, and stay
  readable (signable) by the two members after the owner removes the
  photo from the live offer. The server deletes only paths still in
  the cleanup queue.
- **Agreement snapshot photos (M4):** each agreement version keeps the
  cover photo paths of the offers it names
  (`agreement_snapshot_photos`), retained exactly like proposal
  snapshot photos, so agreed terms stay viewable after the live offer
  changes or closes.
- **Location (phase 1, owner 2026-10-17):** an offer holds only a
  general area id from a fixed list, an exchange mode and handover
  methods. No address or coordinates are stored anywhere; precise
  meeting details belong to agreements (later milestone).
- **Client cache:** read-only; never the source of truth for state.
- **Valuation evidence:** private `valuation-evidence` bucket
  (`{member}/{valuation}/{evidence}.webp`), images re-encoded to WebP
  without metadata. PDF uploads are disabled (policy, bucket type
  list, database trigger and API) until malware scanning is integrated
  and tested. Readable by the uploader, and by BATR staff once the
  valuation is sent, through two-minute signed links made with the
  reader's own session.
- **Money:** amounts are integer kobo. Fee quotes and an unused fee
  ledger are stored; no payment is taken and cash exchanged between
  members is never recorded as BATR money.

## Auth and Access Model

- Members sign in through Supabase Auth. Web uses a secure cookie
  session; mobile (M2) stores tokens in secure storage.
- Mobile (M2): the Supabase client is used only for sign-up, sign-in,
  sign-out, password reset and token refresh. The session is saved in
  `expo-secure-store` split into chunks (the store limits each value's
  size) and cleared on sign-out. Every read and write goes to
  `/api/v1` with `Authorization: Bearer`; confirmation and reset links
  open the web pages (M5).
- Mobile (M2 Part 2): `GET /api/v1/me/status` gives the app what the
  web works out on the server: the Exchanges count, waiting counts per
  tab, unread messages (in total and per proposal id), unread
  notifications and whether the member is suspended. No member ids.
  The app reads it on sign-in, when a tab opens and when the app
  returns to the front. Open conversations check for new messages
  every 5 seconds while on screen (N1, Q3).
- Response shapes for proposals, agreements, messages, notifications
  and safety lists are explicit interfaces in `packages/shared`
  (`*/views.ts`); `apps/web/server/api/shared-views.ts` fails the
  typecheck if the server's inferred types drift from them.
- Web (unit 05): sign-up, sign-in, sign-out and resend are server
  actions that call Supabase Auth with the anon key; the session lives
  in http-only cookies managed by `@supabase/ssr`. The confirmation
  email links to `/auth/confirm`, which verifies the one-time token on
  the server. `proxy.ts` refreshes the session on every page request
  and redirects signed-out visitors from protected pages to
  `/sign-in?next=…`; protected pages check the member again on the
  server. Return paths pass through `safeReturnPath` (same-site only).
- Offer API (unit 06): `apps/web/app/api/v1` route handlers are thin;
  the logic is in `apps/web/server/api`. Callers are identified by the
  session cookie (web) or `Authorization: Bearer` (mobile, tests); a
  cookie-authenticated mutation from another origin is refused. Every
  call uses the caller's own Supabase session. Responses are
  `{ data }` or `{ error }` with `Cache-Control: private, no-store`;
  storage paths and owner ids are never returned as fields (signed
  links contain the path).
- Photos (unit 06): `server/photos/process.ts` (sharp) re-encodes each
  upload to WebP display (1600 px) and thumbnail (800 px) with no
  metadata; the API uploads both with the member's session, then calls
  `offer_photo_add`. Files from a removed photo, a deleted draft, or a
  failed or replayed upload are deleted by `server/storage/deleter.ts`
  right after the commit; a failed deletion stays queued with its
  error.
- Roles: `visitor` (signed out) and `member`. Staff roles
  `valuation_reviewer` and `valuation_inspector` live in
  `private.staff_roles`, granted only with SQL by the service role (no
  admin screen); every grant, change and removal is logged in
  `private.staff_role_events`. Staff never act on their own
  valuations, and a reviewer whose decision was appealed only reads
  that valuation (enforced by triggers). The assessed value of an
  offer is shown to signed-in members only; visitors get at most an
  "assessed" indicator. A repeat valuation (`repeat_of`) inherits the
  earlier valuation's excluded reviewers. The `moderator` role
  (Milestone 6, S4) is granted the same way; moderators never handle a
  report they made or one about them, read only what a report points
  to (S6), and everyone else gets 404 from `/moderation` and its API.
- Access rules per entity and state live in `specs/state-model.md`
  and `specs/05-auth-and-permissions.md`; they are implemented once in
  `packages/shared` and enforced in every API handler, with
  row-level security repeating them in the database.

## Invariants

1. Every state change goes through `apps/web/app/api/v1`. Clients
   never write state, revision or agreement rows directly.
2. Every mutation checks authentication and permission before doing
   anything else.
3. A transition happens only if the state machine in
   `packages/shared` allows it for that actor; otherwise the API
   returns `CONFLICT` or `FORBIDDEN`.
4. Proposal revisions and agreement versions are append-only.
5. Acceptance always names the exact revision or version being
   accepted; a stale id is rejected.
6. Any material change to accepted terms requires renewed acceptance
   by both parties; until then the previous accepted version stays
   binding (see `specs/state-model.md`).
7. Every transition runs as one database transaction inside a
   Postgres function: row lock, state re-check, change, audit event
   and idempotency record commit together or not at all.
8. Every transition writes exactly one AuditEvent.
8a. Retried mutations with the same idempotency key never execute
   twice.
8b. Changes to a live offer never modify proposal revisions or
   agreement versions; those keep their own snapshots.
8c. Closing a listing never cancels or changes an agreement.
8d. Non-active offers are invisible (404) to everyone but the owner.
8e. Every write to an offer or its photos carries `expected_revision`;
    a stale write is rejected (409), never merged or overwritten.
8f. Members write only through the `public.offer_*` and
    `public.profile_set_display_name` database functions (security definer, empty `search_path`). The rule tables,
    idempotency keys and storage cleanup queue live in the `private`
    schema, which the API gateway does not expose. Functions report
    errors with SQLSTATE `PTxxx` (returned as HTTP status xxx), the API
    error code as the message and a JSON detail.
9. The UI shows only states and actions defined in the state model,
   and no trust claim without an implemented evidence source.
10. No money moves through BATR yet. Platform fees are calculated
    and quoted (`specs/valuation-and-fees.md`); collection needs a
    configured provider and the owner's open fee decisions. Fees and
    exchange cash are never mixed.
11. Design values come only from tokens; logo artwork is used as
    supplied.
12. No secrets in source control: only variable names in
    `.env.example`; the service key is used server-side only (deleting
    queued photo or evidence files after a commit and in the cleanup
    job, and in tests), never in a browser bundle (an end-to-end test checks the
    built browser files).
