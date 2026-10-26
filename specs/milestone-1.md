# Milestone 1: Offers on the Web

Status: **APPROVED by the owner (2026-10-15)**; unit 01 was
authorized the same day (see `context/progress-tracker.md`). Stack
approved for this milestone: Next.js, Supabase, `packages/shared`.
Expo is reserved for Milestone 2. Units 01–08 are built; the
milestone is not release-ready until every acceptance criterion
below has passed (see the tracker's Outstanding Before Launch).

Implements only the offer rules in `state-model.md` §1–2. Nothing from
the proposal or agreement rules (§3–6) is implemented.

## Goal

A member can sign up on the web, create an offer with photos, save it
as a draft, publish it, and manage it; anyone can browse published
offers and open one. Every change is stored atomically with an audit
record, protected by authorization in the API and the database, and
covered by automated tests that run against a real local Supabase.

## In scope

- `apps/web` (Next.js), `packages/shared`, `supabase/` (migrations).
- Email + password sign-up with email verification, sign-in,
  sign-out, display name.
- Forgot password and set a new password by email (added by the
  owner, 2026-10-17; see Password reset).
- The approved visual direction, "the exchange is the hero" (owner,
  2026-10-17; see `ui-context.md`). Overall visual approval stays open
  until the owner reviews the implemented screens.
- Offer lifecycle exactly as `state-model.md` §2.
- Photo upload (1–8 per offer), reorder, remove, with private storage
  and controlled access (see Photos).
- My offers page; marketplace (active offers, newest first, category
  filter, pagination); offer detail page.
- Transactions, idempotency, audit, validation, error states,
  authorization, automated tests.

## Out of scope

Mobile app; proposals; agreements; messaging; notifications; keyword
search; location beyond phase 1 (distance, maps, private meeting
details); ratings or any trust claim except "Member since";
OAuth; moderation; dark mode; deployment to a public host. The offer
page has no "Propose exchange" or "Message" button.

## Additions (owner, 2026-10-17, 13:25)

- **Location phase 1 (Ibadan only).** Optional on every offer: a
  general area from a fixed list (`ibadan` for the whole city, or an
  Ibadan area such as `ibadan_bodija`), an exchange mode (`in_person`,
  `remote`, `either`) and handover methods (`collection`, `delivery`,
  `public_meetup`, `on_site_service`, `remote_service`). A remote
  exchange may only use `remote_service`; an in-person one may not use
  it (422 on `handover_methods`). No address, coordinates or free-text
  place is accepted or stored. Shown as "Bodija, Ibadan" on cards and
  the offer page, never when unknown or remote.
- **Likes and saves.** A signed-in member can like and save another
  member's active offer: `PUT`/`DELETE /api/v1/offers/:id/like` and
  `/save` (repeatable, no idempotency key; 401 signed out, 403 own
  offer, 404 missing or not active, 409 `limit_reached` past 1,000).
  Removing always works. Both are private (no counts; the owner never
  sees who), notify no one and are never a proposal or reservation.
  `GET /api/v1/me/saved` lists saves newest first, 20 per page; an
  offer no longer available comes back as `offer: null`. Offer reads
  include the viewer's own `liked` and `saved` (not for the owner or
  signed-out visitors).

## Repository and execution environment

- **Repository:** a new private GitHub repository owned by the owner
  (name suggestion: `batr`). The project context (`CLAUDE.md`,
  `context/`, `specs/`, `assets/`) is copied into it in unit 01 so the
  code and its rules live together. The copy in the project folder
  stays as the review copy until the owner says otherwise.
- **Where Claude works:** this cloud environment. Verified on
  2026-10-15: Node 22, pnpm 10, npm registry reachable, Docker engine
  can be started, Docker Hub images download. The Supabase CLI's
  default image registry (AWS public registry) refused downloads here,
  so local Supabase is started with Docker Hub images instead (an
  environment variable, no code change). A full local start (database,
  Auth, Storage, REST) was run successfully this way on 2026-10-15. The environment is
  temporary: all work is pushed to the repository on a branch, never
  kept only here.
- **CI:** GitHub Actions on the repository runs lint, type check,
  unit tests, the local-Supabase database and API tests, and the
  Playwright end-to-end and accessibility tests on every push.
- **Branching:** one branch per unit (`unit/01-scaffold`, …) with a
  pull request for the owner to review. Claude never merges.
- **Status (2026-10-17):** no repository is connected yet, so CI has
  never run and no pull request exists; branches are local and shared
  as git bundles. WebKit has not run. These requirements stand; see
  the tracker's Outstanding Before Launch.

## Secrets and configuration

Milestone 1 needs **no secrets from the owner**:
- Local Supabase generates fixed development keys and a local email
  inbox (for verification emails) on start. These are development-only
  values; they are still never committed. The app reads them from
  `apps/web/.env.local`, which is git-ignored, and CI reads them from
  the Supabase CLI output at run time.
- The repository contains `apps/web/.env.example` listing variable
  names only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server-only; used only by the cleanup
  job and test setup, never in request handling), `CRON_SECRET`.
- A secret-scanning check in CI fails the build if a key-like value is
  committed.
- A hosted Supabase project, a host for the website, and a real email
  sender are needed only when the owner wants a public deployment
  (a later decision).

## Units (built and verified one at a time, each as its own pull request)

