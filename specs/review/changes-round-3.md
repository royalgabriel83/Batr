# Changes, round 3 (2026-10-15)

Targeted corrections requested by the owner on 2026-10-15. No
redesign. Proposals and agreements stay out of Milestone 1. Nothing is
implemented, branched or pushed.

## Where each request is answered

| Request | Section(s) changed |
| --- | --- |
| Concurrent edits overwrite each other | milestone-1: Concurrency (new `revision` / `expected_revision`, stale edits rejected, new race rows), API, Error states, Data; state-model §1 Optimistic check, §2 table and field groups |
| Photo-order and metadata races | milestone-1: Concurrency table, new Photo order subsection |
| Photo deletion and revocation | milestone-1: new Deletion and revocation (exact guarantee table), Cleanup; state-model §2 Privacy |
| Caching wording | milestone-1: new Caching subsection; state-model §2 Privacy |
| Storage write path | milestone-1: Storage and access (owner's session, insert only, server-only deletes, read requires a photo row) |
| Atomic reordering with unique position | milestone-1: Photo order (deferrable unique constraint, one-statement update, exact id list) |
| Idempotency consistent in both files | state-model §1 now matches milestone-1 Idempotency (endpoint and resource scope, request hash, 400 on missing key, concurrent retries, expiry); milestone-1 adds check order and post-expiry behaviour |
| Draft-delete audit survives | milestone-1: Data (`audit_events.entity_id` has no foreign key), Cleanup; state-model §1 step 4, §2 table |
| Sections 3–6 stay pending | state-model approval table and new Milestone 1 boundary paragraph |
| Tests | milestone-1 Automated tests: Storage security, Deletion/revocation/cleanup (real storage failure path), Caching, Revisions and ordering, Draft-delete audit; state-model §9 |
| Acceptance criteria | 23 and 29 tightened; 31–35 added. 1–18 unchanged word for word (checked against the first version) |
| D5, D6, D7, D9 | Recorded as decided in both files; owner setup step 6 updated |

## Exact changes

Unified diffs against the version sent before this round. Lines
starting with `-` were removed, `+` were added.

```diff
--- milestone-1.md (before)
+++ milestone-1.md (after)
@@ -146,14 +146,12 @@
 outcome) is recorded in the progress tracker. This test needs the app
 reachable from the phone; how is decision D9.
 
-**D9: how the iPhone reaches the app for this test.** The development
-environment is private, so a phone cannot open it directly.
-
-| Option | What it needs | Trade-off |
-| --- | --- | --- |
-| **A. Recommended: temporary private link** from the development environment for the duration of the test | Nothing from the owner | Not yet confirmed that this environment's network allows it; checked at unit 07. If it does not, fall back to B |
-| B. Preview deployment | Owner creates free Vercel and Supabase accounts at unit 07; keys go into those services' settings, never the repository | A few minutes of owner setup; also gives a shareable preview for later milestones |
-| C. Postpone the device test to the deployment milestone | Nothing now | The HEIC assumption stays unverified during Milestone 1; the error message is the only safeguard |
+**D9 (decided by the owner 2026-10-15):** first try a temporary
+private link from the development environment, open only for the
+duration of the test. If this environment's network does not allow
+it, fall back to a preview deployment, for which the owner creates
+free Vercel and Supabase accounts at that point; their keys go into
+those services' settings, never the repository.
 
 ### Processing (every upload)
 
@@ -173,70 +171,116 @@
 
 ### Storage and access
 
-- One **private** bucket, `offer-photos`. Paths:
+- One **private** bucket, `offer-photos`, configured to accept only
+  `image/webp` files of at most 2 MB (the processed output). Paths:
   `{owner_id}/{offer_id}/{photo_id}-{display|thumb}.webp`.
+- **Storage write path (who writes the processed files).** The upload
+  API route validates and processes the image on the server, then
+  uploads the two WebP files to storage **with the owner's own
+  session**, never the service key, so the storage policies below are
+  enforced by Supabase on the write itself. Only then does it call the
+  database function that adds the photo row (see Concurrency). If that
+  database step fails, the two paths go to the cleanup queue.
 - Storage policies (enforced by Supabase on every request):
-  - **Write** (upload, replace, delete): only the authenticated owner,
-    only under their own `owner_id` folder, only for an offer they own
-    that is `draft`, `active` or `paused`.
-  - **Read**: the owner always; anyone else (including signed-out
-    visitors, decision D6) only when the offer is `active`.
+  - **Insert:** only a signed-in member, only under their own
+    `owner_id` folder, only for an offer they own whose status is
+    `draft`, `active` or `paused`, and only a file name matching the
+    path pattern. Overwriting an existing file is not allowed
+    (no upsert, no update policy).
+  - **Delete:** no member can delete storage files directly. Files are
+    deleted only by the server, from paths written into the cleanup
+    queue by the database functions (see Deletion and revocation).
+    This uses the service key, which is server-only.
+  - **Read (and therefore signing):** only when a photo row exists for
+    that exact path, and the viewer may read its offer: the owner
+    always; anyone else (including signed-out visitors, D6) only while
+    the offer is `active`.
+- A member who bypasses the API and uploads a file straight into
+  their own folder gains nothing: with no photo row, nobody (not even
+  that member) can read or sign it, and the cleanup job deletes it
+  after 24 hours.
 - Pages never use permanent public links. The server creates
   **signed URLs** using the viewer's own session (or the signed-out
-  client), so Supabase applies the read policy when signing: a draft's
-  photos can be signed only for its owner, and a paused or closed
-  offer's photos only for its owner.
-- **A signed URL cannot be withdrawn once issued.** It stays usable
-  until it expires, even if the offer is paused or closed in the
-  meantime. Pausing or closing stops new links from being issued to
-  anyone but the owner; it does not cancel links already handed out.
-  Deleting a photo or a draft does end access at once, because the
-  file itself is removed.
-- **Link lifetime (decision D5, see below).** The specification
-  currently says 1 hour. The recommended change is 10 minutes.
-- Images are uploaded with a short browser cache lifetime
-  (`cache-control: max-age` equal to the link lifetime), so a viewer's
-  browser does not keep serving the image from its own cache for
-  longer than the link would have lasted. Anything a viewer already
-  downloaded or saved cannot be recalled by any approach.
-- Owner pages and draft previews are never cached; public pages are
-  not shared-cached.
-
-#### D5: how long should a photo link last?
-
-Who is exposed: only people who could already see the offer while it
-was active (or the owner). A draft's photos are never signed for
-anyone else. The question is only how long such a person can still
-load a photo after the offer is paused or closed.
+  client), so the read policy is applied at signing time.
+- **Link lifetime: 10 minutes (D5, decided by the owner 2026-10-15).**
+  One setting in `packages/shared`; tests read the setting rather than
+  a fixed number, and use a few seconds where they need to observe
+  expiry.
+- **Refresh.** `GET /api/v1/offers/:id/photo-urls` returns fresh
+  signed URLs for a viewer who may still read the offer, and `404`
+  otherwise. The gallery calls it once when an image fails to load
+  (for example a page left open longer than 10 minutes) and when a
+  page that has been open for more than 8 minutes regains focus. If
+  the refresh returns `404`, the page shows "This offer isn't
+  available".
+
+### Deletion and revocation (exact guarantee)
+
+A signed URL is checked only when it is issued. Once issued, it works
+until it expires or the file is physically deleted, whichever comes
+first. BATR does not revoke issued URLs instantly; the remaining
+window is bounded as follows.
 
-| Option | Window after pause or close | Trade-off |
+| Event | New access blocked | What can remain accessible, and for how long |
 | --- | --- | --- |
-| Keep 1 hour | Up to 1 hour | Simplest. Longest window |
-| **Recommended: 10 minutes** | Up to 10 minutes | Same code, one constant. Pages already sign fresh links on every load (offer pages are not cached), so normal browsing is unaffected. A tab left open for more than 10 minutes may show broken images for photos it had not yet loaded; the gallery handles a failed image by asking the server for fresh links once, which fails cleanly ("not available") if the offer is no longer active |
-| Serve every photo through BATR's own server, checking access on each request | None | Access ends instantly, but every image goes through the web server: more code, slower images, higher hosting cost. Not justified while the photos were public anyway |
-
-The simplest secure approach for BATR is the **10-minute** link. It
-narrows the window sixfold with no new component. Until the owner
-chooses, the specification keeps 1 hour; the value is a single
-setting in `packages/shared`, and the tests use it rather than a fixed
-number.
+| Offer paused or closed | At commit: no new link for anyone but the owner | Links issued earlier, until they expire: at most 10 minutes after the pause or close |
+| Photo removed, or draft deleted | At commit: the photo rows are gone, so no new link can be issued to anyone, the owner included | Links issued earlier, until they expire or the file is deleted, whichever is first: at most 10 minutes after the commit, **even if storage deletion fails** (a link cannot outlive its expiry) |
+| Storage deletion fails | Nothing changes for access (already blocked at commit) | The file stays in the bucket, unreachable by any member or visitor, until the cleanup job deletes it. It is reachable only with the server-only service key |
+
+- In the normal case the API deletes the files right after the commit,
+  in the same request, which ends access at once even for links
+  already issued.
+- Copies already on a viewer's device (browser cache, an open page, a
+  saved or screenshotted image) cannot be revoked by any approach.
+- Instant revocation of issued links would need every image served
+  through BATR's own server with a check per request. Not adopted:
+  more code, slower images, higher hosting cost, for photos that were
+  visible to these viewers anyway. The bounded 10-minute window is the
+  documented guarantee.
+
+### Caching
+
+Cache headers control how long a browser or intermediary may **reuse**
+a copy without asking again. They do not revoke anything and do not
+remove an image already displayed. The policy is chosen to avoid
+extending the window above, not to provide revocation:
+
+- **Photo files:** stored with `cache-control: max-age=600` (no longer
+  than the link lifetime). A signed URL is unique per signing, so a
+  cached copy is reused only for the same link, and only by a browser
+  that already downloaded it. Whether the hosted Supabase CDN caches
+  signed responses, and how deletion purges it, is checked at the
+  deployment milestone; local development has no CDN. No guarantee in
+  this spec relies on caches being cleared.
+- **Pages and API responses that include photo links or non-active
+  offers:** `Cache-Control: private, no-store`, so neither the browser
+  nor a shared cache keeps a page that would reissue an old link or
+  show a paused offer. Public marketplace and offer pages are rendered
+  per request and are not shared-cached.
 
 ### Cleanup
 
-- Deleting a draft runs one database transaction that deletes the
-  offer and photo rows, writes the audit event, and adds every storage
-  path to a `storage_cleanup_queue` table.
-- After the transaction commits, the API deletes those files and
-  removes them from the queue. If deleting a file fails, it stays in
-  the queue.
-- The same queue is used when a photo is removed from an offer and
-  when an upload succeeds in storage but its database step fails.
+- Deleting a draft runs one database transaction that: locks the
+  offer; checks status `draft` and `expected_revision`; writes the
+  audit event (which survives the deletion, see Data); adds every
+  storage path to `storage_cleanup_queue`; deletes the photo rows and
+  the offer row.
+- Removing a photo works the same way for that photo's two paths, and
+  renumbers the remaining photos (see Photo order).
+- After the transaction commits, the API deletes the queued files
+  with the server-only key and removes them from the queue. If a
+  deletion fails, the entry stays in the queue with the error and an
+  attempt count.
+- The same queue receives the files of an upload whose database step
+  fails, and of an idempotent upload retry that was already completed.
 - A cleanup job (`/api/internal/storage-cleanup`, protected by
   `CRON_SECRET`, also runnable as `pnpm cleanup:storage`) retries the
   queue and deletes **orphaned files**: files in the bucket with no
   photo row, older than 24 hours. It also deletes expired idempotency
   keys. In development and CI it is run by the tests; scheduling it on
-  a host is part of the later deployment decision.
+  a host is part of the later deployment decision. Until it runs, a
+  failed deletion leaves a file stored but unreachable (see Deletion
+  and revocation).
 
 ## Idempotency
 
@@ -263,21 +307,30 @@
   back, the key row disappears and a retry executes normally. The
   state change, its single audit event and the key row commit
   together or not at all.
-- **Without the same key:** a second attempt at the same transition
-  is stopped by the row lock and `expected_status` check (`409`), so
-  duplicate transitions and audit events are impossible either way.
+- **Without the same key:** a second attempt at the same change is
+  stopped by the row lock and the `expected_revision` and
+  `expected_status` checks (`409`), so duplicate transitions, edits and
+  audit events are impossible either way.
+- **Order of checks:** the key is looked up first. A completed key
+  returns its stored response even if the offer has changed since, so
+  a retry never turns into a `409`.
 - Uploads: the key is checked before processing; storage files are
   written under the new `photo_id`; if the database step finds the key
   already completed, the new files go to the cleanup queue and the
   stored response is returned.
-- Keys expire after 24 hours and are deleted by the cleanup job.
+- Keys expire 24 hours after creation and are then deleted by the
+  cleanup job. A key reused after expiry is treated as a new request;
+  the revision check still prevents it from applying a change twice.
+- This section is the single definition; `state-model.md` §1 refers
+  to it.
 
 ## Concurrency: edits, photos and transitions
 
 An edit or photo change must never race with publish, pause, resume
-or close and leave an offer in an invalid state. Publish eligibility
-and the expected status are checked **atomically in the database**,
-not only in the API:
+or close and leave an offer in an invalid state, and two edits must
+never silently overwrite each other. Publish eligibility, the expected
+status and the expected revision are checked **atomically in the
+database**, not only in the API:
 
 1. **One write path.** Members have read access only (through RLS) to
    `offers` and `offer_photos`; they cannot insert, update or delete
@@ -291,9 +344,16 @@
    offer run one after another; two can never interleave.
 3. **Check after the lock.** After the lock is taken, the function
    reads the current status and photos and checks:
-   - `expected_status` (sent with **every** mutation, edits and photo
-     changes included): if the offer has changed state since the page
-     loaded, `409 CONFLICT` with the current status, nothing changed;
+   - `expected_revision` (sent with **every** mutation on an existing
+     offer): the offer has a `revision` number that increases by one on
+     every successful write to the offer or its photos (any field,
+     material or not, photo add, remove, reorder, alt text, every
+     transition). If the client's number is not the current one,
+     `409 CONFLICT` with `reason: stale_revision`, the current
+     revision and the current offer; nothing changed;
+   - `expected_status` (also sent with every mutation): if the offer
+     has changed state, `409 CONFLICT` with `reason: status_changed`
+     and the current status; nothing changed;
    - the action is allowed in that status (for example, no edits or
      photo changes on a closed offer);
    - after applying the change, an `active` or `paused` offer (and a
@@ -304,8 +364,15 @@
    would leave an `active` or `paused` offer failing a publish rule or
    with a status change outside the transition table. These hold even
    if a function has a bug.
-5. **Uploads.** Image processing happens before the database step and
-   holds no lock. The database step then locks the offer and runs the
+5. **Stale edits are rejected, never merged.** The page keeps the
+   member's unsaved input and shows "This offer was changed in another
+   window or device. Review the latest version, then save again." with
+   the latest values loaded. No field-by-field merge, no last-write-wins.
+   `content_version` is unchanged in meaning: it still counts material
+   changes only and is not used for conflict detection.
+6. **Uploads.** Image processing happens before the database step and
+   holds no lock. The upload request carries `expected_revision` and
+   `expected_status` as read when the upload started. The database step then locks the offer and runs the
    checks above; if the offer was closed or the photo limit reached in
    the meantime, it returns `409`/`422` and the processed files go to
    the cleanup queue.
@@ -320,16 +387,37 @@
 | Edit while pause or close runs | The edit gets `409` with the new status; the owner reloads and retries if still allowed |
 | Upload completes after close | `409`; files queued for cleanup; no photo row added |
 | Pause and close at the same moment | One succeeds; the other gets `409`. One audit event per successful transition |
+| Two edits from two windows, same status (material or not) | The first saves and increases `revision`; the second gets `409 stale_revision` and nothing changes |
+| Two reorders at the same moment | The first applies; the second gets `409 stale_revision` |
+| Reorder while a photo is added or removed | Whichever locks first applies; the other gets `409 stale_revision`. Positions stay 1…n with no gaps or duplicates |
+| Alt-text edit while the title is edited | The second gets `409 stale_revision` |
+
+### Photo order
+
+- Positions are always 1…n (n ≤ 8), contiguous, unique per offer.
+- `unique (offer_id, position)` is a **deferrable** constraint,
+  checked at commit, so positions can be swapped inside one
+  transaction without passing through a duplicate.
+- Reorder sends the complete ordered list of the offer's photo ids
+  plus `expected_revision`. Under the offer lock, the function checks
+  the list is exactly the current set of photo ids (same ids, no
+  missing or extra; otherwise `409 stale_revision`), then sets every
+  position in **one statement** from the list, increments `revision`,
+  and writes no `content_version` change (photo order is discovery
+  metadata).
+- Adding a photo takes position n + 1 under the lock (refused at 8).
+  Removing a photo renumbers the rest to 1…n − 1 in the same
+  transaction.
 
 ## Data
 
 | Table | Columns and constraints |
 | --- | --- |
 | `profiles` | id (= auth user id), display_name (2–40), created_at |
-| `offers` | id, owner_id, title, description, category, condition, offering_text, wants_text, status (`draft`/`active`/`paused`/`closed`), content_version (≥ 1), created_at, updated_at, published_at, closed_at. Members: read only (RLS); writes through functions only. Commit-time triggers reject status changes not in the transition table and `active`/`paused` offers that fail publish rules (including photo count) |
-| `offer_photos` | id, offer_id, display_path, thumb_path, position, width, height, alt_text, created_at; unique (offer_id, position); at most 8 per offer |
-| `audit_events` | id, actor_id, entity_type, entity_id, action, from_state, to_state, content_version, created_at; insert-only for members, via functions |
-| `idempotency_keys` | as above |
+| `offers` | id, owner_id, title, description, category, condition, offering_text, wants_text, status (`draft`/`active`/`paused`/`closed`), content_version (≥ 1, material changes only), revision (≥ 1, every write), created_at, updated_at, published_at, closed_at. Members: read only (RLS); writes through functions only. Commit-time triggers reject status changes not in the transition table and `active`/`paused` offers that fail publish rules (including photo count) |
+| `offer_photos` | id, offer_id (cascade on offer delete), display_path, thumb_path, position (1–8), width, height, alt_text, created_at; unique (offer_id, position) DEFERRABLE INITIALLY DEFERRED; unique display_path and thumb_path; at most 8 per offer. Members: read only (RLS) |
+| `audit_events` | id, actor_id, entity_type, entity_id, action, from_state, to_state, content_version, revision, created_at. `entity_id` has **no foreign key**, so a draft's `delete` event (from `draft`, to none) remains after the offer row is gone. No offer content is copied into it. Written only by the functions; members cannot insert, update or delete; members can read events where they are the actor |
+| `idempotency_keys` | actor_id, key, endpoint, resource_id, request_hash, response_status, response_body, created_at, expires_at; primary key (actor_id, key); functions only (see Idempotency) |
 | `storage_cleanup_queue` | id, path, reason, attempts, last_error, created_at |
 
 Categories (DEFAULT, D7): Electronics; Clothing and accessories; Home
@@ -340,8 +428,8 @@
 
 All mutations: signed in, `Idempotency-Key` required, executed by a
 database function in one transaction that locks the offer first.
-Every mutation on an existing offer (edits and photo changes included)
-carries `expected_status`.
+Every mutation on an existing offer (edits, photo changes and
+transitions) carries `expected_revision` and `expected_status`.
 
 | Method and path | Who | Purpose |
 | --- | --- | --- |
@@ -349,7 +437,7 @@
 | `PATCH /api/v1/offers/:id` | owner | Edit fields (rules depend on state) |
 | `POST /api/v1/offers/:id/photos` | owner | Upload one photo |
 | `DELETE /api/v1/offers/:id/photos/:photoId` | owner | Remove a photo (refused if an active or paused offer would have none) |
-| `PUT /api/v1/offers/:id/photos/order` | owner | Reorder photos |
+| `PUT /api/v1/offers/:id/photos/order` | owner | Reorder photos (complete ordered id list) |
 | `POST /api/v1/offers/:id/publish` | owner | `draft → active` |
 | `POST /api/v1/offers/:id/pause` | owner | `active → paused` |
 | `POST /api/v1/offers/:id/resume` | owner | `paused → active` |
@@ -357,7 +445,8 @@
 | `DELETE /api/v1/offers/:id` | owner | Delete a draft |
 | `GET /api/v1/me/offers?status=` | member | Own offers in any state |
 | `GET /api/v1/offers?category=&cursor=` | anyone | Active offers, newest first, 20 per page |
-| `GET /api/v1/offers/:id` | anyone for active; owner otherwise; others 404 | Offer detail |
+| `GET /api/v1/offers/:id` | anyone for active; owner otherwise; others 404 | Offer detail, including `revision` |
+| `GET /api/v1/offers/:id/photo-urls` | same as detail | Fresh 10-minute signed URLs (refresh) |
 
 Responses: `{ data }` or `{ error: { code, message, fields?,
 current_status? } }`.
@@ -387,7 +476,8 @@
 | Write to someone else's offer | 403 `FORBIDDEN` if active, else 404 | "You can't change this offer" / not-available page |
 | Read a non-active offer, not owner | 404 `NOT_FOUND` | "This offer isn't available"; state never revealed |
 | Invalid fields, or an edit that would make an active/paused offer unpublishable | 422 `VALIDATION_FAILED` + `fields` | Inline errors; focus on the first; nothing saved |
-| State changed since the page loaded, or transition not allowed | 409 `CONFLICT` + `current_status` | Message; status refreshed |
+| State changed since the page loaded, or transition not allowed | 409 `CONFLICT`, `reason: status_changed` + `current_status` | Message; status refreshed |
+| Offer changed since the page loaded (another window or device) | 409 `CONFLICT`, `reason: stale_revision` + current revision and offer | "This offer was changed in another window or device…"; unsaved input kept; latest values shown |
 | Missing idempotency key | 400 `IDEMPOTENCY_KEY_REQUIRED` | Generic error (should not happen from the app) |
 | Key reused with a different request | 422 `IDEMPOTENCY_KEY_REUSED` | Generic retry message |
 | Photo too large or wrong type | 422 | Tile-level error naming the accepted formats; other photos unaffected |
@@ -420,13 +510,16 @@
 | --- | --- |
 | Shared rules (Vitest) | Every allowed transition; for each action a rejected state and a rejected actor; validation; field classification completeness; one version bump per edit; status labels. 100% branch coverage on transitions and permissions |
 | Database security (Vitest, real RLS) | Members A and B and a signed-out client: B cannot select, update or delete A's draft, paused or closed offers or their photo rows; signed-out sees only active offers; nobody can write `audit_events`, `idempotency_keys` or `storage_cleanup_queue` directly; A cannot insert, update or delete `offers` or `offer_photos` directly with A's own token; illegal status changes and unpublishable active offers are rejected by the commit-time triggers even when written directly as the database owner |
-| Storage security (Vitest, real policies) | B cannot upload into A's folder, overwrite or delete A's files, or create a signed URL for A's draft photos; signed-out can sign URLs only for active offers' photos; signed URLs stop working after expiry (tested with a short expiry); after pause or close, non-owners can no longer obtain a new link, while a link issued earlier works until it expires (documented behaviour, asserted so it cannot change silently) |
+| Storage security (Vitest, real policies) | B cannot upload into A's folder, overwrite or delete A's files, or create a signed URL for A's draft photos; A cannot overwrite or delete A's own files directly, cannot upload under another member's folder, under a closed offer, or a non-WebP or oversized file; a file A uploads directly without a photo row cannot be signed by anyone; the API's upload uses A's session (an upload attempted for an offer A doesn't own is refused by storage itself, not only by the API); signed-out can sign URLs only for active offers' photos; signed URLs stop working after expiry (tested with a short expiry); after pause or close, non-owners can no longer obtain a new link, while a link issued earlier works until it expires (documented behaviour, asserted so it cannot change silently) |
 | Transition parity | Database transition table equals the shared one |
 | Atomicity (fault injection) | A forced failure after the state update leaves state, audit, idempotency and queue rows unchanged |
 | Idempotency and concurrency | Parallel publishes → one transition, one audit row; same key → same response, no second audit; same key different body or endpoint → 422; missing key → 400; stale `expected_status` → 409; two members using the same key are independent |
 | Edit and transition races | Each race in the Concurrency table, run with one connection holding the offer lock while the second request waits; after both finish, the offer satisfies every rule for its status and the audit count matches the successful transitions |
 | Photos | Metadata (including GPS) is absent from stored files; display and thumbnail sizes; renamed PDF and 12 MB image rejected; a file with a HEIC signature is rejected by the browser check and, with the browser check bypassed, by the API (`422 UNSUPPORTED_FORMAT`) |
-| Cleanup | Deleting a draft removes its files; a simulated storage failure leaves paths queued and the job removes them; orphaned files older than 24 hours are removed, newer ones are kept |
+| Deletion, revocation and cleanup | Deleting a draft or removing a photo removes its files and ends access to links issued earlier. **Storage failure:** the server's deleter is pointed at an unreachable storage address (a test-only setting refused in production builds); then the rows are gone, the audit event exists, the paths are queued with the error, nobody (owner included) can obtain a new link, a link issued just before (test lifetime of a few seconds) stops working at expiry although the file still exists, and the cleanup job later deletes the files and empties the queue. Orphaned files older than 24 hours are removed, newer ones kept |
+| Caching | Photo files carry `max-age` no longer than the link lifetime; responses containing photo links or non-active offers carry `private, no-store` |
+| Revisions and ordering | Every kind of write increases `revision` by exactly one; a stale `expected_revision` on edit, alt text, category, reorder, photo add or remove, and each transition returns 409 and changes nothing; reordering swaps positions without a constraint error; a reorder list with a missing, extra or foreign id is refused; positions stay 1…n after add and remove |
+| Draft-delete audit | After a draft is deleted, its `delete` audit event remains, with no offer content in it |
 | API integration | Every endpoint: success, 401, 403/404, 422, 409, 400/422 for keys |
 | End to end (Playwright, Chromium and WebKit) | Main journey below; validation errors; paused and closed offers disappear; B cannot open A's draft URL |
 | Accessibility (axe) | Sign-up, create offer, My offers, marketplace, offer detail |
@@ -443,7 +536,7 @@
 written**. Where a later clarification makes one stricter, the
 addition is shown underneath as "Also:" so it can be checked against
 the original. No original requirement is removed or weakened.
-Criteria 19–30 were added by the clarifications.
+Criteria 19–35 were added by the clarifications.
 
 1. From a clean clone, `pnpm install` then `pnpm lint`, `pnpm
    typecheck`, `pnpm test` and `pnpm build` all pass; CI runs the
@@ -519,10 +612,11 @@
 22. Idempotency follows the rules above: required key, member and
     endpoint scope, body mismatch 422, stored response on retry.
 23. Draft photos can be read and signed only by their owner; active
-    offers' photos only through signed URLs that expire after the D5
-    lifetime; the bucket is private. After pause or close, no new
+    offers' photos only through signed URLs that expire after 10
+    minutes (D5); the bucket is private. After pause or close, no new
     link is issued to non-owners; links issued earlier last until
-    they expire, as documented.
+    they expire, as documented. A refresh endpoint issues new links
+    while the viewer may still read the offer.
 24. Stored photos contain no metadata (no GPS); only processed WebP
     files are kept.
 25. Orphaned photo files older than 24 hours and expired idempotency
@@ -533,13 +627,32 @@
     discovery metadata in one shared table, and a test enforces it.
 28. No secret is committed; CI fails on a committed key.
 29. Every offer write locks the offer row and checks
-    `expected_status` and publish eligibility inside the same
-    database transaction; members cannot write offer or photo rows
+    `expected_revision`, `expected_status` and publish eligibility
+    inside the same database transaction; members cannot write offer or photo rows
     directly; each race in the Concurrency table is tested and never
     leaves an offer in an invalid state.
 30. A HEIC file is rejected with the unsupported-format message, in
     the browser and by the API, and never stored; the real-iPhone
     test in unit 07 is run and its result recorded in the tracker.
+31. Two writes based on the same revision never both apply: the
+    second, whether a material edit, a non-material edit, a photo
+    change or a reorder, gets 409 `stale_revision`, changes nothing,
+    and the form keeps the member's unsaved input.
+32. Reordering is atomic: positions remain 1…n and unique at every
+    commit, two simultaneous reorders cannot interleave, and the
+    unique (offer_id, position) constraint never fails on a valid
+    reorder.
+33. Processed photos are written to storage with the owner's own
+    session under the storage policies; members cannot overwrite or
+    delete storage files directly, and a file without a photo row
+    cannot be read or signed by anyone.
+34. After a photo is removed or a draft is deleted, nobody can obtain
+    a new link from that moment, and no link works more than 10
+    minutes after it, even when storage deletion fails; the failed
+    files are queued and later deleted by the cleanup job (tested
+    with a real storage failure path).
+35. A draft's `delete` audit event remains after the offer row is
+    deleted.
 
 ## Dependencies introduced in this milestone
 
@@ -563,10 +676,8 @@
 4. Leave GitHub Actions enabled (the default for new repositories).
 5. Optionally, under the repository's Settings → Branches, protect
    `main` so changes arrive only by pull request.
-6. Answer D5 (photo link lifetime: recommended 10 minutes). D6 and
-   D7 keep their defaults unless you say otherwise. D9 (how the
-   iPhone test reaches the app) is needed only by unit 07.
+6. Decisions D5–D9 are made. Nothing else is needed before unit 01.
 
 No Supabase account, hosting account, API key or email service is
-needed before unit 01. The only possible exception is D9 option A,
-at unit 07.
+needed before unit 01. Accounts for a preview deployment are needed
+only if the temporary private link (D9) does not work at unit 07.
```

```diff
--- state-model.md (before)
+++ state-model.md (after)
@@ -12,11 +12,17 @@
 | --- | --- |
 | §1 Transaction and idempotency rules | Applies to all entities. Offer parts are in Milestone 1 |
 | §2 Offer | **APPROVED in principle (owner, 2026-10-15)** for Milestone 1, including the clarifications added in this revision |
-| §3 Terms and snapshots | PENDING APPROVAL (Milestone 3) |
-| §4 How offer changes affect proposals and agreements | PENDING APPROVAL (Milestones 3–4) |
+| §3 Terms and snapshots | **PENDING APPROVAL. Not implemented in Milestone 1** (Milestone 3) |
+| §4 How offer changes affect proposals and agreements | **PENDING APPROVAL. Not implemented in Milestone 1** (Milestones 3–4) |
 | §5 Proposal | **PENDING APPROVAL. Must not be implemented until the owner explicitly approves it** |
 | §6 Agreement | **PENDING APPROVAL. Must not be implemented until the owner explicitly approves it** |
-| §8 Decisions needing the owner | Open |
+| §8 Decisions needing the owner | D5–D9 decided for Milestone 1; D1–D4 open (needed by Milestones 3–4) |
+
+**Milestone 1 boundary.** Milestone 1 creates no proposal, revision,
+agreement, version, handover or cancellation tables, functions,
+transitions, endpoints or UI, and no automatic handling of proposals
+when an offer changes (D1–D3). Only §1 (as it applies to offers) and
+§2 are implemented.
 
 Items marked **DEFAULT** are placeholders for a decision the owner has
 not made; each one is listed in §8. Clarifications in this revision
@@ -30,8 +36,10 @@
 1. locks the entity row (`SELECT … FOR UPDATE`);
 2. re-checks the actor's permission and that the current state allows
    the action;
-3. writes the new state and any dependent rows;
-4. inserts exactly one `audit_events` row;
+3. writes the new state and any dependent rows, and increases the
+   entity's `revision` by one;
+4. inserts exactly one `audit_events` row (it has no foreign key to
+   the entity, so it survives the entity's deletion);
 5. records the idempotency key (below);
 6. commits.
 
@@ -49,22 +57,45 @@
 data in `packages/shared` (used for UI and early validation) and in
 the database function. A test asserts both tables are identical.
 
-**Optimistic check.** Every transition request, and every edit or
-photo change, carries the state the client last saw (`expected_status`). If the row is no longer in that
-state, the transition returns `409 CONFLICT` with the current state,
-and the UI refreshes.
-
-**Idempotency.** Every mutation accepts an `Idempotency-Key` header.
-- Keys are stored in `idempotency_keys` (actor_id, key, request_hash,
-  response_status, response_body, created_at), unique per
-  (actor_id, key), inside the same transaction as the change.
-- Same key and same request: the stored response is returned; nothing
-  is executed again and no extra audit row is written.
-- Same key, different request: `422 IDEMPOTENCY_KEY_REUSED`.
-- Keys expire after 24 hours.
-- A repeated request **without** a key is treated as new; if the
-  entity has already moved, it gets `409 CONFLICT`, never a second
-  transition.
+**Optimistic check.** Every mutation on an existing entity carries
+two values the client last saw:
+- `expected_revision`: the entity's `revision`, which increases by one
+  on **every** successful write (material edits, non-material edits,
+  photo add, remove and reorder, alt text, every transition). If it
+  does not match, `409 CONFLICT` with `reason: stale_revision`;
+  nothing changes. This stops two edits made in the same state from
+  silently overwriting each other. Stale edits are rejected, never
+  merged.
+- `expected_status`: if the state has changed, `409 CONFLICT` with
+  `reason: status_changed`.
+
+`content_version` keeps its separate meaning (material changes only)
+and is not used for conflict detection.
+
+**Idempotency.** Defined in full in `milestone-1.md` (Idempotency);
+this is a summary, and that section wins if they differ.
+- Every mutation **requires** an `Idempotency-Key`; missing →
+  `400 IDEMPOTENCY_KEY_REQUIRED`.
+- Stored in `idempotency_keys` (actor_id, key, endpoint, resource_id,
+  request_hash, response_status, response_body, created_at,
+  expires_at), primary key (actor_id, key), in the same transaction
+  as the change. Members cannot read or write the table directly.
+- Scope: one member; one endpoint and resource. Same key on a
+  different endpoint or resource, or with a different request hash
+  (SHA-256 of the canonical body, or of the file bytes and fields for
+  uploads) → `422 IDEMPOTENCY_KEY_REUSED`.
+- Same key, same request, completed → the stored response, with no
+  re-execution and no extra audit row. The key is checked before the
+  revision, so a retry never becomes a `409`.
+- Concurrent retries: the second request waits on the first's key
+  row; it gets the stored response if the first commits, or executes
+  normally if the first rolls back.
+- Keys expire 24 hours after creation and are deleted by the cleanup
+  job. A key reused after expiry is a new request; `expected_revision`
+  prevents a double change.
+- A repeated request **without** the same key is a new request and is
+  stopped by `expected_revision`/`expected_status` (`409`), never a
+  second change.
 
 **Database constraints** back these rules: status columns are
 constrained to the listed values; a trigger rejects any status change
@@ -78,13 +109,13 @@
 | Action | From | To | Who | Conditions |
 | --- | --- | --- | --- | --- |
 | create | — | `draft` | any signed-in member | Draft field rules |
-| edit | `draft` | `draft` | owner | Draft field rules |
-| edit | `active`, `paused` | unchanged | owner | The offer must still meet every publish rule after the edit, otherwise the edit is rejected (`422`) and nothing changes |
+| edit (any field, photos, order, alt text) | `draft` | `draft` | owner | Draft field rules; `expected_revision` matches |
+| edit (any field, photos, order, alt text) | `active`, `paused` | unchanged | owner | `expected_revision` matches, and the offer must still meet every publish rule after the edit; otherwise `409` or `422` and nothing changes |
 | publish | `draft` | `active` | owner | All publish rules pass |
 | pause | `active` | `paused` | owner | — |
 | resume | `paused` | `active` | owner | All publish rules still pass |
 | close | `active`, `paused` | `closed` | owner | Explicit confirmation in the UI |
-| delete | `draft` | (removed) | owner | Drafts only; photos removed from storage in the same request; audit row kept |
+| delete | `draft` | (removed) | owner | Drafts only; `expected_revision` matches. Offer and photo rows deleted and photo paths queued for storage deletion in one transaction; the `delete` audit event remains. Access guarantee below |
 
 No other transitions exist. In particular, `closed` cannot be
 reopened, and `active`/`paused` offers cannot return to `draft`.
@@ -103,7 +134,8 @@
 - **Discovery metadata:** category, photo order, photo alt text.
   These help people find and view the offer; they do not change what
   is offered.
-- Only material changes affect `content_version`. Preference and
+- Every change in any group increases `revision` (conflict
+  detection, §1). Only material changes affect `content_version`. Preference and
   discovery changes are saved and audited but never count as a
   material change (later, they will not affect proposal snapshots;
   see §4, pending).
@@ -125,7 +157,7 @@
 
 ### Privacy of non-active offers
 
-- Anyone may read an `active` offer (DEFAULT D6: signed-out visitors
+- Anyone may read an `active` offer (D6: signed-out visitors
   included). `draft`, `paused` and `closed` offers are readable only
   by their owner.
 - To anyone else, a non-active offer does not exist: the API returns
@@ -134,20 +166,32 @@
 - The marketplace query filters on `status = 'active'` in the
   database; row-level security enforces the same rule, so even a bug
   in the API cannot return other states.
-- Photos live in a **private** storage bucket with storage policies:
-  only the owner can upload to or delete from their own offer's
-  folder, and only viewers allowed to read the offer can read its
-  photos. Photos are served through **signed URLs** that expire after
-  the D5 lifetime (1 hour unless the owner picks the recommended
-  10 minutes), created with the viewer's own session (never the
-  service key), so a non-owner cannot get a new link to a draft,
-  paused or closed offer's photos. A link issued while the offer was
-  active keeps working until it expires; it cannot be withdrawn.
-- Deleting a draft removes its photo files. Files whose deletion fails
-  are queued and removed by a cleanup job (see `milestone-1.md`).
-- Public offer pages and marketplace pages are rendered without
-  shared caching (`no-store`) or are revalidated on every state change,
-  so a paused or closed offer does not linger in a cache.
+- Photos live in a **private** storage bucket. Processed files are
+  written by the server **with the owner's own session**, so storage
+  policies apply to the write. Members can insert only into their own
+  offer's folder (draft, active or paused) and can never overwrite or
+  delete files directly; deletion is done by the server from the
+  cleanup queue. A file can be read or signed only when a photo row
+  exists for it and the viewer may read the offer.
+- Photos are served through **signed URLs that expire after 10
+  minutes** (D5, decided), created with the viewer's own session
+  (never the service key), with a refresh endpoint for open pages.
+- **Exact access guarantee** (details in `milestone-1.md`, Deletion
+  and revocation):
+  - Pause or close: from commit, no new link for anyone but the
+    owner. Links issued earlier work until they expire (≤ 10 minutes).
+  - Photo removal or draft deletion: from commit, no new link for
+    anyone, the owner included. Links issued earlier work until they
+    expire or the file is deleted, whichever is first: never more than
+    10 minutes after the commit, even if storage deletion fails.
+  - If storage deletion fails, the file stays stored but unreachable
+    by members and visitors until the cleanup job deletes it.
+  - Issued links are not revoked instantly, and copies already on a
+    viewer's device cannot be revoked.
+- Caching does not revoke anything. Photo files carry a cache
+  lifetime no longer than the link lifetime; pages and API responses
+  that include photo links or non-active offers are `private,
+  no-store`, and nothing relies on a cache being cleared.
 - Owner-only pages (drafts, My offers) are never cached.
 - Status badges for `draft`, `paused`, `closed` appear only on
   owner-only pages.
@@ -270,7 +314,7 @@
 
 | Data | Who can read |
 | --- | --- |
-| `active` offer | everyone (DEFAULT D6) |
+| `active` offer | everyone (D6) |
 | `draft`, `paused`, `closed` offer | owner only; others get 404 |
 | Proposal and its revisions | the proposer and the offer owner |
 | Agreement, versions, confirmations | its two parties |
@@ -284,11 +328,11 @@
 | D2 | When an offer is closed, what happens to its open proposals? Auto-decline them, or keep them open but unacceptable until they are withdrawn? | Auto-decline with a system note | Milestone 3 |
 | D3 | When an offer is paused, can open proposals on it still be accepted? | Yes | Milestone 3 |
 | D4 | Amendments only before any handover is confirmed, and confirmations cannot be undone? | Yes to both | Milestone 4 |
-| D5 | How long a photo link lasts. A link already issued cannot be withdrawn: it keeps working until expiry even if the offer is paused or closed (deleting a photo or draft ends access at once) | 1 hour in the spec; **recommended: 10 minutes** (same code, smaller window). See `milestone-1.md`, Storage and access | Milestone 1 |
-| D6 | Can signed-out visitors browse active offers? | Yes | Milestone 1 |
-| D7 | Category and condition lists | See `milestone-1.md` | Milestone 1 |
+| D5 | How long a photo link lasts | **DECIDED 2026-10-15: 10 minutes, with refresh.** Issued links are not revoked; the bounded window is documented in §2 | Milestone 1 |
+| D6 | Can signed-out visitors browse active offers? | **DECIDED 2026-10-15: yes** (default kept) | Milestone 1 |
+| D7 | Category and condition lists | **DECIDED 2026-10-15: defaults kept** (see `milestone-1.md`) | Milestone 1 |
 | D8 | iPhone photos (HEIC) | **DECIDED 2026-10-15: option A**, JPEG, PNG and WebP only. iPhone conversion to JPEG is an assumption verified on a real iPhone in unit 07; HEIC that arrives anyway gets a clear error. Options B (server conversion) and C (browser conversion) stay available for later | Milestone 1 |
-| D9 | How a real iPhone reaches the app for the unit 07 test | A: temporary private link from the development environment, if its network allows; else B: preview deployment with owner-created free accounts | Milestone 1, unit 07 |
+| D9 | How a real iPhone reaches the app for the unit 07 test | **DECIDED 2026-10-15:** try a temporary private link first; fall back to a preview deployment with owner-created free accounts | Milestone 1, unit 07 |
 
 ## 9. Acceptance criteria for this model
 
@@ -301,12 +345,22 @@
 - [ ] Fault-injection tests prove that when the audit insert (or any
       later step) fails, the state is unchanged and no audit or
       idempotency row exists.
-- [ ] Idempotency tests: same key returns the same response once
-      executed; same key with a different body returns 422; no key and
-      a stale state returns 409.
+- [ ] Idempotency tests: a missing key returns 400; same key returns
+      the same response once executed; same key with a different
+      body, endpoint or resource returns 422; two members' identical
+      keys are independent; a concurrent retry with the same key waits
+      and returns the stored response; a repeat without the same key
+      and a stale revision or state returns 409.
 - [ ] Concurrency test: two simultaneous publish calls produce one
       transition and one audit row.
 - [ ] Every UI status label comes from the shared status-label
       function, and the label set equals the table in `ui-context.md`.
+- [ ] Stale-revision tests: two writes based on the same revision
+      (material edit, non-material edit, alt text, reorder, photo add
+      or remove, transition) never both apply; the second gets `409`
+      and nothing changes.
+- [ ] Draft deletion leaves its `delete` audit event in place.
+- [ ] Photo access follows the exact guarantee in §2, including when
+      storage deletion fails.
 - [ ] Proposal and agreement tests are written only when §5–6 are
       approved.
```
