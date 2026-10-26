# UI Context

Every visual decision comes from this file. Use tokens, never raw
values.

Markers used in this file:
- **VERIFIED**: taken directly from the owner's brand files.
- **APPROVED**: approved by the owner (2026-10-15: overall design
  direction and the exchange-specific UI concepts).
- **PENDING APPROVAL**: exact values or rules proposed by Claude that
  the owner has not yet approved. Build with them, but do not treat
  them as final.

Logo artwork and UI tokens are separate systems. The logo files are
used as supplied and never altered to match UI colors; UI tokens are
chosen for legibility and are never presented as brand colors.

## Visual direction: the approved reference (owner, 2026-10-17, 13:25)

The owner chose a reference image as the visual direction ("the
visual direction, not a template to copy"). It overrides the
earlier PROPOSED notes and the older rules below wherever they
conflict. Built and rendered locally; visual approval stays with the
owner after reviewing the rendered screens.

- **Header:** white, sticky, with the horizontal ink logo (used as
  supplied). Links Explore, Saved, My offers; the current one is green
  with a green underline. Members also get the green **Create offer**
  pill and their initial (Account). Below `md` the links become icons
  with spoken names.
- **Headings:** Newsreader serif for `display`, `h1`, `h2` (and card
  titles at 20px, weight 500); Inter for everything else.
- **Home:** a dark green (`--bg-inverse`) rounded `--radius-xl` panel
  with the serif headline (accent words in `--accent-on-inverse`),
  intro, two pill buttons and the category chips; from `lg` a real
  offer's photo fills its right half with a white card (what is
  offered, what is wanted, owner, area). Never stock photography.
- **Offer cards:** white `--radius-xl` cards with `shadow-card`, an
  inset 4:3 photo, the category pill on the photo and the **heart and
  bookmark** in white circles at its top right; serif title, what is
  offered, owner initial and name with the general area, age, and an
  "In return" row (exchange glyph in a green circle, `--accent-soft`).
- **Offer page:** gallery with thumbnails in a column on the left from
  `lg` (below on phones), heart and bookmark on the main photo;
  category, serif title, owner row with area and age, description, the
  Offering / In return panel, Share, a "Where and how" list (Location,
  Exchange, How, Posted) with the privacy line, then the owner card.
- **Saved:** rows with thumbnail, serif title, owner and area, "In
  return" line and the heart and bookmark; the empty state is a dark
  green panel ("Nothing saved yet", **Browse offers**).
- **Auth screens:** one white card split with a dark green brand panel
  carrying the compact icon and a serif line; a short band on phones.
- **Buttons and chips:** rounded pills; primary green.
- Not taken from the reference without separate approval: prices,
  Propose exchange, Message, the notifications bell, search, the
  Goods/Services/Skills filters, the bottom tab bar, a People tab in
  Saved, stock photography and the reference's logo.

## Brand Evidence (VERIFIED from the supplied brand files)

- Mark: a capital **B** whose middle stroke forms a **handshake**.
  One hand is green, the other white. The two hands are the two
  parties of an exchange; this is the core brand idea.
- Container: rounded square tile in deep green-black ink.
- The green is a **gradient**, darker at the upper-left stroke,
  brighter on the curves and the green hand.
- **Wordmark:** "BATR" in a heavy geometric sans, set in the ink
  color, to the right of the compact icon (horizontal logo). The
  typeface is not named in the files.
- The brand usage sheet defines three forms and where each goes (see
  Brand Assets below).

## Brand Assets

All in `assets/brand/`. Every file is a JPEG render; none has
transparency or vector source.

| File | Form | Use (from the brand usage sheet unless marked PROPOSED) |
| --- | --- | --- |
| `batr-brand-usage-sheet.jpeg` | Reference | The owner's usage rules. Read before placing any logo |
| `batr-icon-full-bleed.jpeg` | Full brand icon, tile fills the frame | Splash screens, presentations, large branding areas, auth screens (PROPOSED) |
| `batr-icon-original.jpeg` | Full brand icon, earlier render | Reference only; superseded by the files above |
| `batr-icon-on-light.jpeg` | Compact icon on white corners | Web on light surfaces: favicon source, email header (PROPOSED) |
| `batr-icon-on-dark-padded.jpeg` | Compact icon with dark margin | Source for app icon and small sizes on dark surfaces |
| `batr-icon-on-dark-padded-small.jpeg` | Compact icon with wider margin | Source for Android adaptive-icon safe zone (PROPOSED) |
| `batr-logo-horizontal-light.jpeg` | Horizontal logo (icon + wordmark) on white | Web navigation and headers on light backgrounds, print, email |
| `batr-logo-horizontal-dark-bg.jpeg` | Same logo on black | **Do not use.** The ink wordmark on black is 1.3:1 contrast and nearly invisible |
| `interim/*` (except the white-text logo) | App icon, Android layers, splash, favicons, PWA icons, transparent ink horizontal logo | **Use these in code.** Format conversions of the JPEGs (crop, corner fill, background removed); the artwork itself is unchanged. See `interim/README.md`. Replace with designer exports before launch |
| `interim/logo-horizontal-white.png` | Horizontal logo with the wordmark recolored white | **PENDING APPROVAL. Do not use yet.** It alters the logo artwork, which the owner's rules forbid unless the owner confirms it as an approved reversed version |