| # | Unit | Visible result |
| --- | --- | --- |
| 01 | Scaffold | Repository with `apps/web`, `packages/shared`, `supabase/`; strict TS; ESLint; Vitest; Playwright; local Supabase scripts; CI workflow; secret scan; home page renders |
| 02 | Tokens and primitives | Tokens from `ui-context.md` as CSS variables; Button, Badge, TextField, Textarea, Select, SegmentedControl, PhotoTile; header on ink with the compact icon; `/dev/ui` gallery in development builds only |
| 03 | Shared offer rules | Zod schemas, field classification, transition table and function, permission rules, status labels; unit tests |
| 04 | Database | Tables, constraints, transition trigger and functions, RLS, storage bucket and policies, idempotency store, cleanup queue; database tests with real members |
| 05 | Auth | Sign up, verify email (local inbox), sign in, sign out, display name; protected pages redirect and return |
| 06 | Offer API | Endpoints below; photo processing; integration tests |
| 07 | Create and manage offers | Form, photo uploader with previews, preview, publish; My offers with pause, resume, close, delete draft; HEIC error; real-iPhone test recorded (see Photos) |
| 08 | Marketplace | List with category filter and pagination; offer detail; cleanup job; end-to-end and accessibility tests |
| 08b | Design refresh (owner, 2026-10-17) | Approved type scale and icon rules; the Offering ⇄ Wants exchange pair on cards and the offer page; borderless grid cards with posting age; home page with newest offers; white footer with the horizontal ink logo; live preview beside the create form on wide screens; Account rows with **Change**. No data or API change |
| 08c | Password reset (owner, 2026-10-17) | Forgot password and set new password by email, server-side; see Password reset |

## Password reset (owner, 2026-10-17)

Web only in this milestone; the mobile flow belongs to the Milestone 2
spec. No `/api/v1` endpoint is added. Values marked *default* were
proposed to the owner on 2026-10-17 and apply unless the owner changes them.

**Flow**
1. Sign in shows a **Forgot password?** link to `/forgot-password`
   (it keeps `?next`).
2. `/forgot-password` (dark auth frame): one email field and **Send
   reset link**. The server action asks Supabase Auth to send a
   recovery email. Whatever the outcome (registered, unregistered or
   unconfirmed email), the person sees the same message: "If an
   account exists for this email, we've sent a link to reset your
   password." (*default*). Rate limiting returns the shared
   rate-limit message.
3. The email (BATR template, `supabase/templates/recovery.html`)
   links to `/auth/confirm?token_hash=…&type=recovery`. The handler
   verifies the token on the server, which starts a session, and
   redirects to `/reset-password`. Links last 1 hour and work once
   (*default*, the Supabase setting).
