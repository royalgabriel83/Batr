# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Milestone 2 Part 1 (units 09–12): the mobile app for offers (owner,
  2026-10-22: "Mobile app", then "Approve all"; `specs/milestone-2.md`
  approved with every default, M1–M10). Built on local branch
  `m2/mobile-offers` and committed locally; not pushed. Maestro, a
  real phone, WebKit and CI not run. Not release-ready. Owner,
  2026-10-22 22:01: the app keeps matching the web design (M7
  confirmed: "Keep matching"). Owner, 2026-10-23: "Move on to the
  next phase", testing the app on a phone once it is ready. Part 2
  approved on 2026-10-23 ("Approve all", Q1–Q10 kept;
  `specs/milestone-2-part-2.md`); built on local branch
  `m2/mobile-exchanges` and committed locally; not pushed. Maestro, a
  real phone, WebKit and CI not run. Not release-ready. Owner review of the Milestone 6 screens
  (2026-10-22): "this looks nice".
- Milestone 6 (units 24–26): Safety on the web, block, report and
  moderate (owner, 2026-10-20; `specs/milestone-6.md` approved with
  every default, S1–S10). Built on local branch `m6/safety` and
  committed locally; not pushed. The owner supplies the S8 contact
  address and the S9 list wording. Not release-ready.
- Owner review of the Milestone 5 screens (2026-10-20): "this looks
  nice".

- Milestone 5 (units 21–22): Messages and in-app notifications on the
  web (owner, 2026-10-20: messaging before the mobile app;
  `specs/milestone-5.md` approved with every default, N1–N8). Building
  on local branch `m5/messages` and committed locally; not pushed. The
  owner added a Messages page to N2 (2026-10-20). Not release-ready.

- Milestone 4: Agreements on the web (owner, 2026-10-20: "proceed";
  `specs/milestone-4.md` approved with every default, A1–A6). Built
  on local branch `m4/agreements` and committed locally; not pushed.
  Not release-ready.

- Milestone 3: Propose and negotiate on the web (owner, 2026-10-20:
  proposals before the mobile app; spec approved with every default).
  Units 13–16 built on local branch `m3/proposals` and committed
  locally; not pushed. Not release-ready.

- Milestone 1: Offers on the Web. Units 01–08 (Scaffold, Tokens and
  primitives, Shared offer rules, Database, Auth, Offer API, Create
  and manage offers, Marketplace) built, verified locally in Chromium
  and committed locally with the owner's approval; nothing pushed.
  Visual approval stays open. GitHub repository not yet connected.
  Milestone 1 is not release-ready (see Outstanding Before Launch).

## Current Goal

- Unit 07 and the unit 02 Button tap-height fix are committed locally.
  Unit 08 (Marketplace) authorized by the owner on 2026-10-17, built on
  branch `unit/08-marketplace`, verified locally and committed locally
  with the owner's approval (2026-10-17), followed by a second local
  commit for the owner's post-review decisions; not pushed, merged or
  deployed. Milestone 1 is not release-ready: CI, WebKit, the
  real-iPhone test, visual approval and the other items under
  Outstanding Before Launch remain open. Nothing is pushed without the owner's authorization.
- Owner decisions on the product audit (2026-10-17), recorded below
  under Architecture Decisions. Approved Milestone 1 work continues on
  local branch `m1/design-and-reset` (from 5134383): a docs-only
  commit correcting the 16 documented inconsistencies, these decision
  records, unit 08b (design refresh) and unit 08c (password reset),
  all four committed locally in that order and not pushed.
  Before-and-after screenshots go to the owner for visual review.
- Owner review of 08b/08c (2026-10-17, 10:45 and 11:00): the visual
  direction (deep green framing, white surfaces, restrained green
  actions) is **approved**; final visual approval stays open until the
  refinements and the real-iPhone check are done. The current-password
  message is kept. Design refinements are on local branch
  `m1/design-refinements` (from 28221b2), committed locally, not
  pushed. Visual approval and release readiness are separate decisions.
- Structured valuation, assessment, appeals and the 3% platform fee
  (owner's brief, 2026-10-17 15:45): built on `m1/design-refinements`
  and committed locally, not pushed. Fees are calculated and quoted,
  never collected: no payment provider is configured. Spec:
  `specs/valuation-and-fees.md`; its §11 lists what is
  still needed.
- Valuation and fee policies approved by the owner (2026-10-18), with
  two changes: two appeals per valuation, and the assessed value for
  signed-in members only. Implemented locally on
  `m1/design-refinements` and committed locally with the owner's
  approval (2026-10-18); not pushed. Spec updated (§1–11).
- Owner's final valuation decisions (2026-10-18, 00:36): visitor
  indicator kept, members-only value confirmed, repeat valuations
  (§6.1) and PDF uploads disabled until malware scanning is
  integrated and tested. Implemented locally on
  `m1/design-refinements` and committed locally with the owner's
  approval (2026-10-18, `6d84d15`); not pushed. BATR is not production-ready.

## Completed

- 2026-10-15: Reviewed the BATR logo and the Tailwind Plus e-commerce
  reference screenshots.
- 2026-10-15: Drafted the six context files, `CLAUDE.md`, the build
  plan and six feature specs. See `REVIEW.md` for the report.
- 2026-10-15: Added the owner's brand set (full icon, compact icon,
  horizontal logo, usage sheet) to `assets/brand/` and wrote
  placement rules into `ui-context.md`. `--text-primary` now matches
  the wordmark ink `#012921`.
- 2026-10-15: Made interim production logo files in
  `assets/brand/interim/` (app icon, Android adaptive layers, splash,
  favicons, PWA icons, transparent ink and white-text horizontal
  logos). To be replaced by designer exports before launch.

- 2026-10-15: Applied the owner's seven refinements: separated sampled
  logo colors from UI tokens and marked exact values PENDING APPROVAL;
  put the white-text logo on hold (it alters the artwork); simplified
  the architecture to `apps/web` + `packages/shared` (+ `apps/mobile`
  from Milestone 2); wrote `specs/state-model.md` (transitions,
  permissions, revision history, renewed acceptance); added the
  trust-claim rule and a state-to-badge mapping in `ui-context.md`;
  wrote `specs/milestone-1.md`; aligned specs 01–06, code standards,
  workflow rules and `CLAUDE.md`.

- 2026-10-15: Revised `specs/state-model.md` for the owner's six
  points: offer edits vs proposals and agreements (snapshots never
  modified), closing a listing never affects an agreement, handover
  confirmation storage and concurrency, amendment authorization,
  atomic transitions with audit and idempotency, editing rules and
  privacy for non-active offers. Added decisions D1–D7. Revised
  `specs/milestone-1.md` (20 acceptance criteria).

- 2026-10-15: Applied the owner's six Milestone 1 clarifications:
  private photo storage with storage policies, signed URLs created
  with the viewer's session, and a cleanup queue and job for deleted
  drafts; database-security tests against real local Supabase with
  separate signed-in members (no mocks); full idempotency rules
  (storage, scoping per member and endpoint, mismatched body, atomic
  protection against duplicate transitions and audit events); HEIC
  decision D8 with its trade-offs; three field groups (material,
  preference, discovery metadata) defined once in the shared package;
  all 18 original acceptance criteria kept, criteria 19–28 added.
  Spec marked FINAL DRAFT.
- 2026-10-15: Verified the execution environment: Node 22, pnpm 10,
  Docker, and a full local Supabase start using Docker Hub images
  (the default AWS image registry refuses downloads here).

- 2026-10-15: Second round of owner clarifications: documented that
  issued photo links last until expiry and recommended 10 minutes
  (D5); HEIC conversion on iPhone treated as an assumption with a
  real-iPhone test in unit 07 and a clear error (D9 added for how the
  phone reaches the app); added a Concurrency section (single write
  path, offer row locked first, `expected_status` on every mutation,
  commit-time triggers); restored criteria 1–18 to their original
  wording with additions marked "Also:"; added criteria 29–30.

- 2026-10-15: Third round of owner corrections, in both
  `milestone-1.md` and `state-model.md`: `revision` and
  `expected_revision` on every write (stale edits rejected with 409,
  never merged); exact photo access guarantee after pause, resume, close
  photo removal and draft deletion, including failed storage
  deletion; caching policy reworded to what it actually guarantees;
  storage write path (owner's session, insert only; deletes only by
  the server from the queue); atomic reordering with a deferrable
  unique position constraint; draft-delete audit event survives;
  idempotency rules made identical in both files. Criteria 31–35
  added. D5 (10 minutes with refresh), D6, D7 and D9 decided.

- 2026-10-15: **Unit 01 Scaffold** built on branch `unit/01-scaffold`
  (local repository; not pushed, see Open Questions 22).
  - Structure: pnpm workspace with `apps/web` (Next.js 16 App Router,
    React 19), `packages/shared` (`@batr/shared`, TypeScript source),
    `supabase/` (CLI config, `tests/`), `scripts/` (local Supabase
    connection helpers), project context copied in (`CLAUDE.md`,
    `context/`, `specs/`, `assets/`).
  - Tooling: TypeScript 6.0 strict with `noUncheckedIndexedAccess`;
    ESLint 9 flat config (typescript-eslint strict, Next.js rules for
    `apps/web`); Vitest 5; Playwright 1.64; Supabase CLI 2.121 as a
    dev dependency.
  - Local Supabase: `config.toml` with Studio, Realtime, Edge Runtime
    and Analytics disabled (not used in Milestone 1). Scripts
    `db:start`, `db:stop`, `db:reset`, `db:status`, `test:db`,
    `env:local`. `test:db` passes connection details in the
    environment only; `env:local` writes the git-ignored
    `apps/web/.env.local`.
  - CI (`.github/workflows/ci.yml`): gitleaks secret scan over full
    history; lint, type check, unit tests, build; database job (start,
    reset, `test:db`); browser job (Chromium and WebKit).
  - `.gitignore` covers env files (except `.env.example`), build
    output, test output and local Supabase state.
    `apps/web/.env.example` lists variable names only.
  - Home page: horizontal ink logo (interim file, as supplied) as the
    page heading, "A peer-to-peer exchange marketplace. Coming soon."
    Unstyled on purpose: tokens, Inter and the ink header are unit 02.
    Favicons from `assets/brand/interim`.
  - Verified in the development environment (commands actually run):
    clean `pnpm install --frozen-lockfile` (no `node_modules`, pnpm
    store cache in use) ✓; `pnpm lint` ✓; `pnpm typecheck` ✓;
    `pnpm test` ✓ (1 shared test; web has no unit tests yet);
    `pnpm build` ✓; Playwright home-page smoke test on Chromium ✓;
    `pnpm db:start` ✓ (images already cached locally from Docker Hub,
    so the default registry was not exercised); `pnpm db:reset` ✓;
    `pnpm test:db` ✓ (3 connectivity checks: Auth health, Storage
    API); `pnpm test:db` with Supabase stopped fails with a clear
    message ✓; actionlint 1.7.12 on the workflow ✓ (shellcheck not
    installed, so `run:` scripts were not shell-linted); gitleaks
    8.30.1 over the git history ✓, and it fails on a planted test key
    in a throwaway copy ✓.
  - Not verified yet: anything in GitHub Actions (no repository
    connected); WebKit browser tests (no local WebKit); database
    schema, policies, API and storage (later units).