Placement rules:
- **Full brand icon** for splash screens, onboarding, auth screens,
  presentations and large web hero areas.
- **Compact icon** for the mobile app icon, browser tab, the mobile
  header, the web navbar on dark backgrounds, and any size below
  64px. Smallest size: 24px (the sheet shows 128, 64, 48, 24). Below
  48px the handshake detail fades, so use it small only where the
  icon is already familiar (tab, favicon, nav).
- **Horizontal logo** for web navigation and headers on light
  backgrounds, emails and print. Minimum height 28px on screen
  (PROPOSED).
- Clear space around any form: at least the height of the B's top
  stroke (PROPOSED).
- Never recolor, stretch, rotate, outline, add shadows to, or redraw
  the logo, and never set "BATR" in a substitute font to imitate the
  wordmark.
- Never place the ink wordmark on a dark background. On dark
  surfaces use the compact icon alone until an approved reversed
  wordmark exists.

Production gaps (need source files before release, open question 14):
- iOS app icon: 1024×1024 PNG, full-bleed square, no transparency, no
  pre-rounded corners (iOS applies its own mask). Current files have
  corners baked in.
- Android adaptive icon: separate foreground (mark) and background
  (ink) layers.
- Favicon set (16, 32, 180 apple-touch, 192, 512) and a transparent
  PNG or SVG of the horizontal logo.

### Sampled logo colors (reference only, not UI tokens)

Approximate values sampled from the JPEGs, recorded only to explain
how UI tokens were chosen. Do not use these values in code, do not
name tokens after them, and do not call them brand colors. The
renders disagree with each other (the newer set is brighter); official
values need a vector file or a brand sheet with hex codes.

| Region | Original render | Newer renders |
| --- | --- | --- |
| Icon tile ink | `#021B18` | `#01201A` – `#032821` |
| Wordmark ink | — | `#012921` |
| Dark green (top stroke) | `#037551` | `#009E6E` |
| Mid green (lower bowl) | `#20AD6B` | `#2DCE70` |
| Light green (hand, highlights) | `#4CD27B` | `#7AFB7D` |
| White hand | `#F9F8F6` | `#FFFFFF` |

**Finding:** the bright logo greens fail contrast with white text
(2.9:1 or worse), so UI tokens use a darker green for actions on light
surfaces. That UI green is a legibility choice, not a brand color.

## Theme (direction APPROVED; details PENDING APPROVAL)

Light-first app with **dark brand framing**. Content sits on white
surfaces (clarity, like the references); the global header, auth
screens and the occasional feature band use the logo's deep ink
background so the product feels like BATR, not a generic store.
Green is reserved for action, progress and "your side" of an
exchange. Dark mode is an open question; tokens are named
semantically so it can be added without touching components.

## UI Color Tokens (values PENDING APPROVAL)

These are interface colors, separate from the logo. Contrast ratios
were computed for each pair listed.