4. `/reset-password` (dark auth frame, needs the session from the
   link; without one it redirects to `/forgot-password` with "This
   link has expired or was already used. Request a new one."):
   **New password** (at least 10 characters, the sign-up rule) and
   **Save new password**.
5. On success the password is updated on the server, **every other
   session is signed out** (*default*), and the member lands on
   Account with "Your password has been changed."

**Rules**
- Nothing reveals whether an email is registered.
- The reset session can only change the password; it is an ordinary
  session afterwards, like the confirmation link's.
- Implementation (unit 08c): Supabase marks a reset session the same
  way as a confirmation session, so the link handler stores the new
  session's id in a one-hour http-only cookie and `/reset-password`
  (page and action) accepts only the session whose verified id
  matches. Other sessions are ended with Supabase's sign-out of
  "others", which also invalidates their refresh tokens (tested in
  `supabase/tests/password-reset.db.test.ts`).
- The new password is never logged or echoed back.
- Real delivery needs SMTP (Outstanding Before Launch); locally the
  email arrives in the local inbox.

## Offer fields: three groups

| Group | Fields | Meaning | Effect of an edit |
| --- | --- | --- | --- |
| **Material item fields** | title, description, condition, offering_text, photo set (a photo added or removed) | Describe the item being exchanged | `content_version` + 1; would make earlier proposal snapshots unacceptable once proposals exist |
| **Owner preference** | wants_text; area, exchange_mode, handover_methods (location phase 1, owner 2026-10-17) | What the owner would like in return; never part of agreed terms (terms list items explicitly) | No version change |
| **Discovery and presentation metadata** | category; photo order (which photo is the cover); photo alt text | Where and how the offer is found and shown | No version change |

Rules:
- The classification is defined once in `packages/shared` as a table
  covering every editable field. A test fails if any editable field
  is missing from the table, so a new field cannot be added without
  deciding its group.
- One edit request that changes several material fields increments
  `content_version` once.
- Publish rules apply to all groups (category is required to publish
  even though it is not material).

## Photos

### Formats (decision D8: option A, chosen by the owner 2026-10-15)

Accepted: **JPEG, PNG and WebP only.** HEIC (the iPhone camera
format) is not accepted in this milestone.

- The file picker asks for `image/jpeg, image/png, image/webp`.
- **Assumption to verify, not a guarantee:** when a web page does not
  ask for HEIC, Safari on iPhone is expected to convert library
  photos to JPEG before handing them over. This is browser behaviour
  that BATR does not control and that can change with iOS versions or
  photo settings. Unit 07 includes a real-iPhone test (below) to
  check it. If the test shows that HEIC files still arrive, the clear
  error below protects the data, and the owner decides whether to
  revisit D8 (options B or C).
- **If HEIC arrives anyway** (picker returns it, or a desktop user
  picks a `.heic` file): the browser detects it by file type and file
  signature before uploading and shows, on that photo tile: "This
  photo is in HEIC format, which BATR doesn't support yet. Please
  choose a JPEG, PNG or WebP photo." The server checks the signature
  too and returns `422 UNSUPPORTED_FORMAT` with the same message, so
  a HEIC file is never stored even if the browser check is bypassed.
  Other photos on the form are unaffected.
- Options B (convert on the server) and C (convert in the browser)
  remain documented in `state-model.md` §8 for a later milestone; both
  add a dependency.

**Real-iPhone test (unit 07).** On a real iPhone with a current iOS
version, in Safari and in Chrome (which uses the same engine on iOS):
1. pick a photo taken with the camera in its default (HEIC) setting
   from the photo library;
2. take a new photo from the picker's camera option;
3. pick a HEIC file from the Files app.
Expected: 1 and 2 upload and display as JPEG-derived photos; 3 shows
the unsupported-format error. The result (iOS version, browser,
outcome) is recorded in the progress tracker. This test needs the app
reachable from the phone; how is decision D9.

**D9 (decided by the owner 2026-10-15):** first try a temporary
private link from the development environment, open only for the
duration of the test. If this environment's network does not allow
it, fall back to a preview deployment, for which the owner creates
free Vercel and Supabase accounts at that point; their keys go into
those services' settings, never the repository.

### Processing (every upload)

1. The API checks the file signature (not just the name), the size
   (≤ 10 MB) and the format.
2. The server re-encodes the image with **sharp** (dependency
   justified: it is the only way to remove hidden location and camera
   data from phone photos, and to produce consistent sizes):
   - strips all metadata, including GPS location;
   - applies the stored rotation;
   - saves two WebP files: display (longest side 1600 px) and
     thumbnail (longest side 800 px; owner, 2026-10-17, was 400). WebP displays in all current
     browsers.
3. The original upload is discarded; only processed files are stored.
4. The photo preview shown before upload uses the person's own file
   in the browser, which works for all accepted formats.

### Storage and access

- One **private** bucket, `offer-photos`, configured to accept only
  `image/webp` files of at most 2 MB (the processed output). Paths:
  `{owner_id}/{offer_id}/{photo_id}-{display|thumb}.webp`.
- **Storage write path (who writes the processed files).** The upload
  API route validates and processes the image on the server, then
  uploads the two WebP files to storage **with the owner's own
  session**, never the service key, so the storage policies below are
  enforced by Supabase on the write itself. Only then does it call the
  database function that adds the photo row (see Concurrency). If that
  database step fails, the two paths go to the cleanup queue.
- Storage policies (enforced by Supabase on every request):
  - **Insert:** only a signed-in member, only under their own
    `owner_id` folder, only for an offer they own whose status is
    `draft`, `active` or `paused`, and only a file name matching the
    path pattern. Overwriting an existing file is not allowed
    (no upsert, no update policy).
  - **Delete:** no member can delete storage files directly. Files are
    deleted only by the server, from paths written into the cleanup
    queue by the database functions (see Deletion and revocation).
    This uses the service key, which is server-only.
  - **Read (and therefore signing):** only when a photo row exists for
    that exact path, and the viewer may read its offer: the owner
    always; anyone else (including signed-out visitors, D6) only while
    the offer is `active`.
- A member who bypasses the API and uploads a file straight into
  their own folder gains nothing: with no photo row, nobody (not even
  that member) can read or sign it, and the cleanup job deletes it
  after 24 hours.
- Pages never use permanent public links. The server creates
  **signed URLs** using the viewer's own session (or the signed-out
  client), so the read policy is applied at signing time.
- **Link lifetime: 10 minutes (D5, decided by the owner 2026-10-15).**
  One setting in `packages/shared`; tests read the setting rather than
  a fixed number, and use a few seconds where they need to observe
  expiry.
- **Refresh.** `GET /api/v1/offers/:id/photo-urls` returns fresh
  signed URLs for a viewer who may still read the offer, and `404`
  otherwise. The gallery calls it once when an image fails to load
  (for example a page left open longer than 10 minutes) and when a
  page that has been open for more than 8 minutes regains focus. If
  the refresh returns `404`, the page shows "This offer isn't
  available".

### Deletion and revocation (exact guarantee)

A signed URL is checked only when it is issued. Once issued, it works
until it expires or the file is physically deleted, whichever comes
first. BATR does not revoke issued URLs instantly; the remaining
window is bounded as follows.

| Event | New access blocked | What can remain accessible, and for how long |
| --- | --- | --- |
| Offer paused or closed | At commit: no new link for anyone but the owner | Links issued earlier, until they expire: at most 10 minutes after the pause or close |
| Photo removed, or draft deleted | At commit: the photo rows are gone, so no new link can be issued to anyone, the owner included | Links issued earlier, until they expire or the file is deleted, whichever is first: at most 10 minutes after the commit, **even if storage deletion fails** (a link cannot outlive its expiry) |
| Storage deletion fails | Nothing changes for access (already blocked at commit) | The file stays in the bucket, unreachable by any member or visitor, until the cleanup job deletes it. It is reachable only with the server-only service key |

- In the normal case the API deletes the files right after the commit,
  in the same request, which ends access at once even for links
  already issued.
- Copies already on a viewer's device (browser cache, an open page, a
  saved or screenshotted image) cannot be revoked by any approach.
