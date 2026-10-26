# Feature Spec: Marketplace Discovery

Web basics in Milestone 1 (`milestone-1.md`, which is authoritative
for that milestone); mobile in Milestone 2. The **Propose exchange**
action appears only once proposals exist (Milestone 3).

**Not in Milestone 1** (owner decisions recorded in the tracker):
keyword search (deferred), the condition filter, quick view (cards
open the offer page), **View your proposal** and **See proposals**
(Milestone 3), **Report** (only if moderation is approved, open
question 10), and the owner avatar (an initial until profile photos
arrive in Milestone 2). The journey and criteria below describe the
full feature, not Milestone 1.

## Goal

People can find active offers worth proposing on: a browsable feed,
keyword search, category filters, and an offer detail view with a
clear **Propose exchange** action.

## User Journey

1. Explore opens the feed of active offers, newest first.
2. The member searches by keyword (title, offering, wants text) and
   filters by category and condition.
3. Tapping a card opens offer detail (mobile) or quick view (web
   modal; **View full details** opens the page).
4. Detail shows gallery, title, condition, "Offering", "Wants",
   description, owner (display name and "Member since" from account
   creation; no other trust claims, see ui-context), and the actions:
   **Propose exchange** (or **View your proposal** if one is open),
   **Share**, and **Report** (if moderation is approved).
5. If the viewer owns the offer, actions become **Edit** and
   **See proposals**.

## Design and UI States

- Web grid `OfferCard.grid` 2/3/4 columns; mobile `OfferCard.row`
  list. Filters: chip row on web, bottom sheet on mobile.
- Detail: gallery left and terms right on `lg`; stacked otherwise;
  mobile sticky bottom bar with Propose.

| State | What the member sees |
| --- | --- |
| Loading | Skeleton cards |
| Results | Cards with infinite scroll / "Load more" |
| No results | Illustration, the active filters, **Clear filters** |
| Empty marketplace | Illustration and **Create an offer** |
| Error | Message with Retry |
| Offer unavailable | "This offer isn't available" with back to Explore |
| Signed out and acting | Sign-in prompt that returns to the same offer |

## Data Requirements

- Reads `offers` with status `active` plus cover photo and owner
  public profile (display name, avatar, member since).
- Cursor pagination, 20 per page, ordered by `published_at desc`.
- Search: Postgres full-text over title, offering_text, wants_text,
  description (PROPOSED).
- Distance and location filters are excluded until open question 4.

## Permissions

- Signed-out visitors can browse and read detail (decision D6,
  2026-10-15): it helps acquisition and exposes only public fields.
- Owner-only fields (drafts, proposal counts) never appear in public
  responses.

## Validation

- Search query trimmed, 1–100 characters.
- Unknown category or condition values return `VALIDATION_FAILED`.
- Cursor is opaque and validated.

## Failure Cases

- Offer paused or closed between list and detail → unavailable state.
- Image load failure → neutral placeholder tile, text still shown.
- Slow network on mobile → cached last page shown with a stale
  banner.

## Acceptance Criteria

- [ ] Feed lists only `active` offers; drafts, paused and closed never
      appear.
- [ ] Search for a word in an offer's "wants" text returns it.
- [ ] Category and condition filters combine correctly and can be
      cleared in one action.
- [ ] Pagination returns no duplicates across pages.
- [ ] The owner sees Edit / See proposals instead of Propose on
      their own offer.
- [ ] A viewer with an open proposal sees **View your proposal**.
- [ ] Public API responses contain no private fields (checked by an
      API test).
- [ ] Grid reflows 2/3/4 columns at 640/768/1024; detail works at
      375px; keyboard navigation reaches every card and action.

## Open Questions

Location (4), sorting
options beyond newest, and saving/favoriting offers.