| Role | Token | Value | Contrast note |
| --- | --- | --- | --- |
| Page background | `--bg-base` | `#F6F8F7` | |
| Surface (cards, sheets) | `--bg-surface` | `#FFFFFF` | |
| Subtle panel (summaries) | `--bg-subtle` | `#EEF2F0` | |
| Brand frame (header, auth) | `--bg-inverse` | `#021B18` | |
| Primary text | `--text-primary` | `#012921` | 15.7:1 on white |
| Secondary text | `--text-secondary` | `#4A5A56` | 7.3:1 on white |
| Muted text (meta, timestamps) | `--text-muted` | `#5B6B67` | 5.6:1 on white |
| Text on brand frame | `--text-on-inverse` | `#F9F8F6` | 16.9:1 on ink |
| Text on accent and danger fills | `--text-on-accent` | `#FFFFFF` | the "white" in the button rows below; added in unit 02 so no raw white is used in code |
| Muted text on brand frame | `--text-on-inverse-muted` | `#A8B5B1` | 8.5:1 on ink |
| Default border | `--border-default` | `#DFE5E3` | decorative only |
| Strong border (inputs) | `--border-strong` | `#8A9894` | 3.0:1, meets non-text minimum |
| Primary action | `--accent-primary` | `#037551` | white text 5.7:1 |
| Primary action hover/pressed | `--accent-primary-hover` | `#025C40` | white text 8.1:1 |
| Primary action on dark frame | `--accent-on-inverse` | `#4CD27B` | ink text 9.2:1 |
| Selected / soft accent bg | `--accent-soft` | `#E7F6EE` | `#025C40` text 7.2:1 |
| Focus ring | `--focus-ring` | `#037551` | 2px ring + 2px offset |
| Success | `--state-success` / `-soft` | `#037551` / `#E7F6EE` | |
| Warning | `--state-warning` / `-soft` | `#93370D` / `#FFFAEB` | 7.2:1 |
| Danger | `--state-danger` / `-soft` | `#B42318` / `#FEF3F2` | 6.1:1 on soft |
| Info | `--state-info` / `-soft` | `#175CD3` / `#EFF8FF` | 5.6:1 on soft |
| Your side of an exchange | `--party-self` | `#037551` on `#E7F6EE` | echoes the green hand |
| Other side of an exchange | `--party-other` | `#012921` on `#F6F8F7` | echoes the white hand |

Rules:
- No indigo, no blue primary (the references' accent is replaced by
  BATR green).
- Never convey status by color alone; every status pairs color with
  an icon and a word.

## Typography (PENDING APPROVAL; `display`, `h1` tracking and `h2` set by the owner-approved direction, 2026-10-17)

Labels are sentence case, never tracked capitals.


| Role | Font | Variable |
| --- | --- | --- |
| UI and headings | Inter (web: variable font; mobile: bundled via expo-font) | `--font-sans` |
| Numbers in terms, dates | Inter with tabular figures | `--font-sans` + `tnum` |
| Display, page and section titles (owner, 2026-10-17: reference direction) | Newsreader, regular 400; card titles 500 (web: `next/font/google`, self-hosted at build) | `--font-display` |

**Approved with the reference direction (owner, 2026-10-17):**
`display`, `h1` and `h2` use the Newsreader serif at weight 400, with
Inter kept for everything else. The serif gives BATR an editorial
character that Inter headings alone did not have. Proposed steps:
`display` 44/46 (phones) and `display-lg` 68/68, `h1` 34/40, `h2`
28/34, `h2-lg` 40/44 (page titles from `md`). The table below stays
the approved set until the owner decides; mobile (Expo) would bundle
the same font.

The references use a clean geometric grotesk; Inter matches that
feel, ships on both platforms, and covers wide language sets. The
wordmark's typeface is not named and is used only inside the logo
files; UI headings in Inter Bold sit comfortably next to it. If the
owner names the wordmark font, consider it for `display` only.

| Step | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `display` | 42 / 43 below `md`, 60 / 60 from `md`; tracking −0.035em | 700 | Home hero only |
| `h1` | 30 / 36, tracking −0.02em | 700 | Page titles (web) |
| `h2` | 24 / 32 below `md`, 32 / 36 from `md` | 600 | Section titles; page titles on mobile |
| `h3` | 20 / 28 | 600 | Card group titles |
| `h4` | 18 / 28 | 600 | Offer title on cards and detail |
| `body` | 16 / 24 | 400 | Default text (minimum on mobile) |
| `body-sm` | 14 / 20 | 400 | Secondary text, table cells on web |
| `caption` | 12 / 16 | 500 | Meta labels, badges (never body copy) |

## Spacing (PENDING APPROVAL)

4px base. Tokens: `0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32,
10=40, 12=48, 16=64`.
- Mobile screen gutter: 16. Web container gutter: 16 / 24 / 32 by
  breakpoint.
- Card padding: 16 (mobile), 24 (web).
- Vertical rhythm between sections: 32 (mobile), 48–64 (web).
- Density: medium. Lists show one offer per row on mobile with a
  96px thumbnail; never shrink text to fit a desktop layout.

## Borders and Radius (PENDING APPROVAL)