- Instant revocation of issued links would need every image served
  through BATR's own server with a check per request. Not adopted:
  more code, slower images, higher hosting cost, for photos that were
  visible to these viewers anyway. The bounded 10-minute window is the
  documented guarantee.

### Caching

Cache headers control how long a browser or intermediary may **reuse**
a copy without asking again. They do not revoke anything and do not
remove an image already displayed. The policy is chosen to avoid
extending the window above, not to provide revocation:

- **Photo files:** stored with `cache-control: max-age=600` (no longer
  than the link lifetime). A signed URL is unique per signing, so a
  cached copy is reused only for the same link, and only by a browser
  that already downloaded it. Whether the hosted Supabase CDN caches
  signed responses, and how deletion purges it, is checked at the
  deployment milestone; local development has no CDN. No guarantee in
  this spec relies on caches being cleared.
- **Pages and API responses that include photo links or non-active
  offers:** `Cache-Control: private, no-store`, so neither the browser
  nor a shared cache keeps a page that would reissue an old link or
  show a paused offer. Public marketplace and offer pages are rendered
  per request and are not shared-cached.

### Cleanup

- Deleting a draft runs one database transaction that: locks the
  offer; checks status `draft` and `expected_revision`; writes the
  audit event (which survives the deletion, see Data); adds every
  storage path to `storage_cleanup_queue`; deletes the photo rows and
  the offer row.
- Removing a photo works the same way for that photo's two paths, and
  renumbers the remaining photos (see Photo order).
- After the transaction commits, the API deletes the queued files
  with the server-only key and removes them from the queue. If a
  deletion fails, the entry stays in the queue with the error and an
  attempt count.
- The same queue receives the files of an upload whose database step
  fails, and of an idempotent upload retry that was already completed.
- A cleanup job (`/api/internal/storage-cleanup`, protected by
  `CRON_SECRET`, also runnable as `pnpm cleanup:storage`) retries the
  queue and deletes **orphaned files**: files in the bucket with no
  photo row, older than 24 hours. It also deletes expired idempotency
  keys. In development and CI it is run by the tests; scheduling it on
  a host is part of the later deployment decision. Until it runs, a
  failed deletion leaves a file stored but unreachable (see Deletion
  and revocation).

## Idempotency

- Every mutation **requires** an `Idempotency-Key` header (a UUID the
  browser generates once per user action and reuses on retry).
  Missing → `400 IDEMPOTENCY_KEY_REQUIRED`.
- Storage: `idempotency_keys` (actor_id, key, endpoint, resource_id,
  request_hash, response_status, response_body, created_at,
  expires_at). Primary key (actor_id, key). Readable and writable only
  through the transition functions; members cannot touch the table
  directly.
- **Member scope:** keys belong to one member; two members using the
  same key never interact.
- **Endpoint scope:** the row records the endpoint (method + route)
  and resource id. Reusing a key on a different endpoint or resource
  → `422 IDEMPOTENCY_KEY_REUSED`.
- **Body mismatch:** `request_hash` is SHA-256 of the canonical JSON
  body (sorted keys) or, for uploads, of the file bytes plus fields.
  Same key, different hash → `422 IDEMPOTENCY_KEY_REUSED`.
- **Atomic protection:** the transition function inserts the key row
  at the start of its transaction. A concurrent request with the same
  key waits on that row; when the first commits, the second returns
  the stored response without executing. If the first fails and rolls
  back, the key row disappears and a retry executes normally. The
  state change, its single audit event and the key row commit
  together or not at all.
- **Without the same key:** a second attempt at the same change is
  stopped by the row lock and the `expected_revision` and
  `expected_status` checks (`409`), so duplicate transitions, edits and
  audit events are impossible either way.
- **Order of checks:** the key is looked up first. A completed key
  returns its stored response even if the offer has changed since, so
  a retry never turns into a `409`.
- Uploads: the key is checked before processing; storage files are
  written under the new `photo_id`; if the database step finds the key
  already completed, the new files go to the cleanup queue and the
  stored response is returned.
- Keys expire 24 hours after creation and are then deleted by the
  cleanup job. A key reused after expiry is treated as a new request;
  the revision check still prevents it from applying a change twice.
- This section is the single definition; `state-model.md` §1 refers
  to it.

## Concurrency: edits, photos and transitions

An edit or photo change must never race with publish, pause, resume
or close and leave an offer in an invalid state, and two edits must
never silently overwrite each other. Publish eligibility, the expected
status and the expected revision are checked **atomically in the
database**, not only in the API:

1. **One write path.** Members have read access only (through RLS) to
   `offers` and `offer_photos`; they cannot insert, update or delete
   rows directly. Every write (create, edit, photo add, remove or
   reorder, every transition, draft delete) is a database function
   that checks the caller is the owner. A direct write attempt with a
   member's own token is denied (tested).
2. **Lock the offer first.** Every one of those functions starts by
   locking the offer row (`SELECT … FOR UPDATE`). Photo functions lock
   the parent offer, not just the photo row. So all writes to one
   offer run one after another; two can never interleave.
3. **Check after the lock.** After the lock is taken, the function
   reads the current status and photos and checks:
   - `expected_revision` (sent with **every** mutation on an existing
     offer): the offer has a `revision` number that increases by one on
     every successful write to the offer or its photos (any field,
     material or not, photo add, remove, reorder, alt text, every
     transition). If the client's number is not the current one,
     `409 CONFLICT` with `reason: stale_revision`, the current
     revision and the current offer; nothing changed;
   - `expected_status` (also sent with every mutation): if the offer
     has changed state, `409 CONFLICT` with `reason: status_changed`
     and the current status; nothing changed;
   - the action is allowed in that status (for example, no edits or
     photo changes on a closed offer);
   - after applying the change, an `active` or `paused` offer (and a
     draft being published) still satisfies every publish rule,
     including 1–8 photos; otherwise `422`, nothing changed.
