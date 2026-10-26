# Feature Spec: Offer Creation and Management

Priority flow 1. Web in Milestone 1 (`milestone-1.md`, which is
authoritative for that milestone); mobile in Milestone 2.
Offer states and material fields: `state-model.md` §1.

## Goal

A signed-in member creates an offer (photos, what they offer, what
they want), previews it, and publishes it so others can discover it
and propose an exchange. The owner can later edit, pause, resume or
close it.

## User Journey

1. Member taps **Create offer** (web navbar button; mobile center tab).
2. **Photos:** adds 1–8 photos (camera or library on mobile, file
   picker or drag-and-drop on web). First photo is the cover; order
   can be changed.
3. **Details:** title, description, category, condition.
4. **Exchange terms:** "What I'm offering" (prefilled from the title,
   editable) and "What I'd like in return" (free text; may say
   "Open to offers").
5. **Preview:** sees the offer exactly as others will
   (`OfferCard.grid` and detail layout).
6. **Publish:** offer becomes `active`; success screen with **View
   offer** and **Share**.
7. Leaving at any step keeps a **draft** that appears in My offers.
8. **Manage:** in My offers the owner can edit, pause, resume or
   close an offer.

## Design and UI States

- Web: single page with three sections and a sticky summary/preview
  column on `lg`; stepped on small screens. Mobile: three steps with
  a progress indicator and a sticky bottom bar (Back / Next).
- Condition uses `SegmentedControl` (PROPOSED values: New, Like new,
  Good, Fair). Category uses a select/sheet.
- Photo uploader: 1:1 tiles, per-tile progress, retry, remove,
  reorder. Cover badge on the first tile.

| State | What the member sees |
| --- | --- |
| Empty | Uploader prompt with illustration and guidance |
| Uploading | Per-photo progress; Next disabled until at least one photo finishes |
| Upload failed | Tile shows error and Retry; other photos unaffected |
| Validation error | Inline field errors; focus moves to the first |
| Saving draft | Subtle "Saving…" then "Draft saved" |
| Offline (mobile) | Banner; form input kept locally; publish disabled |
| Publishing | Primary button loading; form locked |
| Published | Success screen |
| Publish failed | Inline error with Publish available to retry; no toast; form unchanged (owner decision, Milestone 1) |

My offers list: `OfferCard.manage` rows grouped by status (Active,
Drafts, Paused, Closed), with visible action buttons and no overflow
menu (owner decision, Milestone 1). The open-proposal count arrives
with proposals (Milestone 3). Empty state with **Create your first
offer**.

## Data Requirements

- `offers`: id, owner_id, title, description, category,
  condition, offering_text, wants_text, status, created_at,
  updated_at, published_at, closed_at.
- `offer_photos`: id, offer_id, storage_path, position, width,
  height, alt_text (optional).
- Status machine: `draft → active`, `active ⇄ paused`,
  `active|paused → closed`, `draft → deleted` (drafts only).
- Location, quantity and estimated value are **not** included
  until open questions 4 and 2 are answered.

## Permissions

- Create: any signed-in member.
- Read draft/paused/closed: owner only. Read active: per discovery
  rules in `01-marketplace-discovery.md`.
- Edit, pause, resume, close: owner only.
- Editing an active offer does not change any existing proposal's
  revisions (they reference what was proposed, not the live offer).

## Validation (PROPOSED limits)

| Field | Rule |
| --- | --- |
| Photos | 1–8 to publish; JPEG, PNG, WebP (HEIC is refused, decision D8 option A); ≤ 10 MB each; resized server-side |
| Title | 5–80 characters, trimmed |
| Description | 0–2000 characters |
| Category | one of the approved list (open question 13) |
| Condition | one of the condition values |
| What I'm offering | 3–200 characters |
| What I'd like | 3–200 characters |

Drafts may be incomplete; publish requires every rule above.

## Failure Cases

- Photo upload interrupted → tile error, retry; publish blocked until
  resolved or removed.
- Session expires mid-form → draft kept locally, sign-in prompt,
  resume after sign-in.
- Publish of a closed or deleted offer → `CONFLICT`, UI refreshes.
- Pausing/closing an offer with open proposals → confirmation dialog
  stating how many open proposals exist. What happens to them is an
  open question (PROPOSED: they stay open; closing auto-declines
  them with a system note).
- Duplicate submit (double tap) → idempotency key prevents two
  offers.

## Acceptance Criteria

- [ ] A signed-in member can publish an offer with 1 photo and all
      required fields on web (unit 07) and mobile (unit 12; met in
      Milestone 2).
- [ ] Publishing with 0 photos, a 4-character title, or empty
      "What I'd like" is rejected with field-level errors in the UI
      and `VALIDATION_FAILED` from the API.
- [ ] A 12 MB photo or a PDF is rejected before upload with a clear
      message.
- [ ] Leaving after the photo step leaves a draft visible only to
      the owner in My offers.
- [ ] Preview matches the published detail page (same component).
- [ ] Pause hides the offer from discovery; resume restores it.
- [ ] Close is irreversible in the UI and the offer leaves discovery
      (and, once proposals exist in Milestone 3, no longer accepts
      them).
- [ ] Another member gets `FORBIDDEN` or `NOT_FOUND` when editing
      someone else's offer or reading their draft via the API.
- [ ] Every status change writes an audit event.
- [ ] Two rapid publish taps create one offer.
- [ ] Layout works at 375px and 1280px; keyboard-only completion is
      possible on web.

## Open Questions

Location (4), cash value (2), what closing does to
open proposals, and whether one member may have many active offers
for the same item.