| Context | Token | Value |
| --- | --- | --- |
| Badges, chips | `--radius-sm` | 6 |
| Buttons, inputs, selectors | `--radius-md` | 8 |
| Cards, panels, photos | `--radius-lg` | 12 |

**Reference direction (owner, 2026-10-17):** buttons, link-buttons, chips and the
segmented control use `--radius-full` (pills); inputs and alerts use
`--radius-lg`; offer cards `--radius-lg`; large panels (auth card,
exchange panel, gallery, form sections, published, list panels)
`--radius-xl`.
| Modals, bottom sheets (top corners) | `--radius-xl` | 20 |
| Avatars, pills | `--radius-full` | 9999 |
| App icon / logo tile | comes from the brand files; never redraw or re-round it | |

Borders: 1px `--border-default` separates content; inputs use
`--border-strong`; selected items use 2px `--accent-primary`.

## Elevation (PENDING APPROVAL)

Flat by default; separate with borders and surface color, as the
references do.
- `shadow-none`: cards in lists and grids. Grid cards have no border
  either: photo and text sit on the page background (owner-approved
  direction, 2026-10-17). Containers appear only where content needs
  grouping, such as the exchange panel on the offer page.
- `shadow-sm` (0 1 2 rgba(2,27,24,.06)): sticky bars, hovered cards
  on web.
- `shadow-lg` (0 12 32 rgba(2,27,24,.16)): modals, popovers, bottom
  sheets, toasts.
- Shadows are always tinted with the ink color, never pure black.

**Reference direction (owner, 2026-10-17), replacing the flat card above:** offer cards are raised white
cards (1px border, `shadow-card`, `shadow-card-hover` with a 2px lift
on hover) on the off-white page, replacing the borderless grid card
above. Large white panels (forms from `md`, lists, the exchange panel)
also use `shadow-card`. Both shadows are ink-tinted.

## Icons and Illustration (PENDING APPROVAL)

- Icons: Lucide only (`lucide-react` on web, `lucide-react-native` on
  mobile). No other icon set, emoji or drawn icons. Sizes and strokes
  (owner-approved direction, 2026-10-17):

  | Size | Stroke | Use |
  | --- | --- | --- |
  | 16 | 2 | Inline with 14px text, badges |
  | 20 | 1.75 | Buttons, body text |
  | 24 | 1.75 | Navigation, standalone controls |
  | 28–32 | 1.5 | Empty and success states only (in a ringed soft-green circle) |

  Nothing larger. Icons inherit the text colour; green only when the
  icon is the action, a success state or the exchange glyph. No
  tinted circles or backgrounds behind icons. An icon appears only
  when it adds meaning; status keeps its icon and its word.
- Core exchange glyphs: `ArrowLeftRight` (exchange), `Handshake`
  (agreement), `MessageCircle`, `Clock` (awaiting), `CircleCheck`.
  Spinners use `LoaderCircle`.
  **Exception (owner request, 2026-10-17):** the exchange glyph is
  `ExchangeIcon`, two opposing curved arrows drawn in the Lucide grid
  (24px, round caps, `currentColor`), replacing `ArrowLeftRight`.
  It is the only non-Lucide icon. With the reference direction (owner,
  2026-10-17) it sits in a solid green circle on cards, the offer
  page and Saved; the heart and bookmark sit in white circles over
  photos. These are the exceptions to "no tinted circles". A star is never used (it reads as a
  rating); the cover photo is labelled "Cover".
- Icon-only buttons always have an accessible label.
- Illustrations: soft line art with a single green accent and pale
  concentric rings, adapted from the reference "perks" style, used
  only for empty states, onboarding and trust explainers. No stock
  lifestyle photography; members' own photos are the imagery.

## Component Library (PENDING APPROVAL)

Implemented in unit 02 (`apps/web/components/ui`): `Button`, `Badge`,
`TextField`, `Textarea`, `Select`, `SegmentedControl`, `PhotoTile`,
`SiteHeader`. Token values live in `packages/shared/src/tokens` and are
generated into `apps/web/app/tokens.css` (`pnpm tokens:write`); a test
fails if that file is stale. A development-only gallery is at
`/dev/ui`. Implementation notes: disabled buttons use `aria-disabled`
and stay focusable; `sm` and `md` buttons keep their 32/40px look but
have a 44px hit area; the segmented control is built from native
radio buttons. Unit 07 adds `components/offers` (`OfferDetail`, `OfferGallery`,
`OfferStatusBadge`, `ConfirmDialog`). `ConfirmDialog` uses the native
`<dialog>` element (focus trap, Escape and focus return come from the
browser), so Radix is still not needed. Below `md` the offer form is shown
in three steps with a sticky Back / Next bar (unit 07 review).