4. **Database backstop.** Constraint triggers on `offers` and
   `offer_photos`, checked at commit, reject any transaction that
   would leave an `active` or `paused` offer failing a publish rule or
   with a status change outside the transition table. These hold even
   if a function has a bug.
5. **Stale edits are rejected, never merged.** The page keeps the
   member's unsaved input and shows "This offer was changed in another
   window or device. Review the latest version, then save again." with
   the latest values loaded. No field-by-field merge, no last-write-wins.
   `content_version` is unchanged in meaning: it still counts material
   changes only and is not used for conflict detection.
6. **Uploads.** Image processing happens before the database step and
   holds no lock. The upload request carries `expected_revision` and
   `expected_status` as read when the upload started. The database step then locks the offer and runs the
   checks above; if the offer was closed or the photo limit reached in
   the meantime, it returns `409`/`422` and the processed files go to
   the cleanup queue.

Examples, each covered by a test that holds the lock in one
connection while the other request waits:

| Race | Result |
| --- | --- |
| Edit clears the title while publish runs | Whichever locks first wins; the other gets `409` (status changed) or `422` (rule broken). Never an active offer with an invalid title |
| Remove the last photo while publish runs | Publish gets `422` (no photo), or removal gets `409`/`422`. Never active with 0 photos |
| Edit while pause or close runs | The edit gets `409` with the new status; the owner reloads and retries if still allowed |
| Upload completes after close | `409`; files queued for cleanup; no photo row added |
| Pause and close at the same moment | One succeeds; the other gets `409`. One audit event per successful transition |
| Two edits from two windows, same status (material or not) | The first saves and increases `revision`; the second gets `409 stale_revision` and nothing changes |
| Two reorders at the same moment | The first applies; the second gets `409 stale_revision` |
| Reorder while a photo is added or removed | Whichever locks first applies; the other gets `409 stale_revision`. Positions stay 1…n with no gaps or duplicates |
| Alt-text edit while the title is edited | The second gets `409 stale_revision` |

### Photo order

- Positions are always 1…n (n ≤ 8), contiguous, unique per offer.
- `unique (offer_id, position)` is a **deferrable** constraint,
  checked at commit, so positions can be swapped inside one
  transaction without passing through a duplicate.
- Reorder sends the complete ordered list of the offer's photo ids
  plus `expected_revision`. Under the offer lock, the function checks
  the list is exactly the current set of photo ids (same ids, no
  missing or extra; otherwise `409 stale_revision`), then sets every
  position in **one statement** from the list, increments `revision`,
  and writes no `content_version` change (photo order is discovery
  metadata).
- Adding a photo takes position n + 1 under the lock (refused at 8).
  Removing a photo renumbers the rest to 1…n − 1 in the same
  transaction.

## Data

| Table | Columns and constraints |
| --- | --- |
| `profiles` | id (= auth user id), display_name (2–40), created_at |
| `offers` | id, owner_id, title, description, category, condition, offering_text, wants_text, status (`draft`/`active`/`paused`/`closed`), content_version (≥ 1, material changes only), revision (≥ 1, every write), created_at, updated_at, published_at, closed_at. Members: read only (RLS); writes through functions only. Commit-time triggers reject status changes not in the transition table and `active`/`paused` offers that fail publish rules (including photo count) |
| `offer_photos` | id, offer_id (cascade on offer delete), display_path, thumb_path, position (1–8), width, height, alt_text, created_at; unique (offer_id, position) DEFERRABLE INITIALLY DEFERRED; unique display_path and thumb_path; at most 8 per offer. Members: read only (RLS) |
| `audit_events` | id, actor_id, entity_type, entity_id, action, from_state, to_state, content_version, revision, created_at. `entity_id` has **no foreign key**, so a draft's `delete` event (from `draft`, to none) remains after the offer row is gone. No offer content is copied into it. Written only by the functions; members cannot insert, update or delete; members can read events where they are the actor |
| `idempotency_keys` | actor_id, key, endpoint, resource_id, request_hash, response_status, response_body, created_at, expires_at; primary key (actor_id, key); functions only (see Idempotency) |
| `storage_cleanup_queue` | id, path, reason, attempts, last_error, created_at |

Categories (DEFAULT, D7): Electronics; Clothing and accessories; Home
and garden; Books and media; Sports and outdoors; Baby and kids;
Other. Conditions (DEFAULT, D7): New; Like new; Good; Fair.

## API