- 2026-10-15: **Unit 02 Tokens and primitives** built on branch
  `unit/02-tokens-primitives` (stacked on `unit/01-scaffold`; local,
  not pushed). Owner authorized unit 02 the same day.
  - Tokens in `packages/shared/src/tokens` (colors, type scale,
    spacing, radius, shadows, breakpoints, minimum touch target),
    values exactly as `ui-context.md` (still PENDING APPROVAL). Added
    `--text-on-accent` (#FFFFFF) for text on green and red fills.
  - Generated `apps/web/app/tokens.css` (`pnpm tokens:write`) is a
    Tailwind theme with the default palette, type scale, radii,
    shadows and breakpoints removed. A test fails if it is stale.
  - Components in `apps/web/components/ui`: Button (4 variants, 3
    sizes, light and brand-frame surfaces, disabled, loading), Badge
    (icon required), TextField, Textarea (character counter), Select,
    SegmentedControl (native radios), PhotoTile (empty, uploading,
    ready, error, cover, remove), SiteHeader (ink, compact icon).
  - `/dev/ui` gallery renders in development and returns 404 in
    production builds.
  - Inter via `next/font/google`; lint rejects raw hex colors and
    arbitrary font sizes in app code and raw colors in app CSS.
  - Verified (commands actually run, after a clean install): lint ✓,
    type check ✓, unit tests ✓ (30 shared, including contrast for 23
    token pairs; 1 web token-file test), build ✓, Playwright on
    Chromium ✓ 15 tests: home renders with the ink header, axe finds
    no serious or critical issues on home and gallery at 375px and
    1280px, no horizontal scroll at 375px, `/dev/ui` is 404 in
    production, button click and keyboard, disabled and loading
    states, visible focus outline, 44px hit area for small and medium
    buttons (the test fails when the extension is removed), field
    label/helper/error wiring, character counter, segmented control
    arrow keys, photo tile progress, error and remove labels. The hex
    and font-size lint rules and the CSS check were each shown to
    reject a planted violation.
  - Not verified: WebKit (not installed here; runs in CI), anything on
    GitHub Actions, database tests (no database change in this unit,
    not re-run).
  - Follow-up (owner found the unit 01 home page unstyled): cause was
    sequencing, not a loading fault. Unit 01 had no stylesheet by
    design (tokens were unit 02); on the unit 02 build the stylesheet,
    tokens and Inter load with no console errors or failed requests.
    Replaced the placeholder home page with a coming-soon page built
    only from existing tokens and the compact icon (copy from
    `project-overview.md`; no links to unbuilt features). Added an
    e2e check that the stylesheet, `--color-accent-primary` and Inter
    load and images resolve. Re-run: lint ✓, type check ✓, unit tests
    ✓, build ✓, Playwright Chromium ✓ 16 tests.
  - Landing page refinement (owner design review): headline now
    "Exchange what you have for what you need." with the
    peer-to-peer positioning kept in the supporting copy; hero icon
    hidden below 768px (the header already shows it) and centred in
    the right half on desktop; a status line says there is no sign-up
    yet (no waitlist or contact feature exists in the specs, and
    newsletters are out of scope); the three steps are one bordered
    panel with visible step numbers, icon-left rows on mobile. Only
    existing tokens and components. New e2e check that the headline
    starts within 200px at 375px (shown to fail on the previous
    layout). Re-run: lint ✓, type check ✓, unit tests ✓, build ✓,
    Playwright Chromium ✓ 17 tests.

- 2026-10-16: **Unit 03 Shared offer rules** built on branch
  `unit/03-shared-offer-rules` (stacked on unit 02; local, not
  pushed). Owner authorized unit 03 on 2026-10-16 and deferred the
  landing page design review.
  - `packages/shared/src/offers`: statuses, D7 categories and
    conditions (stored as stable ids such as `sports_outdoors`, with
    the spec's names as labels), field limits; branded `OfferId`,
    `MemberId`, `PhotoId`; Zod schemas for draft and publish field
    rules and for create, edit, action and reorder request bodies
    (unknown keys rejected; edits and actions require
    `expected_revision` and `expected_status`); `checkOfferFields`
    returns one message per failing field, including photo count.
  - Field classification table (material, preference, discovery)
    covering every editable field plus photo add/remove, order and alt
    text; `contentVersionAfter` gives one increase per edit request.
  - Transition table exactly as `state-model.md` §2 (photo add,
    remove, reorder and alt text count as `edit`), `canTransition`
    and `transitionOffer` returning results, with checks in this
    order: signed in (401), owner (403 for another member's active
    offer, else 404), expected status (409 `status_changed`), expected
    revision (409 `stale_revision`), transition table (409).
    `requiresPublishRules` marks publish, resume and edits of active
    or paused offers. The database repeats all of it in unit 04.
  - Permissions `canCreateOffer`, `canReadOffer`, `canWriteOffer`;
    non-active offers are 404 to everyone but the owner.
  - `offerStatusLabel` (Draft, Active, Paused, Closed with tones from
    `ui-context.md`); the web `Badge` now takes its tone type from it.
  - Photo file check shared by browser and API: JPEG, PNG and WebP by
    signature, 10 MB limit, HEIC detected by signature, type or name
    with the spec's message (`UNSUPPORTED_FORMAT`); too large is
    `VALIDATION_FAILED`.
  - Implementation choices to confirm: all text fields are trimmed
    (whitespace alone counts as empty); category and condition ids.
  - Verified (commands actually run): lint ✓, type check ✓, unit
    tests ✓ (123 in `packages/shared`, 1 web), 100% statement,
    branch, function and line coverage on transitions and permissions
    enforced by `pnpm test`, build ✓, Playwright Chromium ✓ 17 tests,
    `pnpm install --frozen-lockfile` ✓. Mutation checks: adding a
    closed → active transition, changing the 403/404 rule, and
    reclassifying `wants_text` each made tests fail; removing a test
    block made the coverage threshold fail.
  - Not verified: WebKit and GitHub Actions (as before); database
    tests not re-run (no database change). Transition parity with the
    database is a unit 04 test.

- 2026-10-16: **Unit 04 Database** built on branch
  `unit/04-database` (stacked on unit 03; local, not pushed). Owner
  authorized unit 04 on 2026-10-16 and kept both unit 03 choices
  (trimmed text; category and condition ids).
  - Migrations in `supabase/migrations`: `profiles` (created for each
    new account by a trigger; display name from sign-up metadata when
    valid), `offers`, `offer_photos` (deferrable unique position,
    path pattern check), `audit_events` (no foreign key), and in the
    unexposed `private` schema the transition table, field groups,
    categories, conditions, `idempotency_keys` and
    `storage_cleanup_queue`.
  - Commit-time constraint triggers reject status changes outside the
    transition table, active or paused offers failing a publish rule,
    and photo positions that are not 1..n, also for direct writes by
    the database owner.
  - Write functions `offer_create`, `offer_edit`, `offer_photo_add`,
    `offer_photo_remove`, `offer_photo_reorder`,
    `offer_photo_set_alt_text`, `offer_publish`, `offer_pause`,
    `offer_resume`, `offer_close`, `offer_delete_draft`, and
    `offer_photo_files_abandon` (queues files of a failed upload; own
    folder, unused paths only). Each records the idempotency key
    first, locks the offer, checks owner, expected status, expected
    revision and the transition table, writes one audit event and
    stores the response. Errors use SQLSTATE `PTxxx` (architecture
    8f).
  - RLS: members read active offers or their own; photo rows follow
    their offer; profiles are visible to their owner or when they own
    an active offer; audit events to their actor. No direct writes for
    members on any table.
  - Storage: private `offer-photos` bucket (WebP, 2 MB). Insert only
    into the member's own folder for their draft, active or paused
    offer with the path pattern; no update or delete policy; read and
    signing only with a photo row the viewer can see.
  - Shared: `PHOTO_LINK_TTL_SECONDS` = 600 (D5) added for unit 06.
  - Implementation choices to confirm: a photo row can only be added
    once both files exist in storage; the request hash for JSON
    endpoints is computed in the database from the request body
    (jsonb text form, fixed key order); uploads pass a hash computed
    by the API. The spec's API table has no alt-text endpoint; the
    database function exists and unit 06 needs a route for it
    (proposed `PATCH /api/v1/offers/:id/photos/:photoId`).
  - Verified (commands actually run): lint ✓, type check ✓ (including
    the database tests), unit tests ✓ (123 shared, 1 web, 100%
    coverage gate), build ✓, Playwright Chromium ✓ 17 tests,
    `pnpm install --frozen-lockfile` ✓, `pnpm db:reset` ✓,
    `pnpm test:db` ✓ 73 tests in 7 files (security, storage, write
    functions, idempotency, races with a held lock, fault injection,
    parity with `packages/shared`), run twice after a fresh reset.
    Mutation checks on the live database, applied one after another
    and then reset: removing the row lock (11 tests failed), making
    all offers readable (4), letting closed offers accept uploads (5
    in total), reclassifying `wants_text` (7 in total), ignoring
    idempotency keys (16 in total); after the reset all 73 passed.
  - Not verified here: GitHub Actions and WebKit (as before); the
    storage-failure deletion test and the cleanup job (units 06 and
    08, which delete files); the HEIC and image-processing tests (unit
    06).

- 2026-10-16: **Unit 05 Auth** built on branch `unit/05-auth`
  (stacked on unit 04; local, not pushed). Owner authorized unit 05
  on 2026-10-16 and kept both unit 04 choices (a photo row needs both
  files in storage; alt-text route `PATCH
  /api/v1/offers/:id/photos/:photoId` in unit 06).
  - Local Supabase Auth (`supabase/config.toml`): email confirmation
    on, minimum password length 10, redirect allow-list
    `http://127.0.0.1:*/**` and `http://localhost:*/**`, and a BATR
    confirmation email (`supabase/templates/confirmation.html`) whose
    link goes to the web app's `/auth/confirm` route. Emails go to the
    local inbox (Mailpit, http://127.0.0.1:54324).
  - Shared (`packages/shared/src/auth`): email, new password (10
    characters to 72 bytes), display name (2–40 characters counted as
    the database counts them, trimmed, no links), sign-up and sign-in
    inputs, account messages (none reveals whether an email is
    registered), and `safeReturnPath` (same-site paths only, never
    back into sign-in; 100% coverage gate).
  - Database (`20261016000400_profile_display_name.sql`):
    `private.valid_display_name` (same link pattern as the shared
    rule, compared by a parity test), the profile check and sign-up
    trigger now use it, and `public.profile_set_display_name` (security
    definer; own profile only; 422 `VALIDATION_FAILED`).
  - Web: `/sign-up`, `/sign-up/check-email` (resend link),
    `/sign-in` (generic wrong-credentials message, unconfirmed-email
    resend, rate-limit and network messages), `/auth/confirm`
    (verifies the token, signs in, returns to `next`), `/account`
    (email, Member since, display-name form, sign out). `proxy.ts`
    refreshes the session cookie and sends signed-out visitors from
    protected pages to `/sign-in?next=…`; each protected page checks
    again on the server. The header shows Sign in, or the member's
    display name linking to Account. The coming-soon status line now
    links to sign-up instead of saying there is no sign-up.
  - CI: the browser-test job now starts local Supabase and runs
    `pnpm env:local` before building.
  - Dependencies: `@supabase/ssr` 0.12.7 and `@supabase/supabase-js`
    2.118.0 in `apps/web` (see Dependency notes).
  - Choices to confirm: (1) password minimum 10, marked PROPOSED in
    the auth spec; (2) after confirming, members land on `/account`
    because Explore does not exist yet; (3) display-name changes go
    through a server action that calls the database function; the API
    table has no profile route, so mobile (M2) will need one (proposed
    `PATCH /api/v1/me/profile`); (4) sign out ends this browser's
    session only, not other devices.
  - Verified (commands actually run): `pnpm install
    --frozen-lockfile` ✓, lint ✓, type check ✓, unit tests ✓ (166
    shared, 16 web, coverage gate), build ✓, `pnpm db:reset` ✓,
    `pnpm test:db` ✓ 89 tests in 8 files (run twice), Playwright
    Chromium ✓ 29 tests (run twice): full sign-up through the local
    inbox, confirm, display-name change, sign out, protected redirect
    and return (including query string), `?next` to another site
    ignored, identical message for wrong password and unknown email,
    registered email re-sign-up looks like a new one, unconfirmed
    sign-in with resend, field errors keep input, broken link
    message, network failure keeps input, axe on sign-up, sign-in
    (with errors shown) and account. Mutation checks: letting
    `safeReturnPath` accept any string failed 4 unit tests; dropping
    the link rule from the database function failed 4 database tests;
    reset afterwards.
  - Not verified here: WebKit and GitHub Actions (as before); the
    rate-limited message end to end (covered by a unit test of the
    error mapping only); the breached-password check (not available
    in local Supabase).

- 2026-10-16: **Unit 05 approved** by the owner, with all four
  choices: password minimum 10 characters; after confirming, members
  land on Account (revisit when Explore and first-time onboarding
  exist); display-name changes use the Account page's server action on
  web, with `PATCH /api/v1/me/profile` planned for the mobile API; sign
  out ends only the current browser's session (sign out of all devices
  may come later).

- 2026-10-16: **Unit 06 Offer API** built on branch
  `unit/06-offer-api` (from unit 05). Owner approved both decisions
  (see Architecture Decisions) and asked for a local commit and
  bundle; committed locally, saved as `unit-06/batr-unit-06.bundle`
  in the project folder. Nothing pushed.
  - Endpoints (`apps/web/app/api/v1`, logic in `apps/web/server/api`):
    every route in the milestone API table, plus `PATCH
    /api/v1/offers/:id/photos/:photoId` for alt text (approved
    2026-10-16). Mutations: signed in (401), `Idempotency-Key` (400),
    body checked with the shared schemas (422 with a message per
    field), then one database function (403/404, 409 with
    `status_changed` or `stale_revision` plus the current offer, 422
    publish rules with the shared messages). Callers: session cookie
    (web, other origins refused) or Bearer token (mobile, tests).
  - Reads: detail and photo links (RLS decides; 404 otherwise),
    marketplace (active, newest first, 20 per page, category filter,
    cursor), My offers (`?status=`). Public responses carry only public
    fields, signed links, owner display name and Member since month.
    All API responses: `Cache-Control: private, no-store`.
  - Photos: signature, size and format checks (HEIC 422
    `UNSUPPORTED_FORMAT`), the key looked up before processing, sharp
    re-encoding (metadata including GPS removed, rotation applied, WebP
    1600 px and 400 px, never enlarged), both files uploaded with the
    member's own session (`cache-control: max-age=600`), then the
    database step. Files from a removed photo, a deleted draft, a
    refused database step or a replayed upload are deleted right after
    the commit with the server-only key; a failure stays queued with its
    error and attempt count.
  - Database (`20261016000500_offer_api_support.sql`):
    `offer_idempotent_response` (read-only key lookup for uploads) and
    `storage_cleanup_complete` / `storage_cleanup_failed` (service role
    only).
  - Shared: `PUBLISH_RULE_MESSAGES` (one message per publish rule; a
    parity test checks the database reports the same rule names),
    `API_ERROR_MESSAGES`, `PhotoAltTextInputSchema`,
    `PhotoUploadFieldsSchema`, `checkInput`; unknown body fields are now
    reported by name.
  - CI: the database job also runs `pnpm test:api`.
  - Dependency: `sharp` 0.35.5 (named and justified in Milestone 1).
  - Verified (commands actually run, before committing):
    `pnpm install --frozen-lockfile` ✓, lint ✓, type check ✓, unit
    tests ✓ (169 shared, 16 web, coverage gate), build ✓, `pnpm
    db:reset` ✓, `pnpm test:db` ✓ 90 tests (run twice), `pnpm test:api`
    ✓ 43 tests (run twice), Playwright Chromium ✓ 32 tests (run twice),
    gitleaks on every file to be committed ✓ (no leaks). The API tests
    call the real route handlers in-process with real members' Bearer
    sessions against local Supabase: every endpoint's success, 401,
    403/404, 422, 409 and key cases; GPS and camera data absent from
    stored files; sizes; PDF, HEIC, broken and 12 MB files refused with
    nothing stored; replayed and concurrent uploads; files deleted
    after removal and draft deletion (earlier links stop working);
    storage unreachable during deletion (rows gone, audit kept, paths
    queued with the error, no new links, an earlier 3-second link stops
    at expiry while the file still exists, then deleted once storage is
    back). Sign-in methods (added after the owner's approval of Bearer
    tokens): an expired token, a malformed token, a tampered signature,
    a non-Bearer scheme, a token revoked by signing out everywhere and
    the public anon key used as a token all get 401 on reads and writes;
    another member's Bearer token gets 404 on a draft. The test runner
    reads the local development JWT secret from `supabase status`
    (`scripts/with-local-supabase-env.mjs`) only to sign the expired and
    control tokens; it is never in source control. Three Playwright
    tests: the API over HTTP with the session cookie (another origin
    refused), another member's cookie session gets 404 reading,
    editing and deleting a draft (the draft is unchanged), and no
    service key in any built browser file. Mutation checks, each restored afterwards: skipping
    the deletion after photo removal (2 tests failed), keeping EXIF (1),
    removing the production guard on the test storage setting (1).
  - Not verified: WebKit and GitHub Actions (as before); the cleanup
    job (unit 08); offer API rate limiting (not built).

- 2026-10-16: **Unit 07 Create and manage offers** built on branch
  `unit/07-create-manage-offers` (from unit 06, authorized by the owner
  2026-10-16), **not committed**: the owner asked to review the report
  first. Nothing pushed.
  - Pages: `/offers/new` and `/offers/:id/edit` (one form: photos,
    details, exchange terms; Save draft, Publish, Preview), `/offers/:id/published`
    (success), `/my-offers` (grouped Active, Drafts, Paused, Closed;
    Edit, Pause, Resume, Close with confirmation, Delete draft with
    confirmation), a not-available page for offers that don't exist or
    aren't readable, and "You can't change this offer" for someone
    else's active offer. Closed offers open read-only. All are signed-in
    pages (added to the proxy's protected paths). Header: My offers and
    Create offer for signed-in members.
  - Every change goes through the offer API with the session cookie,
    one request at a time so each carries the revision the previous one
    returned. A draft is created on the first save or the first photo.
    Publish and status actions keep their idempotency key after a
    network failure, so a retry cannot apply twice.
  - Photos: browser check before upload with the shared rules (HEIC by
    type, name or signature with the D8 message; over 10 MB; anything
    else not JPEG, PNG or WebP); per-tile progress, Retry (same key and
    body after an interrupted upload), remove; reorder by dragging or
    with Move earlier/later buttons; optional description per photo.
  - Errors: field errors inline with focus on the first; a stale save
    keeps what was typed and lists the latest saved values; a status
    change refreshes the status; if the session ends, typed values are
    kept in the tab's session storage and restored after signing in;
    leaving with unsaved changes asks first.
  - Preview and the future offer page share `components/offers/OfferDetail`
    (gallery, Offering, Wants, description, owner and "Member since").
  - Confirmations use the native `<dialog>` element (focus trapped and
    returned, Escape cancels); no dialog library added.
  - No new dependencies.
  - Verified (commands actually run, before committing): `pnpm install
    --frozen-lockfile` ✓, lint ✓, type check ✓, unit tests ✓ (169
    shared, 44 web), build ✓, `pnpm db:reset` ✓, `pnpm test:db` ✓ 90
    (run twice), `pnpm test:api` ✓ 43 (run twice), Playwright Chromium ✓
    46 (run twice; 14 new): publish with two photos, reorder, preview,
    pause, resume and close (visitor sees 200/404/200/404; closed can't
    be republished, 409); a draft left after adding a photo is in My
    offers and invisible to a visitor and to another member; every
    publish field error shown with focus on the first, API 422, offer
    stays Draft; HEIC, renamed PDF and 12 MB photo refused on their
    tiles with no upload request while a valid photo uploads; delete
    draft with Cancel and confirm; editing an active offer stays Active
    and is visible to visitors, clearing the title or removing the only
    photo is refused; stale save from a second tab; session ended
    mid-form and restored after sign-in; double-click publish sends one
    publish request; keyboard-only creation; axe (no serious or
    critical issues) and no horizontal scroll at 375 and 1280 px on
    create, preview and My offers; sign-in redirect; `no-store` on the
    pages. Mutation checks, each restored afterwards: skipping the
    browser photo check (1 test failed), not applying the latest offer
    after a conflict (1 test failed).
  - Not verified: WebKit and GitHub Actions (as before); the
    real-iPhone test (needs the owner's phone and a temporary link,
    D9).
  - Deviations from the specs, for the owner's review: the success
    screen links to My offers, Edit and Create another instead of View
    offer and Share (the offer page is unit 08); ~~the form is one page at
    every width instead of steps on small screens~~ (corrected below);
    drafts save when the member clicks Save draft, adds a photo or (on
    small screens) moves to the next step, not on a timer; My
    offers shows actions as buttons instead of an overflow menu and has
    no open-proposal count (proposals are not in Milestone 1).
  - **Review corrections (owner review, 2026-10-16), still not
    committed.** Defects confirmed by tests that failed before the fix:
    1. a BATR link (header, My offers) left the form with no warning and
       lost unsaved typing; now a "Leave without saving?" dialog asks
       (Stay on this page / Leave without saving);
    2. after a refresh (which the browser already warned about) the
       typing was lost; 3. Back then Forward lost it silently. Unsaved
       typing is now kept in the tab's session storage while it differs
       from the saved offer, with the revision it was typed against, and
       restored on return with "Discard restored changes"; if the offer
       was saved elsewhere meanwhile, the stale-save message and the
       latest saved values are shown (no silent overwrite); leaving on
       purpose clears it; closing the tab still warns and keeps nothing;
    4. publishing from Preview with missing fields showed only "Some
       details need fixing"; it now returns to the form (and step) and
       focuses the first problem;
    5. My offers' Edit link had a 32px tap height; now 44px like the
       small buttons.
    Found in the visual review with realistic photos: the HEIC message
    was cut off inside a phone-width tile (now "Not added" on the tile
    and the full message under it); long titles in My offers were cut to
    one line and the thumbnail sat above the text on phones (now two
    lines beside the thumbnail).
    Spec deviation resolved: below 768px the form is three steps (Photos,
    Details, Exchange terms) with a progress indicator and a sticky Back /
    Next bar, then Preview with Publish and Save draft
    (`02-offer-creation.md`, Design and UI states); Next waits while the
    first photo uploads; moving on saves a draft; values, photo order,
    errors, preview and restored typing carry across steps. 768px and
    wider is unchanged. Autosave on a timer was not added: the specs
    don't require it.
    New: `lib/offers/leave-guard.ts` (+ test), step definitions in
    `editor-state.ts` (+ tests), `draft-backup.ts` now stores the
    revision, `ConfirmDialog` takes a cancel label,
    `e2e/offer-leaving.spec.ts` (8) and `e2e/offer-steps.spec.ts` (7).
    No new dependencies.
    Verified (actually run): frozen install ✓, lint ✓, type check ✓,
    unit tests ✓ (169 shared, 51 web), build ✓, `db:reset` ✓, `test:db`
    ✓ 90 (twice), `test:api` ✓ 43 (twice), Playwright Chromium ✓ 60
    (twice). Mutation check: turning off the link warning and the typing
    backup failed 4 tests; restored, all 8 pass. A search of the changed
    files for key-like values found none (gitleaks was not available in
    this session). Not verified: WebKit, GitHub Actions, real iPhone.
  - **Owner decisions (2026-10-16):** Unit 07 approved for a local
    commit (not pushed, merged or deployed). All six remaining
    deviations are kept as built: success screen without View offer and
    Share (add both in unit 08); visible My offers buttons, no overflow
    menu; no open-proposal count in Milestone 1 (add in Milestone 3);
    inline publish error with Publish available to retry, no toast;
    simple empty photo uploader until brand illustrations are supplied;
    title helper text, no character counter for now. Visual approval
    stays open.

- **Unit 08: Marketplace (2026-10-17), approved by the owner and
  committed locally (not pushed).** Branch
  `unit/08-marketplace` from the button fix commit (fdc9af8).
  - Explore (`/explore`, "Explore" in the header for everyone): active
    offers newest first, 20 per page with Load more (focus moves to the
    first new card, the count is announced, no offer repeats), category
    chips with All to clear, rows with a 96px thumbnail on phones and a
    grid of 2/3/4 columns at 640/768/1024. Empty marketplace (Create an
    offer), empty category (Clear filter), error with Retry, skeleton
    while loading, placeholder when a photo fails. The page and the API
    share one read (`readMarketplace`).
  - Offer page (`/offers/:id`): gallery, title, category and condition,
    Offering, Wants, description, owner name and "Member since". Share
    (the device's share sheet, else the link is copied, else shown to
    copy). The owner also sees the status badge and Edit offer, and can
    open their own draft, paused or closed offer; everyone else gets the
    same "This offer isn't available" page (404). The gallery fetches
    fresh links once when a photo fails and when a page open more than
    8 minutes regains focus; if the offer has gone it says so.
  - Success screen: View offer (primary) and Share added; Go to My
    offers becomes a secondary button; its links are now 44px tall.
  - Cleanup job: migration `20261017000100_storage_cleanup_job.sql`
    (three functions for the server only), `server/storage/cleanup.ts`,
    `/api/internal/storage-cleanup` (Bearer `CRON_SECRET`, refuses all
    calls when the secret is missing or under 32 characters),
    `pnpm cleanup:storage` (calls the running app with the secret from
    the environment or `apps/web/.env.local`).
  - No new dependencies.
  - Defect caught by the new tests and fixed: after a photo link failed,
    a refreshed link signed in the same second was identical and was
    never retried, so the photo stayed blank.
  - Verified (actually run): lint ✓, type check ✓, unit tests ✓ (169
    shared, 51 web), build ✓, `db:reset` ✓, `test:db` 91 (passed 6 of 7
    runs; one run had 1 failure that was not captured and did not
    recur), `test:api` ✓ 47, Playwright Chromium ✓ 69 (full run) with
    the 9 new marketplace tests also passing twice more. Mutation
    check: turning off orphan deletion failed 1 test; restored, all
    pass. `pnpm cleanup:storage` run against the app: report printed;
    a wrong secret is refused (401).
  - Not verified: WebKit, GitHub Actions, real iPhone (set aside by the
    owner, 2026-10-17).
  - Deviations for the owner's review: cards open the offer page
    directly (no quick-view modal); no owner avatar (profiles have no
    avatar; a generic icon is shown); no keyword search, condition
    filter or "View your proposal" (not in Milestone 1); the home page
    still says "Offers and exchanges come next" and is unchanged.
  - Owner decisions after the post-review report (2026-10-17), made in
    a second local commit on the same branch:
    1. Marketplace cursor: only the exact timestamp form the database
       returns is accepted, so a hand-made cursor gets `422
       VALIDATION_FAILED` ("This page link is no longer valid.") instead
       of a 500. API test added (it fails with the old check).
    2. Home page wording replaced as approved: "Early version", intro
       without "agree an exchange", **Explore offers** and **Create an
       offer** buttons, "How BATR works" with steps Make an offer, Get
       seen, Exchanges come next. Proposals and agreements are named only
       as not available yet.
    3. Cleanup scheduling: pending the owner's hosting approval; left
       unscheduled. No hosting configuration.
    4. Quick view: not built; cards keep opening the offer page
       (Milestone 1).
    5. Members are shown with a neutral circle holding the first letter
       of their display name (empty when there is none), on cards, the
       offer page and the header, instead of the generic person icon.
       **Interim**, not a replacement for profile photos.
    6. Optional profile photos: deferred to Milestone 2. No upload,
       schema or storage change.
    7. Resumed offers keep their original marketplace position
       (`published_at` is set on first publish only); unchanged.
    8. Header account link is spoken "Your account" on phones and
       "{name}, your account" from 640px (was "(your account)");
       check-email reads "…we've sent a link to confirm it."; the
       rate-limit message reads "Too many attempts. Wait a few minutes,
       then try again." (also in the milestone-1 error table).
    9. CI already uploads the Playwright report when browser tests fail
       (unchanged). The signed-link expiry tests keep their margins
       unless the failure recurs.

- Unit 02 `Button` tap-height fix on branch `unit/02-button-tap-height`
  (from the unit 07 commit), committed locally with the owner's
  approval (2026-10-16), not pushed.
  Small and medium **bordered** (secondary) buttons had a 42px hit area
  because the 1px border sits outside the `::before` layer; they now
  reach 44px like the others. The `/dev/ui` gallery gained a small and
  a medium secondary button, and its hit-area test now checks them
  (it failed at 42px before the fix).

- Unit 08b (design refresh, owner decisions G1–G4 and G15,
  2026-10-17) on local branch `m1/design-and-reset`, committed
  locally, not pushed. Implemented, not visually approved: the owner
  reviews the before-and-after screenshots.
  - Type: display 42/43 and display-lg 60/60 (tracking −0.035em),
    h1 tracking −0.02em, h2-lg 32/36; generated into `tokens.css`.
  - Lucide: stroke 2 at 16px, 1.75 at 20–24px, 1.5 at 32px (one CSS
    rule); `LoaderCircle` and `CircleCheck` replace the old names.
  - The exchange pair (`ExchangePair`, compact and panel) on cards,
    the offer page, My offers and the create preview.
  - Borderless cards: a row with a thumbnail on phones, a grid card
    from 640px; relative posting dates (`postedAge`).
  - Home: short ink hero, "How BATR works" with the "Early version"
    tag folded into step 03, then the 8 newest offers (4 on phones)
    and category links. The notice strip is gone.
  - White site footer with the unaltered ink logo, hidden on the
    sign-in, sign-up and reset pages.
  - Create and edit: hairline sections and a live preview beside the
    form from 1024px (phones keep the three steps and preview).
  - Account: display name and email as rows with a "Change" button;
    focus moves into the field and back to Change after saving.
  - Checks run: lint, type check, unit tests, build and the full
    Chromium end-to-end suite (one home test fixed for an empty
    marketplace, then rerun). WebKit, CI and the real-iPhone test not
    run.

- Unit 08c (password reset, owner decision G6, 2026-10-17) on local
  branch `m1/design-and-reset`, committed locally, not pushed.
  - Sign in links to `/forgot-password` (keeps `?next`); one reply for
    every email; rate-limit and network errors only.
  - BATR recovery email template (`supabase/templates/recovery.html`);
    the link handler verifies the token on the server and marks the
    session as a reset session (http-only cookie bound to the session
    id, one hour).
  - `/reset-password` needs that session; saving updates the password,
    signs out every other session, and lands on Account with "Your
    password has been changed." The current password is refused
    (new message, recorded in the milestone-1 error table).
  - Tests: shared schema tests, 5 database tests against Supabase
    (single use, one-hour expiry, unknown token, other sessions and
    refresh tokens ended, same password), 7 Chromium end-to-end tests
    for criteria 36–41 including axe at 375 and 1280px.
  - Real delivery still needs SMTP (Outstanding Before Launch). WebKit,
    CI and the real-iPhone test not run.

- Design refinements (owner, 2026-10-17) on local branch
  `m1/design-refinements`, committed locally, not pushed.
  - Built as asked: the exchange glyph is a custom curved-arrow
    `ExchangeIcon` in brand green (owner-requested exception to
    "Lucide only"); the grid card title keeps two lines' room so pairs
    and meta rows align with long titles.
  - Owner decisions (2026-10-17, 11:51) rejected serif headings,
    raised cards, the green circle and pill buttons; at 13:25 the
    owner replaced that with a reference image as the visual direction
    (white cards, serif headings, rounded green buttons, heart and
    bookmark on offer photos), so the refinements commit was kept and
    rebuilt on (see "Reference redesign" below).
  - Thumbnails raised from 400 to 800 px longest side (owner,
    conditionally approved: aspect ratios and layout unchanged). Only
    new uploads get 800 px; existing photos keep 400 px.
  - Auction concept: kept as a proposal for a future milestone, not
    built. Owner's proposed defaults for the offer round: rounds of 3,
    7 or 14 days; a 7-day selection period; optional recorded cash
    top-ups subject to the agreed rules; a public proposal count
    without proposal details.
  - Likes and Saved offers: proposal reviewed, then asked for by the
    owner with the reference image (heart and bookmark on photos);
    built with the proposal's defaults (below).
  - Real-iPhone test: approved for a temporary, access-controlled build
    only, once destination, data isolation and cleanup are confirmed;
    options proposed, none chosen, nothing deployed. WebKit and CI not
    run.

- Reference redesign, location phase 1, likes and saves (owner,
  2026-10-17, 13:25), on `m1/design-refinements`, committed locally,
  not pushed. Visual approval still open: the owner reviews the
  rendered screens.
  - Design: rebuilt around the owner's reference image
    (`context/ui-context.md`, Visual direction): white header with the
    ink logo, dark green hero panel with a real offer photo, white
    offer cards with the heart and bookmark on the photo, offer page
    with side thumbnails and "Where and how", Saved page, split auth
    card. Logo and tokens unchanged.
  - Location phase 1 (Ibadan only): optional general area from a fixed
    list of Ibadan areas (`private.offer_areas`), exchange mode (in
    person, remote, either) and handover methods (collection,
    delivery, public meeting place, service at your location, remote
    service), checked against each other in the database and the
    shared schema. No address, coordinates or free text is stored.
    Cards show "Bodija, Ibadan" or nothing; the offer page adds the
    logistics and "Exact meeting details are agreed privately between
    members." Phases 2 (distance) and 3 (private meeting details in
    agreements) are not built.
  - Likes and saves, using the proposal's defaults: private to the
    member, no counts, no notifications, never a proposal or
    reservation; only active offers of other members; undo always
    works; at most 1,000 of each (409 `limit_reached`); rows go with the
    account or the offer. `PUT/DELETE /api/v1/offers/:id/save|like`,
    `GET /api/v1/me/saved`, and a Saved page (unavailable offers stay
    listed without details, with Remove).

- Structured valuation and platform fee (2026-10-17, owner's brief;
  spec `specs/valuation-and-fees.md`):
  - Valuation form per offer: pure barter, barter plus cash or cash
    only; up to 10 items (goods, service, skill) with the
    category-specific questions in one shared list, parity-tested
    against the database; two photos of the actual item per physical
    item; declaration; drafts, sending, evidence requests, withdrawal.
  - Private evidence bucket `valuation-evidence`: images re-encoded to
    WebP on the server, PDFs refused when they contain active content
    (structural check, not a malware scan; PDFs disabled entirely from
    2026-10-18), two-minute signed links
    with the reader's own session; staff read only once sent.
  - Reviewer workspace (`/review`, staff roles granted by SQL only):
    market comparisons with adjustments and exclusion, decisions with
    rationale and confidence, inspections, internal notes, append-only
    assessments. One appeal per valuation (two from 2026-10-18), decided by a different
    reviewer.
  - 3% fee on the applicable total value, split 50/50, integer kobo,
    rounded half up, the extra kobo to the offer owner; quotes store
    basis and policy version; superseded quotes need reconfirmation.
    Ledger tables (liabilities, attempts, payments, refunds,
    adjustments) and an idempotent provider-event store exist; nothing
    collects money. The Flutterwave notification route answers 503
    until its hash is configured.
  - Public summary on the offer page: assessed total, confidence,
    whether inspected, date. (Changed 2026-10-18: signed-in members
    only.)
- Approved valuation and fee policies (owner, 2026-10-18; migration
  `20261018000100_valuation_policy_decisions.sql`, committed locally):
  - Two appeals per valuation, the second final, enforced in the
    database (function, insert trigger, number check and unique key);
    each appeal excludes whoever made the decision being appealed, and
    an appealed reviewer is read-only on that valuation (triggers on
    assignment, comparisons, notes, requests, inspections and
    assessments). Valuation policy `valuation-2026-10-18`
    (`appeals_max` 2), parity-tested.
  - Assessed value for signed-in members only: summary function
    granted to signed-in callers; visitors get a yes/no indicator and
    a sign-in prompt; database, API and browser regression tests.
  - Append-only staff role audit log (`private.staff_role_events`).
  - Fee note: due only when both members accept the final agreement;
    not escrow, insurance or a guarantee.
- Owner's final valuation decisions (2026-10-18; migration
  `20261018000200_valuation_final_decisions.sql`, committed locally):
  - PDF uploads disabled: policy `valuation-2026-10-18b`
    (`pdf_uploads_enabled` false, parity-tested), bucket limited to
    `image/webp`, a database trigger refusing PDF rows, the shared
    file check and the file picker. Image documents still accepted.
  - Repeat valuations: after a decided valuation of the same offer or
    with the same files, a new one needs new evidence (a file
    fingerprint not seen before) or a material change, plus a note
    of 20+ characters; it records `repeat_of` and `repeat_reason`,
    inherits excluded reviewers, gets two fresh appeals, and its fee
    quote needs reconfirmation. Reviewers see a repeat banner.

- Front-end polish (owner, 2026-10-20), committed locally as
  `9e4489d` on `m1/ui-polish`; details and checks in the commit and
  `ui-context.md` (Motion). The cash slot in the exchange animation
  now shows proposal cash (P2).

## In Progress

- UI refinements on local branch `ui/refinements` (from `aeaa3ef`;
  owner, 2026-10-23, asking to reduce red and clarify records):
  - Red kept only for destructive or high-consequence confirmations:
    Delete draft, Close offer, Leave without saving, Block, Agree to
    cancel (in its dialog), Suspend and Remove offer. Decline and
    Withdraw terms, Ask to cancel (a request that can be withdrawn)
    and Withdraw valuation now confirm with the primary button; the
    "Agree to cancel" button that opens the dialog is secondary. "We
    couldn't load more" is secondary text, not red. A reported
    message in moderation is highlighted amber (flagged, not proven).
    The red Like heart is kept on purpose. Errors stay red.
  - Moderation: the submit button names the action ("Suspend {name}…")
    and Suspend and Remove offer ask once more in a red dialog that
    restates the consequence and that the note is logged.
  - Handover dialog says what happens next. The still-listed prompt
    after completion says BATR doesn't close offers and when to keep
    or close one (A2 unchanged). Agreement records show
    "20 Oct 2026, 10:56 WAT" (`formatRecordTime`) and "Version N, in
    force since …". Exchanges and agreements show a short reference
    ("Ref. 95545102", `shortRef`) under the product line.
  - Checks, 2026-10-23: lint, typecheck, unit (shared 293, web 45,
    mobile 44) passed; web build passed; e2e 103 of 106 passed, the 3
    failures were the old "Version N · agreed" wording, updated, and
    `agreements.spec.ts` and `safety.spec.ts` then passed (7 of 7).
    DB and API tests not re-run (no database or API change).
  - Review plan, step 1 (owner, 2026-10-23, "proceed"): the slide
    menu was not added; the tab bar stays. Web security headers: a
    Content-Security-Policy with a fresh nonce per request (set in
    `proxy.ts`, scripts only with the nonce, no framing, images from
    Supabase Storage and blob: previews), plus HSTS, nosniff,
    X-Frame-Options, Referrer-Policy and Permissions-Policy on every
    path (`next.config.ts`, `lib/security/headers.ts`).
  - Exchanges rows lead with the product (`exchangeTitle`), then
    "with {name}"; the negotiation has a "History: N earlier sets of
    terms" link to a section now headed "History" (web and mobile).
  - Proposed specs, waiting for approval, nothing built:
    `specs/milestone-7-contact-details.md`,
    `specs/milestone-8-moderation-and-disputes.md`,
    `specs/milestone-9-services.md`. Hosting is still to be chosen.
  - Specs 7, 8 and 9 approved by the owner (2026-10-23, "Approve all").
  - Milestone 7, contact details (built): `private.contact_check`
    with the C3 normalisation, run by triggers on messages, proposal
    revisions, agreement versions, cancel requests, offers and profiles
    (CONTACT_DETAILS, 422; nothing saved). C2 narrowed while building:
    a phone is a Nigerian mobile number or 12+ digits; other 7–11 digit
    runs are ambiguous. A sign-up display name with contact details is
    dropped, not refused, so sign-up still works. The refusal rolls back
    the write, so the API records the attempt afterwards
    (`contact_attempt_record`); a member calling the database directly
    is still refused but not counted. Retries with the same key are
    refused again and counted again. The third refusal in 24 hours opens
    one automatic report ("BATR (automatic check)", reason
    `contact_details`). Ambiguous messages are sent with a warning to
    the sender only. Attempts are purged after 180 days by the cleanup
    job. C5's wording points to "here" instead of handover details,
    which don't exist yet (C10). Test set: 207 messages
    (`supabase/tests/fixtures/contact-messages.ts`), 100% caught, 0
    ordinary refused. Maestro flow `contact-details.yaml` written, not
    run (no device here).
  - Milestone 8, moderation workspace and exchange problems (built):
    reports are cases with a case number ("Case 0152"), risk (W2,
    ordering only), status (Open, In review, Closed) and an assignee.
    `/moderation` filters by type, risk, status and assignee and
    searches case number, offer title or member name; unknown filter
    values are ignored. "Take this case" and take-over are logged in
    the case. A case shows its own log and the member's history as
    counts only. Actions by type (W6): Dismiss, Remove offer, Warn,
    Suspend; an exchange problem offers Resume, Cancel the agreement,
    Record that a member didn't keep to it, Warn and Suspend, each
    against either member. Every decision closes the case; all but
    Dismiss and Warn confirm. Warn shows the member a banner once
    (web and app). New staff role `senior_moderator`: only they lift
    another moderator's suspension and record an appeal (upheld or
    lifted) on Suspended members. "Report a problem with this
    exchange" on web and app (D1): an open agreement is paused in the
    database (no handover, no new or accepted change; cancelling still
    works), the other member isn't told who reported it and can add
    their side once (checked for contact details too), and every view
    says BATR records the agreed amount only. Moderation pages are
    gated in `app/moderation/layout.tsx` so non-moderators get a real
    404 with the loading skeleton in place; `/moderation` is now a
    proxy-protected path. Risk badges are amber and blue, not red.
    Found by the browser tests and fixed: a search of a long run of
    digits crashed the queue (only "152", "#152" or "Case 0152" is
    read as a case number now). Maestro flow `report-problem.yaml`
    written, not run. No packages added.
  - Milestone 9, services as first-class offers (built, every
    default kept): `offers.offer_type` (`item` or `service`; existing
    offers are items). The form starts with "What are you offering? An
    item / A service"; a service gets its own categories (V2), no
    condition (V3), the photo hint "A photo of your work, your tools or
    a sample" (photos still needed, V4), "What the service includes"
    (V5) and only the service handover methods (V6). Switching type
    clears what doesn't fit and is a material change (V7). The
    database refuses mismatches with a field message, in the same order
    as the shared rules (logistics first). Offer page shows "Service"
    instead of the condition; cards say "Service · {category}"; Explore
    has Items / Services / Both (`?type=`, also on the API). Snapshots
    carry the type (older ones read as items), so the proposal and
    agreement notes say "service" when every changed offer is one, and
    the handover dialog says "Confirm only once the service has been
    done" (both sides services) or adds it to the usual line (mixed).
    The completion prompt says "Services usually stay listed" when
    every listed offer is a service (V8); `agreement_json` now returns
    each listed offer's type. Storybook stories for the item and
    service offer card and offer page. Maestro flow
    `create-service.yaml` written, not run. No packages added.