- Web: components in `apps/web/components/ui`, styled with Tailwind
  reading the token CSS variables. Add a headless primitive library
  (Radix UI) only when the first dialog, menu or popover is built.
- Mobile: components in `apps/mobile/components/ui` using the same
  token names (from `packages/shared`).
- No separate UI packages. Web and native components cannot share
  rendering code, so only tokens and types are shared.
- Same component names and props on both platforms where possible
  (`Button`, `Badge`, `OfferCard`, `ExchangeSummary`, ...).

### Buttons

| Variant | Use | Light surface | Dark frame |
| --- | --- | --- | --- |
| `primary` | One main action per view (Publish, Send proposal, Accept) | white on `--accent-primary` | ink on `--accent-on-inverse` |
| `secondary` | Alternatives (Counter, Save draft) | `--text-primary` on white, `--border-strong` | `--text-on-inverse`, 1px light border |
| `tertiary` | Low emphasis (View details, Cancel) | `--accent-primary` text, no border | `--accent-on-inverse` text |
| `danger` | Decline, Withdraw, Cancel agreement | white on `--state-danger` | same |

Sizes: `sm` 32, `md` 40 (web default), `lg` 48 (mobile default and
sticky action bars). Minimum touch target 44×44. States: default,
hover (web), pressed, focus-visible, disabled (40% opacity plus
`aria-disabled`), loading (spinner replaces label, width fixed).

### Forms

- Label above field, helper text below, error replaces helper in
  `--state-danger` with an icon.
- Required fields marked in the label text, not by asterisk alone.
- Segmented selector (adapted from the reference size grid) for
  short closed lists such as condition.
- Selectable card (adapted from the reference "18L / 20L" cards) for
  choosing one of your offers when proposing.
- Photo uploader: grid of 1:1 tiles, first tile is the cover,
  drag to reorder on web, long-press to reorder on mobile.
- Title helper text; no character counter on the title for now
  (owner decision, Milestone 1). Multi-line fields show a character
  count.

### Offer card variants

| Variant | Where | Content |
| --- | --- | --- |
| `OfferCard.grid` | Discovery feed (web grid), home page | Reference direction (owner, 2026-10-17): inset 4:3 cover photo with the category pill and the heart and bookmark, serif title (two lines reserved from `sm`), what is offered, owner initial + name, general area ("Bodija, Ibadan", omitted when unknown), posting age ("Today", "Yesterday", "3 days ago", "2 weeks ago", then the date), and the "In return" row |
| `OfferCard.row` | Discovery on mobile, search results | 96px thumbnail left, same text right |
| `OfferCard.manage` | My offers | thumbnail, title, status badge, visible action buttons (no overflow menu, owner decision); open-proposal count from Milestone 3 |
| `OfferCard.select` | Proposal composer | compact row with radio/check, selected state 2px green border |
| `OfferQuickView` | Web modal / mobile bottom sheet | gallery, terms, Propose exchange, View full details. Not built in Milestone 1 (owner decision); no later milestone assigned |

Owner avatar, until optional profile photos arrive (Milestone 2): a
neutral circle with the first letter of the display name, empty when
there is no name; never a person illustration (owner, 2026-10-17).

### Proposal and agreement components

- Exchange pair (owner-approved signature element, 2026-10-17): every
  offer shows **Offering ⇄ Wants**, two labelled sides joined by the
  green exchange glyph (`ExchangeIcon`), on cards and on the offer page.
  With the reference direction (owner, 2026-10-17), cards show only
  the "In return" side (what is offered is the line under the title);
  the offer page stacks Offering above "In return, they're looking
  for" (tinted `--accent-soft`) with the glyph on the line between; My
  offers keeps the compact stacked box. It is the
  same visual language as `ExchangeSummary` below.
- `ExchangeSummary`: two columns, **You give** and **You get**,
  joined by an exchange icon. Your side uses `--party-self`, the other
  side `--party-other`. Stacks vertically on mobile with the icon
  rotated.
- `RevisionTimeline`: vertical list of revisions, newest first, each
  with author, time, and change chips (`Added`, `Removed`, `Changed`).
- `TurnIndicator`: "Your turn to respond" or "Waiting for {name}".
- `ProposalActionBar`: Accept (primary), Counter (secondary), Decline
  (danger tertiary). Sticky at the bottom on mobile.