All mutations: signed in, `Idempotency-Key` required, executed by a
database function in one transaction that locks the offer first.
Every mutation on an existing offer (edits, photo changes and
transitions) carries `expected_revision` and `expected_status`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /api/v1/offers` | member | Create a draft |
| `PATCH /api/v1/offers/:id` | owner | Edit fields (rules depend on state) |
| `POST /api/v1/offers/:id/photos` | owner | Upload one photo |
| `DELETE /api/v1/offers/:id/photos/:photoId` | owner | Remove a photo (refused if an active or paused offer would have none) |
| `PUT /api/v1/offers/:id/photos/order` | owner | Reorder photos (complete ordered id list) |
| `POST /api/v1/offers/:id/publish` | owner | `draft → active` |
| `POST /api/v1/offers/:id/pause` | owner | `active → paused` |
| `POST /api/v1/offers/:id/resume` | owner | `paused → active` |
| `POST /api/v1/offers/:id/close` | owner | `active/paused → closed` |
| `DELETE /api/v1/offers/:id` | owner | Delete a draft |
| `GET /api/v1/me/offers?status=` | member | Own offers in any state |
| `GET /api/v1/offers?category=&cursor=` | anyone | Active offers, newest first, 20 per page |
| `GET /api/v1/offers/:id` | anyone for active; owner otherwise; others 404 | Offer detail, including `revision` |
| `GET /api/v1/offers/:id/photo-urls` | same as detail | Fresh 10-minute signed URLs (refresh) |

Responses: `{ data }` or `{ error: { code, message, fields?,
current_status? } }`.

## Validation

| Field | Draft | Publish, and any edit while active or paused |
| --- | --- | --- |
| title | ≤ 80 chars | 5–80 chars, trimmed |
| description | ≤ 2000 chars | ≤ 2000 chars |
| category | in list or empty | required |
| condition | in list or empty | required |
| offering_text | ≤ 200 chars | 3–200 chars |
| wants_text | ≤ 200 chars | 3–200 chars |
| photos | 0–8 | 1–8 |
| each photo | JPEG, PNG or WebP only (D8 option A); ≤ 10 MB; checked by file signature | same |
| alt_text | ≤ 200 chars, optional | same |

Browser and server share the Zod schemas in `packages/shared`; the
server and database are authoritative.

## Error states

| Situation | API | What the person sees |
| --- | --- | --- |
| Not signed in, member action | 401 `UNAUTHENTICATED` | Redirect to sign-in, then back |
| Write to someone else's offer | 403 `FORBIDDEN` if active, else 404 | "You can't change this offer" / not-available page |
| Read a non-active offer, not owner | 404 `NOT_FOUND` | "This offer isn't available"; state never revealed |
| Invalid fields, or an edit that would make an active/paused offer unpublishable | 422 `VALIDATION_FAILED` + `fields` | Inline errors; focus on the first; nothing saved |
| State changed since the page loaded, or transition not allowed | 409 `CONFLICT`, `reason: status_changed` + `current_status` | Message; status refreshed |
| Offer changed since the page loaded (another window or device) | 409 `CONFLICT`, `reason: stale_revision` + current revision and offer | "This offer was changed in another window or device…"; unsaved input kept; latest values shown |
| Missing idempotency key | 400 `IDEMPOTENCY_KEY_REQUIRED` | Generic error (should not happen from the app) |
| Key reused with a different request | 422 `IDEMPOTENCY_KEY_REUSED` | Generic retry message |
| Photo too large or wrong type | 422 | Tile-level error naming the accepted formats; other photos unaffected |
| HEIC photo | 422 `UNSUPPORTED_FORMAT` (also caught in the browser before upload) | Tile-level message that HEIC isn't supported yet, asking for JPEG, PNG or WebP |
| Upload interrupted | network error | Tile shows Retry (same key) |
| Rate limited | 429 `RATE_LIMITED` | "Too many attempts. Wait a few minutes, then try again." |
| Reset link requested | (server action) | "If an account exists for this email, we've sent a link to reset your password." Same for every email |
| Reset link expired, used or invalid | (link handler) | Forgot password page: "This link has expired or was already used. Request a new one." |
| New password too short | (server action) | Field error: "Use at least 10 characters." |
| New password same as the current one | (server action; Supabase `same_password`) | Field error: "Choose a password that is different from your current one." (*default*, added in unit 08c) |
| Server or storage failure | 500 `INTERNAL`; transaction rolled back; stray files queued for cleanup | Generic message with Retry; form input kept |
| Empty marketplace / empty category | 200, empty list | Empty state with Clear filter |

## Authorization

- Only the owner can edit, change the state of, delete, or manage
  photos of an offer.
- Non-owners can read only `active` offers and their photos;
  everything else is 404.
- The same rules exist in the API (shared permission functions), in
  row-level security on every table, and in storage policies.
- Public responses include only public offer fields, signed photo
  URLs, owner display name and "Member since" month.

## Automated tests

All database, storage and API tests run against a **real local
Supabase** started by the Supabase CLI (in this environment and in
CI). No policy is mocked. Test setup creates real member accounts
through Supabase Auth, signs each in, and uses each member's own
session token, plus a signed-out client.

| Layer | Covers |
| --- | --- |
| Shared rules (Vitest) | Every allowed transition; for each action a rejected state and a rejected actor; validation; field classification completeness; one version bump per edit; status labels. 100% branch coverage on transitions and permissions |
| Database security (Vitest, real RLS) | Members A and B and a signed-out client: B cannot select, update or delete A's draft, paused or closed offers or their photo rows; signed-out sees only active offers; nobody can write `audit_events`, `idempotency_keys` or `storage_cleanup_queue` directly; A cannot insert, update or delete `offers` or `offer_photos` directly with A's own token; illegal status changes and unpublishable active offers are rejected by the commit-time triggers even when written directly as the database owner |
| Storage security (Vitest, real policies) | B cannot upload into A's folder, overwrite or delete A's files, or create a signed URL for A's draft photos; A cannot overwrite or delete A's own files directly, cannot upload under another member's folder, under a closed offer, or a non-WebP or oversized file; a file A uploads directly without a photo row cannot be signed by anyone; the API's upload uses A's session (an upload attempted for an offer A doesn't own is refused by storage itself, not only by the API); signed-out can sign URLs only for active offers' photos; signed URLs stop working after expiry (tested with a short expiry); after pause or close, non-owners can no longer obtain a new link, while a link issued earlier works until it expires (documented behaviour, asserted so it cannot change silently) |
| Transition parity | Database transition table equals the shared one |
| Atomicity (fault injection) | A forced failure after the state update leaves state, audit, idempotency and queue rows unchanged |
| Idempotency and concurrency | Parallel publishes → one transition, one audit row; same key → same response, no second audit; same key different body or endpoint → 422; missing key → 400; stale `expected_status` → 409; two members using the same key are independent |
| Edit and transition races | Each race in the Concurrency table, run with one connection holding the offer lock while the second request waits; after both finish, the offer satisfies every rule for its status and the audit count matches the successful transitions |
| Photos | Metadata (including GPS) is absent from stored files; display and thumbnail sizes; renamed PDF and 12 MB image rejected; a file with a HEIC signature is rejected by the browser check and, with the browser check bypassed, by the API (`422 UNSUPPORTED_FORMAT`) |
| Deletion, revocation and cleanup | Deleting a draft or removing a photo removes its files and ends access to links issued earlier. **Storage failure:** the server's deleter is pointed at an unreachable storage address (a test-only setting refused in production builds); then the rows are gone, the audit event exists, the paths are queued with the error, nobody (owner included) can obtain a new link, a link issued just before (test lifetime of a few seconds) stops working at expiry although the file still exists, and the cleanup job later deletes the files and empties the queue. Orphaned files older than 24 hours are removed, newer ones kept |
| Caching | Photo files carry `max-age` no longer than the link lifetime; responses containing photo links or non-active offers carry `private, no-store` |
| Revisions and ordering | Every kind of write increases `revision` by exactly one; a stale `expected_revision` on edit, alt text, category, reorder, photo add or remove, and each transition returns 409 and changes nothing; reordering swaps positions without a constraint error; a reorder list with a missing, extra or foreign id is refused; positions stay 1…n after add and remove |
| Draft-delete audit | After a draft is deleted, its `delete` audit event remains, with no offer content in it |
| API integration | Every endpoint: success, 401, 403/404, 422, 409, 400/422 for keys |
| End to end (Playwright, Chromium and WebKit) | Main journey below; validation errors; paused and closed offers disappear; B cannot open A's draft URL |
| Accessibility (axe) | Sign-up, create offer, My offers, marketplace, offer detail, forgot password, set new password |

Main journey: A signs up and verifies (local inbox) → creates a draft
with 2 photos → publishes → a signed-out visitor finds it and opens it
→ A edits the title → the visitor sees the new title → A pauses → the
visitor gets "not available" → A resumes, then closes → it stays
hidden.

## Acceptance criteria

Criteria 1–18 are the original set, **word for word as first
written**. Where a later clarification makes one stricter, the
addition is shown underneath as "Also:" so it can be checked against
the original. No original requirement is removed or weakened.
Criteria 19–35 were added by the clarifications.

1. From a clean clone, `pnpm install` then `pnpm lint`, `pnpm
   typecheck`, `pnpm test` and `pnpm build` all pass; CI runs the
   same plus the end-to-end tests on every push.
   *Also:* CI also runs the database and storage security tests.
2. The repo contains only `apps/web`, `packages/shared` and
   `supabase/`. Any added package is justified in the tracker.
   *Also:* the project context files (`CLAUDE.md`, `context/`,
   `specs/`, `assets/`) are copied into the repo, as planned for
   unit 01. They are documents, not code packages.
3. A new person can sign up with email and password, verify their
   email, set a display name, sign out and sign back in.
4. A signed-in member can create a draft, leave, and find it under
   My offers marked **Draft**, visible to nobody else.
   *Also:* "nobody else" is tested through the UI, the API, the
   database and storage.
5. The member can publish an offer that has 1–8 valid photos and all
   publish fields; it appears at the top of the marketplace for a
   signed-out visitor within one page load.
6. Publishing with no photo, a title under 5 characters, a missing
   category or condition, or empty "What I'd like" is refused: the
   form shows each field error, the API returns 422, and the offer
   stays **Draft**.
7. A 12 MB image or a renamed PDF is rejected with a tile-level error.
8. Pause removes the offer from the marketplace and its detail page
   returns "not available" to others; resume restores it; close
   removes it permanently; a closed offer cannot be published again
   (409).
9. Only drafts can be deleted; deleting removes their photos from
   storage.
   *Also:* if storage is unavailable at that moment, the paths are
   kept in the cleanup queue and removed by the cleanup job (tested).
   The draft and its photo rows are always deleted at once, so the
   photos can no longer be signed for anyone.
10. Member B receives 403 or 404 for every write to A's offer, and
    404 for A's non-active offers, through the API and directly
    against the database.
    *Also:* the same holds directly against storage, with B's own
    session.
11. Material edits increase `content_version`; non-material edits do
    not.
    *Also:* exactly one increase per edit request; "non-material"
    means the preference and discovery-metadata groups defined in
    Offer fields.
12. Every state change creates exactly one audit event with actor,
    from and to.
    *Also:* in the same transaction as the change.
13. Two rapid publish requests with the same idempotency key produce
    one transition and one audit event.
    *Also:* the same holds for two publish requests with different
    keys at the same moment.
14. The marketplace returns 20 offers per page, newest first, with no
    duplicates across pages, and filters by category.
15. Every status badge shown comes from the shared status-label
    function; no trust claims appear other than "Member since".
16. The UI uses only tokens (a lint check rejects raw hex values in
    app code) and the logo files as supplied.
    *Note:* this includes the interim logo files the owner approved
    on 2026-10-15 (format conversions of the supplied artwork). The
    interim white-text logo stays unused because it alters the
    artwork.
17. Pages work at 375px and 1280px width, can be completed with the
    keyboard alone, and axe reports no serious or critical issues.
18. `context/progress-tracker.md` records each completed unit.
19. An edit to an active or paused offer that would break a publish
    rule (including removing the last photo) is refused with 422 and
    changes nothing; a valid edit stays **Active** and is visible on
    the next load.
20. Only the transitions in `state-model.md` §2 succeed; every other
    attempt returns 409 and is also rejected by the database trigger.
21. A failed transition leaves no state change, no audit event, no
    idempotency record and no queued cleanup (fault-injection test).
22. Idempotency follows the rules above: required key, member and
    endpoint scope, body mismatch 422, stored response on retry.
23. Draft photos can be read and signed only by their owner; active
    offers' photos only through signed URLs that expire after 10
    minutes (D5); the bucket is private. After pause or close, no new
    link is issued to non-owners; links issued earlier last until
    they expire, as documented. A refresh endpoint issues new links
    while the viewer may still read the offer.
24. Stored photos contain no metadata (no GPS); only processed WebP
    files are kept.
25. Orphaned photo files older than 24 hours and expired idempotency
    keys are removed by the cleanup job.
26. Database and storage security tests use real local Supabase
    policies and real member sessions, with no mocks.
27. Every editable field is classified as material, preference or
    discovery metadata in one shared table, and a test enforces it.
28. No secret is committed; CI fails on a committed key.
29. Every offer write locks the offer row and checks
    `expected_revision`, `expected_status` and publish eligibility
    inside the same database transaction; members cannot write offer or photo rows
    directly; each race in the Concurrency table is tested and never
    leaves an offer in an invalid state.
30. A HEIC file is rejected with the unsupported-format message, in
    the browser and by the API, and never stored; the real-iPhone
    test in unit 07 is run and its result recorded in the tracker.
    *Status:* the real-iPhone test has not been run (set aside by the
    owner on 2026-10-17); this criterion is not yet met.
31. Two writes based on the same revision never both apply: the
    second, whether a material edit, a non-material edit, a photo
    change or a reorder, gets 409 `stale_revision`, changes nothing,
    and the form keeps the member's unsaved input.
32. Reordering is atomic: positions remain 1…n and unique at every
    commit, two simultaneous reorders cannot interleave, and the
    unique (offer_id, position) constraint never fails on a valid
    reorder.
33. Processed photos are written to storage with the owner's own
    session under the storage policies; members cannot overwrite or
    delete storage files directly, and a file without a photo row
    cannot be read or signed by anyone.
34. After a photo is removed or a draft is deleted, nobody can obtain
    a new link from that moment, and no link works more than 10
    minutes after it, even when storage deletion fails; the failed
    files are queued and later deleted by the cleanup job (tested
    with a real storage failure path).
35. A draft's `delete` audit event remains after the offer row is
    deleted.

Criteria 36–41 were added with password reset (owner, 2026-10-17).

36. A member who forgot their password can request a link from Sign
    in, follow the emailed link, set a new password of at least 10
    characters, and sign in with it; the old password no longer works.
37. Requesting a link shows the same message for a registered, an
    unregistered and an unconfirmed email, and the page's behaviour
    does not differ between them.
38. An expired, used or tampered link never allows a password change
    and sends the person back to request a new link.
39. After a reset, other signed-in sessions of that member are signed
    out; the browser that reset stays signed in.
40. `/reset-password` without a valid reset session never shows the
    form's success path and cannot change any password.
41. Both pages pass axe at 375 and 1280px and are usable by keyboard
    alone.

## Dependencies introduced in this milestone

next, react, react-dom, tailwindcss, typescript, zod,
@supabase/supabase-js, @supabase/ssr, sharp (metadata removal and
resizing, see Photos), vitest, @playwright/test,
@axe-core/playwright, eslint with the Next.js config, the Supabase CLI
(development and tests only), and a secret-scanning step in CI
(gitleaks GitHub Action). A HEIC library only if the owner picks
option B or C for D8. Nothing else without a reason in the tracker.

## Owner setup steps (before unit 01)

1. Create an **empty private GitHub repository** (suggested name
   `batr`; no README, no licence, no .gitignore).
2. Connect GitHub to Claude, if not already:
   https://claude.ai/connect-github , and install the Claude GitHub
   app on that repository:
   https://github.com/apps/claude/installations/select_target
3. Reply here with the repository name (`owner/batr`).
4. Leave GitHub Actions enabled (the default for new repositories).
5. Optionally, under the repository's Settings → Branches, protect
   `main` so changes arrive only by pull request.
6. Decisions D5–D9 are made. Nothing else is needed before unit 01.

No Supabase account, hosting account, API key or email service is
needed before unit 01. Accounts for a preview deployment are needed
only if the temporary private link (D9) does not work at unit 07.
