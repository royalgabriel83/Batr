# Milestone 7: Keeping Contact Details in BATR

Status: **APPROVED by the owner (2026-10-23, "Approve all"), with every
default kept.** C2 was narrowed while building (below, marked).

Proposed after the UI/UX and Trust & Safety review (2026-10-23,
roadmap P0 #1). Off-platform deals are the main scam route on
marketplaces: a member is moved to WhatsApp or a phone call, where BATR
can't see the terms, the messages or the handover. Messages are plain
text today (`milestone-5.md`), with a per-minute limit, but nothing
stops a phone number or an email being sent.

Rules: `state-model.md`. Messages: `milestone-5.md`. Safety and
moderation: `milestone-6.md`. Where they differ, `state-model.md` wins,
then this file.

## Goal

Phone numbers, email addresses and messaging links aren't passed
between members inside BATR. A member who tries is told why, kindly,
and what to do instead. Repeated attempts reach a moderator. No other
part of BATR can skip the check.

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| C1 | Where is text checked? | Messages, the note on a proposal or counter, the reason on a change or cancel request, and an offer's title, description and "looking for" text. Display names are checked when set |
| C2 | What counts as a contact detail? **High confidence** | A Nigerian phone number (11 digits starting 070, 080, 081, 090 or 091; or +234 / 234 followed by 10 digits, or the same 10 digits with no prefix); any other run of 12 or more digits (narrowed from 10 while building, 2026-10-23, so sizes or dates written in a row aren't refused); an email address; a link to WhatsApp, Telegram, Signal, Instagram, Facebook, TikTok, Snapchat or X (wa.me, t.me, chat.whatsapp.com and the like) |
| C3 | Disguised details | Before checking, the text is normalised: digit words (zero to nine, and "oh" between digits) become digits; spaces, dots, dashes, brackets and slashes between digits are removed; "at", "(at)", "[at]" and "dot" next to word characters become @ and . ; full-width and look-alike characters are folded |
| C4 | **Ambiguous** | A lone @handle, a 7 to 11 digit run that isn't a Nigerian number, or a bare web address that isn't a messaging app (example.com). These are sent, with a quiet warning to the sender only, and counted |
| C5 | What happens to high-confidence text? | **It isn't sent or saved.** The sender sees: "Not sent: phone numbers, emails and chat links can't be shared in BATR. Agree where to meet in the agreement's handover details instead." Their typing stays in the box so they can edit it. For an offer, the field shows the same message and the offer isn't saved |
| C6 | Is anything stored about a blocked message? | One row in a private `contact_attempts` table: member, where (message, note, offer field), the kind matched (phone, email, link) and the time. **Not** the text and not the number itself. Kept 180 days |
| C7 | Repeat attempts | 3 blocked attempts in 24 hours opens a moderator report automatically ("Repeated attempts to share contact details", reporter shown as BATR). The member isn't suspended automatically |
| C8 | Exceptions | None at launch. Numbers that are clearly prices or years ("₦45,000", "2019 model") don't match because of C2's digit rules. A false-positive appeal path is P1 in the review |
| C9 | Where the check runs | In the database, inside each write function, from one shared function `private.contact_check(text)`. The web and app show the server's answer; there's no separate client check that could disagree |
| C10 | Handover details | Out of scope here. Meeting place and time inside the agreement is a separate spec (the review's "managed bridge") |

## In scope

- `private.contact_check(text)` returning `none`, `ambiguous` or a
  high-confidence kind, with the normalisation in C3.
- Calling it from `message_send`, the proposal create, counter and
  change-request functions, the offer save and publish functions, and
  the display-name update.
- A new error: `CONTACT_DETAILS` (HTTP 422) with `{ "kind": "phone" |
  "email" | "link", "field": "<name>" }`. An idempotent retry with the
  same key returns the same refusal.
- `private.contact_attempts`, its 180-day cleanup in the existing
  storage-cleanup job, and the automatic report in C7 (a new report
  reason `contact_details`, shown to moderators only).
- The refusal and warning wording on web and mobile, in the message box,
  the proposal composer, the change and cancel dialogs and the offer
  form.
- A test set of at least 200 realistic messages (Nigerian English and
  Pidgin, prices, dates, addresses, disguised numbers) kept in the repo.

## Out of scope

- Detecting contact details inside photos (text recognition).
- Handover details in the agreement (C10).
- Appeals for a false positive (review P1).
- Email, SMS or push notifications.

## Acceptance criteria

1. Each high-confidence example in the test set is refused by every
   write path in C1, through the API, and nothing is saved, notified or
   counted as unread.
2. On the test set: at least 95% of contact details are caught, and no
   more than 2% of ordinary messages are refused.
3. Ambiguous text is sent; only the sender sees the warning.
4. `contact_attempts` never holds the message text or the matched
   number.
5. The third blocked attempt in 24 hours opens one report; a fourth
   doesn't open another while it's open.
6. Retrying a refused send with the same idempotency key gives the same
   422.
7. The refusal is announced to screen readers and the typed text is kept,
   on web (375 and 1280 px) and in the app.

## Test plan

- Database tests for `contact_check` against the test set, and for
  every write function.
- API tests for the 422 on each endpoint.
- Browser tests for the message box and the offer form; a Maestro flow
  for the app's message box.