- `AgreementTermsCard`: the current accepted terms version with
  "Accepted by both on {date} · Version {n}" and a lock icon.
- `AmendmentPanel`: shown while an amendment is pending. Shows current
  binding terms and proposed terms side by side with change chips, and
  states that the current terms stay binding until both accept.
- `AgreementProgress`: stepped tracker adapted from the reference
  order progress bars: Agreed → You handed over → They handed over →
  Completed. Steps map to recorded handover confirmations only. Each
  step has an icon and label, not only a bar.

Built in Milestone 3 (2026-10-20), web:
- `TermsPair` is the `ExchangeSummary` above: You give, the exchange
  glyph with any cash ("You pay ₦20,000"), You get (tinted
  `--accent-soft`). It sizes by its container, so it stacks in narrow
  places such as the confirm dialog.
- Change chips: Added, Removed, Updated (the same offer, refreshed
  after a material edit), Cash changed, Note.
- Turn wording: "Your turn" or "Waiting for {name}". Actions sit
  under the latest terms, not in a sticky bar; Accept and Decline
  confirm in a dialog that restates the terms.
- The composer reuses `ExchangeBuilder`, with the cash in its middle
  slot.

Built in Milestone 4 (2026-10-20), web:
- `/agreements/:id`: headline and next step, `AgreementProgress`
  (Agreed, then each handover in the order confirmed, then Completed
  or Cancelled), the A2 prompt to close still-listed offers, then any
  cancellation request (the reason quoted), the proposed change with
  its chips, the agreed terms (lock, "Version N · agreed …"), BATR's
  fee as information only (A1), and Earlier versions (Replaced,
  Rejected, Withdrawn).
- `AgreementActions` puts each action beside what it answers: Accept
  or Reject change in the change card, Agree to cancel or Keep the
  agreement in the request panel, handover, Propose a change and Ask
  to cancel under the agreed terms. Handover, accepting a change and
  cancelling confirm in a dialog; Ask to cancel takes a reason
  (3–500 characters). The page checks for changes every 30 seconds and
  disables actions until the member refreshes.
- A change is proposed with the proposal composer in "change" mode
  (`/agreements/:id/change`, "Send change").
- Exchanges tabs: Your turn, Waiting, Agreed, Closed. Closed lists
  closed agreements above closed proposals. The Exchanges count adds
  agreements waiting on the member (A5); rows show "Needs you".

Built in Milestone 5 (2026-10-20), web:
- `Conversation`: under the terms on proposal and agreement pages
  (`#messages`). Own messages right on `--accent-soft`, the other
  member's left on `--bg-subtle`, system lines centred in caption
  with the time; "Say hello to {name}." until someone writes; the N3
  safety line above the message box; Sending…, then the error and
  Retry when a send fails; "This conversation is closed." in place of
  the box (N5). Links are never clickable.
- Header: Messages (desktop link; phone icon) and the bell (every
  width), each with an unread count read as "N unread".
- `/messages`: one row per conversation (member, "On {offer}", last
  line, time, unread count). `/notifications`: icon per kind, the
  line, "On {offer}", time, unread dot, "Mark all as read".
- Exchanges rows show "N new messages".