- Milestone 2 Part 2 on local branch `m2/mobile-exchanges` (from
  `7913804`), committed locally (owner, 2026-10-23: "Approve all",
  Q1–Q10 kept):
  - Tabs Explore, Exchanges (with its count), Create, My offers,
    Account (Q2). Saved moved out of the tabs and opens from Account.
    Messages and the bell sit above every tab with unread counts, and
    the suspended banner shows when it applies (Q7; the S8 address is
    still a placeholder).
  - Exchanges (Your turn, Waiting, Agreed, Closed, with unread counts
    per row); propose from an offer (or "View your proposal"); the
    negotiation screen with Accept, Counter, Decline and Withdraw,
    each confirmed with the terms restated, and the 30-second stale
    check with Refresh; counter; the owner's "Proposals on this
    offer".
  - Agreements: progress steps, handover, propose a change and accept,
    reject or withdraw it, ask to cancel with a reason and answer a
    request, the fee as information only, the close-offer prompt.
  - The conversation under the terms on both screens, checking every
    5 seconds while open and at once when the app returns (Q3), with
    Retry that keeps the idempotency key, Report message, mark read
    and the closed state. Messages and notification screens open the
    proposal or agreement at the conversation (`?at=messages`).
  - Safety in the app (Q6): Report member, Report message, Block from
    offers, proposals and agreements, Blocked members with Unblock,
    My reports. "What can't be offered" stays a web link.
  - API: one addition, `GET /api/v1/me/status` (Q8), with 3 API
    tests. The proposal, agreement, message, notification and safety
    response interfaces moved to `packages/shared/src/*/views.ts`,
    with `apps/web/server/api/shared-views.ts` checking the server's
    types still match. `apps/web/lib/proposals/terms.ts` moved to
    `packages/shared/src/proposals/terms.ts` (the web file
    re-exports it); `SAFETY_CONTACT_EMAIL` moved to shared.
  - `tests/api/offers.api.test.ts`: the feed-order test now checks
    only its own offers, because offers published by other test
    files running in parallel made it fail.
  - No packages added.
  - Tests: 16 new mobile screen tests (`__tests__/exchanges.test.tsx`).
    Maestro flows written, not run: `propose-and-agree.yaml`,
    `counter-and-change.yaml`, `block-and-report.yaml`;
    `browse-and-save.yaml` updated for the Propose button.
  - Checks on a fresh `pnpm db:reset`, 2026-10-23, all passed: lint,
    typecheck, unit (shared 293, web 45, mobile 44), DB 214, API 92,
    web build, Storybook build, 106 Chromium e2e, secret-pattern scan
    of the staged diff. Not run: Maestro, a real phone, WebKit, CI.
  - Review screens (web preview at 390px, made-up members):
    `/mnt/project-files/rg/design/mobile-part-2/` with
    `BATR-mobile-part-2-review.pdf`.