Built in Milestone 6 (2026-10-20), web:
- `SafetyActions`: quiet text links ("Report offer" or "Report
  {name}", "Block {name}") under the offer, proposal or agreement, so
  they never compete with the main action. Blocking confirms in a
  dialog listing what changes; afterwards the link reads "Blocked ·
  Manage in your account".
- `ReportDialog`: reason as a list of radio rows, optional details
  (needed for "Something else"), a link to "What can't be offered";
  after sending, only "Thanks. BATR will review this." (S7). Each of
  the other member's messages has a small "Report" link beside its
  time.
- `SuspendedBanner`: a warning-tone strip under the header on every
  page while suspended (S8).
- "Removed by BATR" replaces "Closed" on the owner's badge for a
  removed offer.
- Account → Safety links to `/account/blocked` (Unblock per row),
  `/account/reports` (Received or Reviewed, never the outcome) and
  `/rules`.
- `/moderation` (moderators only; Moderation in the account menu):
  the queue, oldest first; a report page with only what S6 allows
  (the reported message highlighted in its context), earlier actions,
  and one action at a time with a required note; Suspended members
  with Lift suspension.

All of these components render states and actions defined in
`specs/state-model.md`. A component never shows an action the
viewer's role cannot perform in the current state.

### Status indicators

Badge = icon + label, `caption` size, `--radius-sm`.

Every badge maps to exactly one stored state in `specs/state-model.md`,
or to a derived label computed from stored data by a function in
`packages/shared`. No other status labels may appear in the UI.

| Entity | Stored state | Badge label | Tone |
| --- | --- | --- | --- |
| Offer | `draft` | Draft | neutral |
| Offer | `active` | Active | success |
| Offer | `paused` | Paused | warning |
| Offer | `closed` | Closed | neutral |
| Proposal | `open`, viewer is the turn party (derived) | Your turn | info |
| Proposal | `open`, viewer is not the turn party (derived) | Waiting for {name} | neutral |
| Proposal | `accepted` | Accepted | success |
| Proposal | `declined` | Declined | neutral, danger icon |
| Proposal | `withdrawn` | Withdrawn | neutral |
| Proposal | `expired` (only if expiry is approved) | Expired | neutral |
| Agreement | `active` | Agreed (M4, matching the Exchanges tab) | info |
| Agreement | `amendment_pending` | Change proposed | warning |
| Agreement | `cancellation_requested` | Cancellation requested | warning |
| Agreement | `completed` | Completed | success |
| Agreement | `cancelled` | Cancelled | neutral |

## Trust, Verification and Ratings Claims (APPROVED rule)

- Never display a verification badge, rating, review count, "trusted"
  label, response-rate figure or any other trust claim unless the
  data behind it is defined in a spec and implemented in the backend.
- Allowed at launch only where the evidence source exists:
  - "Member since {month year}": from the account creation timestamp.
  - "Email verified": only for the member themself, from the auth
    provider's verified flag. Not shown to others as a trust signal.
- Completed-exchange counts, ratings and identity verification are
  not shown until open questions 8 and 11 are decided and built.
- Illustrations and copy must not imply checks BATR does not perform
  (no "verified traders", "safe exchanges", "guaranteed").

## Layout Patterns (PENDING APPROVAL)

### Web
- Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Content max
  width 1280.
- Top navbar: white with the horizontal ink logo (reference direction,
  owner 2026-10-17; it replaces the earlier ink navbar).
  - Milestone 1 (built): Explore and Sign in for visitors; Explore,
    Saved, My offers, the **Create offer** primary button and the
    member's initial (links to Account) for members.
  - Milestone 3 (built): **Exchanges** for members, with the count of
    proposals waiting on them (P5); on phones it took Saved's place in
    the tab bar (Saved stays in the account menu).
  - Later, each only when its milestone is approved: search (keyword
    search is deferred), Messages and the notifications bell (Milestone 5), and a
    profile photo in place of the initial (Milestone 2).
- Auth screens: a white card split with a dark green brand panel and
  the compact icon (reference direction, owner 2026-10-17).
- Footer (owner, 2026-10-17): white, on every page except the auth
  screens; the horizontal ink logo (`interim/logo-horizontal-ink.png`,
  unaltered), Explore, Create an offer and "© {year} BATR". No trust
  claims.
- Home (reference direction, owner 2026-10-17): the dark green hero
  panel with the headline, intro, two buttons and category chips;
  **Newest offers**; then "How BATR works" in a white panel with a
  small "Early version" tag; step 3 says exchanges are not available
  yet, in muted text.
- Create offer from `lg`: a live preview of the card beside the form;
  phones keep the steps and the preview step (owner, 2026-10-17).
- Account: rows (display name, email, Member since); the display name
  row has **Change**, which opens the existing form in place.
- Browser tab: compact icon favicon.
- Discovery: filter row above a grid of 2 (sm), 3 (md), 4 (lg)
  columns.
- Offer detail: gallery left, terms right on `lg`; stacked below
  `lg`. The Propose button joins the terms in Milestone 3.
- Negotiation: message thread left, `ExchangeSummary` +
  `RevisionTimeline` panel right on `lg`; tabs (Terms / Messages)
  below `lg`.
- Lists of proposals and agreements: grouped rows, not wide tables.
  A table is used only on `lg` and above, and every table has a
  row-card fallback below `md`.
- Modals: centered, `--radius-xl`, `shadow-lg`, backdrop at 60% ink.

### Native mobile
- Built in Milestone 2 Part 1 (owner, 2026-10-22, M2) and Part 2
  (2026-10-23, Q2): bottom tabs Explore, Exchanges (with the count of
  what waits on the member), Create (centre button), My offers,
  Account, matching the web's phone tab bar. Saved opens from Account.
- Above every tab: Messages and the notifications bell at the top
  right, each with its unread count, and the suspended banner when it
  applies (Q7).
- Screen gutter 16, safe areas respected. Tab screens draw their own
  title under the header bar; pushed screens (offer, exchange,
  agreement, composer, Messages, notifications, account pages, auth)
  use the stack header with a back or close button. Screens with
  their own heading (exchange, agreement, composer, Messages,
  notifications, account pages) leave the header title empty so the
  title isn't shown twice.
- Create and edit: the web's steps with a Back/Next bar above the home
  indicator, then the preview step and Publish. Leaving with unsaved
  changes asks "Leave without saving?".
- Offer page: photo carousel with dots, the exchange panel, Like and
  Save, Share through the native share sheet, Propose an exchange (or
  View your proposal), Report offer in a sheet and Block. The owner
  sees "Proposals on this offer".
- Exchanges, negotiation, agreement, the composer and the conversation
  follow the web's layouts stacked for a phone. Messages and
  notifications open the proposal or agreement scrolled to the
  conversation.
- Confirmations are centred dialogs with the 60% ink scrim that restate
  the terms where the web does; the report form is a page sheet; short
  results are toasts, some with an action ("View saved", "Blocked
  members").
- Photo capture and selection use the native picker.
- Pull to refresh and infinite scroll or "Show older" on lists.
- Valuation and the rules ("What can't be offered") open on the web.

## Motion

Added 2026-10-20 at the owner's request (carousels, the exchange
animation, transitions). Values live in `packages/shared/src/tokens`.

| Token | Value | Use |
| --- | --- | --- |
| duration fast | 150ms | Hover, press, small state changes |
| duration base | 220ms | Menus, toasts, reveals |
| duration slow | 360ms | Page-level and carousel transitions |
| duration exchange | 520ms | The signature exchange animation |
| easing standard | cubic-bezier(0.2, 0, 0, 1) | Most movement |
| easing emphasized | cubic-bezier(0.3, 0, 0, 1) | Entrances, the exchange animation |
| easing exit | cubic-bezier(0.4, 0, 1, 1) | Things leaving |
| carousel interval | 5s | Auto-advancing carousels |

- Motion explains a change (something arrives, leaves or connects); it
  is never decoration on its own.
- Auto-advancing carousels have a visible pause control, pause on
  hover, focus and when off-screen, and never move for
  prefers-reduced-motion.
- Animate transform and opacity only. No 3D effects.
- Motion (the library) for orchestrated transitions; CSS for simple
  states; Swiper for carousels.
- Utilities: `duration-fast|base|slow|exchange` and
  `ease-standard|emphasized|exit` (declared in `globals.css`).
- Carousel (`components/ui/Carousel`): one component for every
  carousel. Dots are 44px tap targets; the active dot fills over the
  interval. Hidden slides are inert. Used for offer photos (dots over
  the photo; thumbnails beside it from lg), the home hero and "How
  BATR works".
- The exchange: the two sides of an offer move together and the
  exchange symbol turns into place between them (520ms, emphasized).
  On the form it plays when both sides are filled; on the offer page
  the panel's sides arrive from above and below.
- Scroll reveals: cards and sections rise 24px into place as they
  enter, driven by scroll (`.reveal`, CSS only). No fade: text never
  passes through low contrast. Off where scroll-driven animations are
  unsupported and under reduced motion.
- Press: buttons scale to 0.97 while held; cards settle back.
- Menus and toasts arrive with a short rise (220ms). One toast at a
  time, above the phone tab bar, for confirmations only; errors stay
  beside the control.
- Phones (below md) navigate with the bottom tab bar: Home, Explore,
  Create, Saved, My offers (Sign in when signed out). Hidden on the
  offer form and the auth screens. The header keeps the logo and the
  account menu.

## Accessibility Requirements

- WCAG 2.2 AA on web; equivalent platform guidelines on iOS and
  Android.
- Text contrast at least 4.5:1 (3:1 for 24px+ or 19px bold);
  non-text UI contrast at least 3:1. Pairs above are pre-checked.
- Visible focus on every interactive element on web; logical focus
  order; dialogs trap and restore focus.
- Touch targets at least 44×44.
- Support Dynamic Type / font scaling up to 200% without clipping
  primary actions.
- Respect reduced-motion settings.
- Every icon-only control and every offer photo has an accessible
  name; members are prompted (not forced) to describe photos.
- Status changes in negotiation are announced to screen readers
  (live region on web, accessibility announcement on mobile).
- Forms announce errors and move focus to the first invalid field.