- Milestone 2 Part 1, units 09–12, on local branch `m2/mobile-offers`
  (from `5305cfe`), committed locally (owner, 2026-10-22: "Mobile
  app", then "Approve all"):
  - `apps/mobile`: Expo SDK 58 app with Expo Router. Tabs Explore,
    Saved, Create, My offers, Account (M2). Sign up, sign in, sign
    out, forgot password, check email; the session is kept in
    `expo-secure-store` in chunks (M4). Explore with the category
    chips (the web's only filter), pull to refresh and infinite
    scroll; the offer page with the photo carousel, Like, Save,
    Share, Report offer, the read-only assessment summary and
    "Proposing is coming to the app soon" with a link to the web
    (M1); Saved; My offers grouped by status with pause, resume, close
    and delete draft; create and edit in the web's steps with
    photos from the camera or library (HEIC converted to JPEG on the
    phone, M6), upload progress and retry, preview, publish and the
    leave-without-saving dialog. Valuation, safety pages, "My
    reports" and the rules open on the web.
  - The app reads and writes only through `/api/v1` with a Bearer
    token (M3). New endpoints: `GET`/`PATCH /api/v1/me/profile`
    (display name, email, member since; no ids) and
    `GET /api/v1/offers/:id/assessment` (visitors get only whether
    the offer is assessed; signed-in members get the summary, as on
    the web).
  - Moved to `packages/shared` so both apps use one copy: the offer
    form rules (`offers/editor.ts`, was `apps/web/lib/offers/
    editor-state.ts`), the API view types (`offers/views.ts`, was
    `lib/offers/types.ts`), `postedAge` and the new
    `memberSinceLabel` and `handoverMethodsLabel`. The web keeps
    re-export files at the old paths.
  - Lint: `react-hooks` rules for the mobile app; the raw-hex and
    font-size rules now cover `apps/mobile` too.
  - Packages added, all pinned exactly. In the spec: `expo`,
    `expo-router`, `react-native`, `expo-secure-store`,
    `expo-image-picker`, `expo-image-manipulator`, `expo-font`,
    `lucide-react-native`, `react-native-svg`,
    `@supabase/supabase-js`, `jest-expo`,
    `@testing-library/react-native`. Not named in the spec, each
    required by the above:
    - `expo-constants`, `expo-linking`, `react-native-safe-area-context`,
      `react-native-screens`: peer dependencies Expo Router needs to run.
    - `expo-status-bar`: the status bar colour over the green screens.
    - `expo-splash-screen`: keeps the splash up until the fonts load,
      so text never appears in the wrong font.
    - `expo-crypto`: random Idempotency-Keys on the phone (no
      `crypto.randomUUID` in React Native).
    - `@expo-google-fonts/inter`, `@expo-google-fonts/newsreader`: the
      font files for `expo-font` (M7).
    - `react-dom`, `react-native-web`, `@expo/metro-runtime`: the web
      preview used for review screens (M8).
    - `jest`, `@types/jest`, `@react-native/jest-preset`,
      `@types/react`: the test runner and types for the screen tests.
    - Root `eslint-plugin-react-hooks` 7.1.1: the hooks rules for the
      mobile app, the version the web already gets through
      `eslint-config-next`.
  - Maestro flows written in `apps/mobile/maestro/` (sign in and out,
    browse and save, report, create and publish, manage): **not run**,
    no simulator or emulator here (M8).
  - Checks run 2026-10-22 on a fresh `db:reset`: lint (with the CSS
    token check), typecheck (root, shared, mobile, web), unit (288
    shared, 50 web, 28 mobile screen and unit tests), DB (214), API
    (89), production build, Storybook build, Chromium e2e 106 passed (web, unchanged), a
    secret-pattern scan of the working diff. Every journey also
    walked by hand in the app's web preview at 390px against the
    local API. Not run: Maestro, WebKit, GitHub CI, a real iPhone or
    Android phone.
- Milestone 6 units 24–26, on local branch `m6/safety` (from
  `3229011`; approval recorded in `b7753c8`), committed locally (owner's
  "move on to the next phase", 2026-10-20):
  - `20261020000400_safety.sql`: `blocks`, `reports`,
    `member_suspensions`, append-only `moderation_actions`,
    `offers.removed_at`, the `moderator` staff role. Blocks and
    suspensions enforced by triggers on proposals, revisions,
    agreements, messages and publishing, and a restrictive policy on
    offers. A block closes open proposals between the pair quietly
    (`block_decline`, no notifications) and leaves agreements alone.
    Moderators read only what a report points to (S6), including the
    photos of a reported offer, and never a report by or about
    themselves.
  - Shared rules in `packages/shared/src/safety`, parity-tested.
  - API: `/api/v1/blocks` (GET, POST), `/blocks/:id` (DELETE),
    `/reports` (GET, POST), `/moderation/reports`, `/:id`,
    `/:id/actions`, `/moderation/suspensions`, `/:id/lift`. No member
    ids returned. Proposals, agreements, messages and publishing
    return "This member isn't available." or the suspension message.
  - Web: Report and Block under offers, proposals and agreements;
    Report on each of the other member's messages; Account → Safety
    (Blocked members, My reports, What can't be offered); the
    suspended banner; "Removed by BATR"; `/moderation` with the queue,
    report page, actions with notes, and suspensions.
  - Placeholders the owner must replace: the S8 contact address
    (`apps/web/lib/safety/contact.ts`) and the S9 list wording
    (`apps/web/app/rules/page.tsx`, marked "Draft list").
  - No packages added.
  - Checks run 2026-10-20 on a fresh `db:reset`: lint, typecheck (root,
    shared, web), unit (265 shared, 70 web), DB (214), API (86),
    production build, Storybook build, Chromium e2e 106 passed (full
    run repeated after the last UI change: 106 passed); lint,
    typecheck and build also re-run after that change; a
    secret-pattern scan of the staged diff. Not run: WebKit, GitHub
    CI, a real iPhone.
- Milestone 5 units 21–22, on local branch `m5/messages` (from
  `a87d962`), committed locally (owner's "Proceed?" and "yes",
  2026-10-20):
  - `20261020000300_messages.sql`: append-only `messages` (text, and
    system lines written by triggers on `proposal_events` and
    `agreement_events`), `thread_reads`, `notifications` (one per
    event for each member who didn't act; messages grouped into one
    unread notification per thread), row-level security for the two
    members and the recipient only, the 30-a-minute send limit, closed
    threads (N5). Functions: send, list (newest page, older pages,
    newer than an id for polling), mark read, unread counts, the
    Messages page list, notification list, count, read one, read all.
  - Shared rules in `packages/shared/src/messages` (limits, event
    kinds, send and read schemas, the words for system lines and
    notifications; 100% coverage on the text), parity-tested.
  - API: `/api/v1/messages`, `/api/v1/proposals/:id/messages` (GET,
    POST), `/:id/messages/read`, `/api/v1/notifications`, `/count`,
    `/:id/read`, `/read-all`. No member ids returned.
  - Web: the conversation under the terms on proposal and agreement
    pages (checks every 5 seconds while visible, N1), `/messages`,
    `/notifications`, Messages and the bell in the header (on phones
    as icons beside the account menu), unread counts on Exchanges
    rows. No realtime service, push or email.
  - No packages added.
  - Checks run 2026-10-20 on a fresh `db:reset`: lint, typecheck (root,
    shared, web), unit (260 shared, 70 web), DB (204), API (82),
    production build, Chromium e2e: 100 passed in the full run, plus
    the 2 Milestone 4 agreement journeys re-run and passing after a
    test locator was made exact (the new system line repeats the
    "proposed a change" heading); Storybook build; a secret-pattern
    scan of the staged diff. Not run: WebKit, GitHub CI, a real
    iPhone.
- Milestone 4, on local branch `m4/agreements` (from `2623914`),
  committed locally (owner's "proceed", 2026-10-20):
  - `20261020000200_agreements.sql`: agreement statuses, forward-only
    versions (version 1 written when the proposal is accepted, existing
    agreements backfilled), handover confirmations, cancellation
    requests, agreement events, snapshot photo retention, backstop
    triggers and row-level security for the two members. Writes:
    handover, propose/accept/reject/withdraw a change, request/accept/
    reject/withdraw a cancellation, all idempotent. Items kept from the
    agreed terms keep their snapshot; items a change adds must still
    match their listing (`TERMS_CHANGED`). Closed proposals no longer
    include accepted ones; the Exchanges count adds agreements waiting
    on the member (A5).
  - Shared rules in `packages/shared/src/agreements` (statuses, limits,
    schemas, permissions; 100% coverage), parity-tested.
  - API: `/api/v1/agreements` (list by box), `/:id`, `/:id/handover`,
    `/:id/changes` and `/:id/changes/:versionId/{accept,reject,
    withdraw}`, `/:id/cancellation` and `/{accept,reject,withdraw}`.
    Member ids and storage paths are not returned.
  - Web: `/agreements/:id`, `/agreements/:id/change`, Exchanges Agreed
    tab and closed agreements (see `ui-context.md`). Fees are shown as
    information only (A1); nothing is created or collected.
  - No packages added.
  - Checks run 2026-10-20 on a fresh `db:reset`: lint, typecheck (root,
    shared, web), unit (251 shared, 70 web), DB (188), API (78),
    production build, Chromium e2e 99 passed (including 3 new agreement
    journeys at 375 and 1280px with axe), Storybook build, a
    secret-pattern scan of the staged diff. Not run: WebKit, GitHub CI,
    a real iPhone.
- Milestone 3, units 13–16, on local branch `m3/proposals` (from
  `1b492aa`), committed locally (owner's "proceed", 2026-10-20):
  - Unit 13: `20261020000100_proposals.sql`: proposals, append-only
    revisions with offer snapshots, agreement records, proposal
    events, snapshot photo retention (queue trigger, storage read
    policy, orphan exclusion, `storage_cleanup_queued`), the D2
    trigger (closing an offer declines its open proposals with a
    system note), the expiry sweep, row-level security for the two
    members only. Shared rules in `packages/shared/src/proposals`
    (limits, schemas, change chips, permissions; 100% branches) and a
    new `TERMS_CHANGED` (409) code. Parity-tested.
  - Unit 14: `/api/v1/proposals` (list by box with a cursor, create,
    get, counter, accept, decline, withdraw), `/api/v1/offers/:id/
    proposals` (owner only) and `/api/v1/agreements/:id`. Member ids
    and storage paths are not returned (parties are "proposer" and
    "owner"; photos are links signed with the viewer's session).
  - Units 15–16: the composer (`/offers/:id/propose`, and
    `/exchanges/:id/counter` prefilled), Exchanges (Your turn,
    Waiting, Closed), the negotiation view with history and change
    chips, Agreed with the D1 prompt, Propose on other members' active
    offers, the owner's proposal list on their offer, and an
    Exchanges link with a count in the header and tab bar.
  - The cleanup job also records expired proposals (same hosting
    caveat: not scheduled anywhere yet).
  - No packages added.
  - Checks run 2026-10-20 on this branch: lint, typecheck (web and
    shared), unit (241 shared, 70 web), DB (174), API (74), production
    build, Chromium e2e 96 passed (including 3 new proposal journeys
    at 375 and 1280px with axe), Storybook build, a secret-pattern
    scan of the staged diff (gitleaks isn't installed here). Not run:
    WebKit, GitHub CI, a real iPhone.
- Header icon: the owner will check it on her phone (shown at 36px
  from a 48/96px image; may look slightly soft on 3x screens).
- Visual design approval stays open (owner, 2026-10-16): it does not
  block database work and will be reviewed with representative BATR
  marketplace screens (units 07–08), not the coming-soon page alone.

## Outstanding Before Launch

Owner, 2026-10-16: these stay visible until done. They don't all
block the next unit, but each is addressed in the unit named before
launch. Not done means not done: none of these has run yet.

| Item | Status | Where it is addressed |
| --- | --- | --- |
| WebKit browser tests | Not run (WebKit not installed here; its download host is blocked in this environment, and the owner set this aside on 2026-10-17) | GitHub Actions e2e job, once the repository is connected; every unit from 05 adds WebKit-covered tests |
| GitHub Actions CI (all jobs) | Never run (no repository connected) | As soon as the owner connects GitHub; every unit branch must then pass CI |
| Partial-deletion failure test (storage unreachable while deleting a photo or draft) | Built and passing locally (unit 06, photo removal); not yet run in CI | Unit 06; CI once connected |
| Cleanup job (queue retry, orphaned files > 24 h, expired idempotency keys) and its tests | Built and passing locally (unit 08, committed locally); not yet run in CI; not scheduled on any host (owner, 2026-10-17: stays unscheduled until she approves the hosting arrangement) | Unit 08; scheduling at the deployment decision |
| Server-side image processing (sharp: metadata/GPS removal, rotation, WebP sizes) and its tests | Built and passing locally (unit 06); not yet run in CI | Unit 06; CI once connected |
| HEIC rejection (`422 UNSUPPORTED_FORMAT`) | API rejects it (unit 06) and the browser refuses it before upload (unit 07); both tested locally; not yet run in CI or WebKit | CI once connected |
| Cache header on signed photo downloads | Files are stored with `max-age=600`, but local storage does not send it on signed downloads | Check the hosted storage and CDN at the deployment milestone |
| Offer API rate limiting (`429 RATE_LIMITED` in the error table) | Not built; the milestone sets no limits | Owner decision before any public deployment |
| Real-iPhone HEIC test | Not run: unit 07 is built, the test needs the owner's iPhone and a temporary private link (D9) | With the owner, before unit 07 is approved or as soon as possible after |
| Visual design approval | Direction approved (2026-10-17); final approval open | After the design refinements are reviewed and the real-iPhone check is done |
| Real-iPhone visual check (navigation, spacing, wrapping, tap targets) | Not run | Approved for a temporary access-controlled build once destination, data isolation and cleanup are confirmed (owner, 2026-10-17) |
| Auth rate limits per visitor | Supabase limits sign-in and sign-up per IP address, and the web server makes those calls, so all visitors share one limit | Before any public deployment: pass the visitor's address to Supabase or add per-visitor limits in the app |
| Registered-email disclosure by the Supabase sign-up endpoint | BATR pages never reveal it, but local Supabase answers a repeat sign-up with `422 user_already_exists` to anyone calling its API directly | Check and configure the hosted Supabase project before deployment |
| Breached-password check (auth spec: "if available") | Not available in local Supabase | Hosted Supabase setting, before deployment |
| Real email delivery (SMTP) | Local inbox only | Before deployment |
| Platform fee collection | Not operational: no payment provider account, keys or verification; fees are quoted only; no live credentials configured, payments not activated | Provider integration and the items in `specs/valuation-and-fees.md` §11 |
| Malware scanning of valuation documents | Not built. PDF uploads are disabled (owner, 2026-10-18) until a scanner is integrated and tested; image documents only | Before PDFs are re-enabled, with the owner's approval (spec §4, §11) |
| Valuation reviewers and inspectors | Roles exist; granting is SQL only, logged in `private.staff_role_events`; nobody is granted outside tests. Two appeals need at least three reviewers | Owner decides staffing and who grants roles; inspection logistics and safety documented first |
| Valuation evidence retention (24 months after closure, holds, account deletion) | Approved as policy; not implemented (no closure date, holds or retention job; account removal cascades rows and leaves files) | Before launch, with an NDPA check and a published retention policy |
| Fee timing enforcement, refunds, cancellations, disputes | Approved as policy (spec §1–2); not implemented | Agreement and payment milestones; deadlines and expiry defined first |
| Nigerian tax advice on the platform fee | Not obtained | Before live payments |

Scope reminder (owner, 2026-10-16): proposals and agreements
(`state-model.md` §3–6) stay out of scope until their specifications
are explicitly approved. §3–5 were approved on 2026-10-20 and
proposals are built (Milestone 3); agreements (§6) are built in
Milestone 4 (2026-10-20).

## Next Up

- The owner's visual review of the refined screens and her choice of
  hosting for the real-iPhone test.
- The owner's visual review of the reference redesign (rendered
  screens at 375 and 1280px).
- Hosting arrangement for the cleanup schedule (owner).
- For the owner's review, documents only: the consolidated location
  spec; reporting, blocking and moderation requirements; the BATR
  Professionals requirements; the unit 12b profile-photo criteria.
- The owner's review of the Milestone 3 screens
  (`/mnt/project-files/rg/design/proposals/`).
- The owner's review of the Milestone 4 screens
  (`/mnt/project-files/rg/design/agreements/`).
- The owner's review of the Milestone 6 safety screens
  (`/mnt/project-files/rg/design/safety/`), the S8 contact address
  for suspended members, and the S9 "What can't be offered" wording
  (both placeholders in the build).
- The owner's review of the Milestone 2 Part 1 mobile screens
  (`/mnt/project-files/rg/design/mobile/`, captured from the app's
  web preview).
- Running the Maestro flows on a simulator or in CI, and trying the
  app on a phone once hosting for a test server is chosen (M9).
- The owner's review of the Milestone 2 Part 2 mobile screens
  (`/mnt/project-files/rg/design/mobile-part-2/`), then a phone test
  of the whole app once hosting for a test server is chosen.

## Open Questions

Product
1. What can be exchanged: physical goods, services, or both?
   *Owner, 2026-10-17 (BATR Professionals decision): BATR Exchange
   covers products, skills and services. Recorded as answered,
   pending the owner's confirmation; offers have no "kind" field yet.*
2. May a proposal include a cash top-up? If yes, BATR only records
   it (no payments) unless scope changes. *Raised again by the
   owner's "cash-supported exchanges" for BATR Professionals
   (2026-10-17): recorded only, or processed? Still open.*
   *Owner, 2026-10-17 (valuation brief): barter plus cash is an
   exchange type; the cash is exchanged between members, and both
   pay their fee shares to BATR in cash. Answered for valuation;
   fee collection is not built. Refunds, cancellations, partial
   releases, disputes, fee timing, escrow, tax and provider charges
   are open (spec §8).*
3. Can one proposal bundle several items on each side?
4. Is BATR local-first (meet in person, location matters) or
   shipping-based, or both? This decides whether offers need a
   location and whether discovery filters by distance. *The owner
   said on 2026-10-16 that location matters and location-aware
   matching is in the first public launch; that is recorded so far
   only in the uncommitted proposal (`rg/proposed/location-matching`).
   On 2026-10-17 the owner put location on hold pending a consolidated
   spec.*
5. Target countries, languages and currency display.
6. Can signed-out visitors browse offers, or is the marketplace
   members-only? *Answered: yes (decision D6, 2026-10-15).*
7. Should proposals expire automatically? If so, after how long?
8. Ratings / reputation after a completed agreement: in or out?
9. Disputes: is a cancellation request enough for launch, or is a
   moderator-mediated dispute flow needed?
10. Moderation: is there a moderator role, reporting of offers and
    members, and prohibited-item rules? *Owner, 2026-10-17: define
    reporting, blocking and moderation requirements before Milestone
    2 planning is final, and address them before any iOS release.*
    *Answered 2026-10-20 by `specs/milestone-6.md` (approved, S1–S10);
    the S8 contact address and the S9 list wording are still the
    owner's to supply.*
11. Identity: email only, phone number verification, or more?
12. Minimum age for members.
13. Offer categories list. *Answered: defaults kept (decision D7,
    2026-10-15).*

Design
14. Brand source files: hex values, and vector or PNG exports
    (iOS 1024 full-bleed icon without baked corners, Android adaptive
    layers, favicon set, transparent horizontal logo). All supplied
    files are JPEG renders whose colors differ between versions.
15. The wordmark's typeface name, and a reversed (light) wordmark.
    The interim white-text logo is on hold because it alters the
    artwork; the owner can approve it or supply a designer version.
16. Dark mode at launch or later?

Technical
17. Stack: answered (see Architecture Decisions).
18. Is there existing code? None known; a new repository is planned.
19. Hosting preference and budget constraints.
20. Push notifications and email at launch, or in-app only first?
    *Owner, 2026-10-17: in-app first; email and push are separately
    specified and approved work.*
22. Where the code should live: a new private GitHub repository
    (`batr` suggested), created by the owner and connected to this
    project. Not yet connected: on 2026-10-15 no GitHub account was
    linked to Claude, so unit 01 is committed locally and saved as a
    git bundle in the project folder (`unit-01/batr-unit-01.bundle`).
23. Approve `specs/state-model.md` §3–6 before Milestones 3–4, and
    decide D1–D4 in §8. D5–D9 are decided. *Owner, 2026-10-20: D1–D4
    approved with every default kept; proposals on the web come next,
    before the mobile app. §3–5 approval comes with the Milestone 3
    spec.*

Housekeeping
21. Three personal photos (selfies) were uploaded alongside the
    design references in the project folder. They were not used.
    Confirm whether they belong to this project.

## Architecture Decisions

- 2026-10-18 00:36 (owner, final valuation decisions): keep the
  visitor indicator "Assessed by BATR. Sign in to see the assessed
  value."; the exact value only for authenticated members on every
  delivery path; a genuinely new valuation gets its own two appeals,
  but a repeat after a decided valuation needs new evidence or a
  material change and a note, inherits excluded reviewers, and its fee
  quote needs both parties' reconfirmation; PDF uploads disabled until
  malware scanning is integrated and tested, images unchanged.
- 2026-10-18 (owner, valuation and fee policies): fee rules approved as
  built (odd kobo to the offer owner); inspection threshold stays
  unset; two appeals per valuation, the second final, each handled by
  a reviewer who made none of the appealed decisions; assessed value
  for signed-in members only; fee due after both parties accept the
  final agreement and before performance, a quote is not a debt;
  refunds when cancelled before performance or on BATR's error,
  case-by-case review for disputes after performance, no partial
  releases; Flutterwave, BATR absorbs provider charges, taxes shown
  separately, tax advice before live payments; no escrow; 24-month
  evidence retention proposed; role grants audited; malware scanning
  before production; NGN only. Details and open questions:
  `specs/valuation-and-fees.md` §10–11.
- 2026-10-17 (owner's valuation brief): 3% platform fee on the
  applicable total exchange value (assessed non-cash value plus agreed
  cash, counted once), split 50/50 and paid to BATR in cash; no
  separate fee on the cash. Implemented with integer kobo and versioned
  fee and valuation policies in the database; the inspection threshold
  is deliberately unset. Defaults chosen and flagged for the owner:
  the offer owner bears an odd kobo; one appeal per valuation; staff
  roles granted by SQL; valuation photos private; a public summary of
  the assessed total. Exchange cash is never recorded as BATR money.
  (Superseded 2026-10-18: two appeals, and the assessed total for
  signed-in members only.)
- 2026-10-17 (owner, decisions on the product audit):
  - G1 Design direction "the exchange is the hero" APPROVED: premium,
    restrained, product-led; the exchange is the recurring visual
    language. Final visual approval after the implemented screenshots.
  - G2 Home: the early-version notice folds into step 03 with a small
    "Early version" tag. G3 Relative posting dates on cards. G4 White
    footer with the existing horizontal ink logo.
  - G5 Reporting, blocking and moderation: requirements first (before
    Milestone 2 planning is final; before iOS release). No report
    reasons, moderation actions or admin dashboard without approved
    requirements.
  - G6 Forgot password and set new password added to Milestone 1
    (unit 08c), server-side with email.
  - G7 BATR Professionals is part of the same platform (see
    `project-overview.md`); its requirements are documented before
    any design or build.
  - G8 The 16 document inconsistencies corrected in a docs-only
    commit, with no behaviour change and no unresolved decision made.
  - G9 Notifications: in-app first. G10 State models §5–6 reviewed and
    approved before Milestone 3. G11 Location matching on hold; a
    consolidated spec comes for review first. (2026-10-17, 13:25:
    phase 1, general area and logistics for Ibadan, approved and
    built; distance and private meeting details still on hold.) G12 Profile photos in
    Milestone 2 as unit 12b with acceptance criteria. G13 Saved offers
    stay open, separate from user reports, moderation records and
    analytics reports. G14 Dashboards and analytics deferred, not
    permission to build any. G15 Live preview beside the create form
    on wide screens and a **Change** row on Account approved; phones
    keep an appropriate flow.
  - Defaults proposed with the decision register (apply unless the
    owner changes them): the reset messages and behaviour in
    `milestone-1.md` (same message for every email, 1-hour single-use
    link, other sessions signed out after a reset), footer contents,
    posting-age wording, unit number 12b.

- 2026-10-15 (owner): Overall design direction and the
  exchange-specific UI concepts APPROVED. Exact token values, type,
  spacing and component details remain PENDING APPROVAL.
- 2026-10-15 (owner): Web and native mobile platforms APPROVED.
- 2026-10-15 (owner): Sampled logo colors are reference only and
  never UI tokens; logo artwork is never altered.
- 2026-10-15 (owner): No verification, rating or trust claim without
  a defined and implemented evidence source.
- 2026-10-15 (owner): UI statuses must map to defined states and
  permitted transitions; agreement and proposal rules must be defined
  before agreement interactions are built.
- 2026-10-15 (owner): Offer state rules APPROVED in principle for
  Milestone 1. Proposal and agreement rules stay PENDING APPROVAL and
  must not be implemented until explicitly approved.
- 2026-10-15 (owner): Stack APPROVED for the web milestone: Next.js,
  Supabase and the shared package. Expo is reserved for the native
  mobile milestone. Avoid extra dependencies unless justified.
- 2026-10-15 (owner): D8 decided, option A: JPEG, PNG and WebP only
  for Milestone 1; iPhone JPEG conversion to be verified on a real
  device in unit 07.
- 2026-10-15 (owner): D5 photo links last 10 minutes, with refresh
  support. D6 and D7 keep their defaults. D9: try a temporary private
  link for the iPhone test, else a preview deployment.
- 2026-10-15 (owner): Milestone 1 scope APPROVED in principle; final
  spec awaiting approval. No implementation before that.
- 2026-10-15: Dependencies proposed for Milestone 1 with reasons:
  `sharp` (strip photo location data, resize, convert to WebP on the
  server) and `gitleaks` in CI (block committed secrets). HEIC support
  adds a package only if the owner picks D8 option B or C.
- 2026-10-15: No secrets in source control. Variable names live in
  `.env.example`; values live in a git-ignored `.env.local` and in
  GitHub Actions secrets later.
- 2026-10-15 (owner): Milestone 1 specification APPROVED; unit 01
  authorized. Proposals and agreements remain out of scope.
- 2026-10-15: Unit 01 dependency choices. Runtime: `next`, `react`,
  `react-dom` (approved stack). Development: `typescript` 6.0 (not
  7.0, which `typescript-eslint` does not support yet), `eslint` 9.39
  (not 10: the React, import and accessibility plugins inside
  `eslint-config-next` do not support ESLint 10 yet; ESLint 9 no
  longer receives upstream support, so revisit when they do),
  `@eslint/js`, `typescript-eslint`, `eslint-config-next` (lint),
  `vitest` (unit and database tests), `@playwright/test` (browser
  tests), `supabase` CLI (local Supabase), `@types/*`. Not yet
  installed because no unit-01 code needs them: `zod`, Supabase
  client libraries, Tailwind (unit 02), `sharp` (unit 06), axe.
  CI tools run as pinned images or actions, not dependencies:
  gitleaks 8.30.1.
- 2026-10-15: Unit 02 dependencies. Runtime: `lucide-react` (icons
  named in `ui-context.md`). Development: `tailwindcss` and
  `@tailwindcss/postcss` (styling in the approved stack),
  `@axe-core/playwright` (accessibility checks named in Milestone 1).
  Inter loads through Next.js's built-in font loader, no package. No
  headless UI library yet (added with the first dialog or menu).
- 2026-10-16: Unit 03 dependencies. Runtime (`packages/shared`):
  `zod` 4.6.7 (named in Milestone 1). Development:
  `@vitest/coverage-v8` 5.0.5, not in the Milestone 1 list; needed to
  enforce the 100% branch coverage on transitions and permissions
  that `code-standards.md` requires. Same version as Vitest.
- 2026-10-16: Unit 04 dependencies, development only (database
  tests): `@supabase/supabase-js` 2.118.0 (named in Milestone 1; the
  app adds it as a runtime dependency in unit 05), `pg` 8.23.1 and
  `@types/pg` 8.23.1, not in the Milestone 1 list: a direct database
  connection is needed to hold a row lock during the race tests, to
  write directly as the database owner for the trigger tests, and to
  inject a failure for the atomicity test.
- 2026-10-16: Unit 06 dependency, runtime (`apps/web`): `sharp`
  0.35.5, named and justified in Milestone 1 (Photos: the only way to
  remove hidden location and camera data and to produce consistent
  sizes). Its prebuilt binaries install through optional dependencies;
  no install script is enabled.
- 2026-10-16: Unit 05 dependencies, runtime (`apps/web`):
  `@supabase/supabase-js` 2.118.0 (named in Milestone 1) and
  `@supabase/ssr` 0.12.7, not in the Milestone 1 list: Supabase's own
  helper for keeping the session in http-only cookies across server
  components, server actions, route handlers and the proxy, including
  token refresh. Writing that by hand would duplicate security-sensitive
  cookie handling.
- 2026-10-16 (owner): Unit 06 service key APPROVED for deleting
  photo files on the server after the database commit, with these
  restrictions: never exposed to the browser; never used for member
  reads or ordinary member writes; deletes only paths taken from
  trusted queued records; failed deletions stay queued for retry. The
  unit 08 cleanup job and test setup use it on the same terms.
- 2026-10-16 (owner): Unit 06 Bearer tokens APPROVED alongside the web
  session cookie, for future native mobile clients. Both methods go
  through the same sign-in check and the same database permissions;
  cookie-signed writes keep the other-site check; invalid, expired and
  cross-member access are tested for both.
- 2026-10-20: Front-end polish dependencies (owner request,
  2026-10-20, naming these tools). Runtime (`apps/web`): `motion`
  12.43.0 for state-driven transitions (the exchange builder), loaded
  through `LazyMotion` so only the DOM animation features ship;
  `swiper` 12.2.0 for swipe and slide handling in the one carousel
  component. Development: `storybook` 10.6.1,
  `@storybook/nextjs-vite` 10.6.1 and `vite` 8.3.1 (Storybook's
  builder) for component stories. Versions chosen at least two weeks
  old. No headless UI library: the account menu and toasts are small
  hand-written components, so shadcn/ui and Radix were not added.
- 2026-10-15: Transitions run as Postgres functions (one transaction
  each, with audit and idempotency), mirrored by the shared transition
  table; a test keeps the two identical.
- 2026-10-15: Structure reduced to the minimum: no Turborepo, no
  separate UI, token or API-client packages. New packages need a
  recorded reason.

## Session Notes

- The earlier claude.ai shared chat link could not be read from the
  agent environment, so any code or decisions in it are not
  reflected here. Paste or upload them to reconcile.
- Feature specs live in `specs/` at the repo root (owner's request).
- Brand files in `assets/brand/`; usage rules in `ui-context.md` under Brand Assets.
