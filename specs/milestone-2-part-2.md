# Milestone 2: Mobile App, Part 2 (Exchanges, Messages and Safety on iPhone and Android)

Status: **APPROVED by the owner (2026-10-23, "Approve all"), with
every default in the decisions table kept (Q1–Q10).** Proposed on
2026-10-23 after the owner's "Move on to the next phase" on Part 1.

Part 1 (`milestone-2.md`, units 09–12) is built and committed locally.
Its look is confirmed: the app matches the web design (owner,
2026-10-22, "Keep matching"). Part 2 brings the rest of what members
can already do on the web into the app, with the same rules and the
same API.

Rules: `state-model.md`, `03-exchange-proposals.md`,
`04-agreement-management.md`, `06-messaging-and-notifications.md`,
`milestone-3.md` to `milestone-6.md` (their approved decisions apply
unchanged). Where they differ, `state-model.md` wins, then this file.

## Goal

A member can do the whole exchange in the app: propose on an offer,
counter, accept or decline, then confirm the handover, change or
cancel the agreement, message the other member throughout, see their
notifications, and block or report anyone, all with the same results
as on the web.

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| Q1 | Scope | Unit **17** (propose and negotiate), unit **20** (agreements), the conversation and Messages screen, the notification list, and Block and Report everywhere they are on the web. The moderation workspace stays on the web only. Valuation submission stays on the web, as in Part 1 |
| Q2 | Tabs | The same as the web's phone tab bar: **Explore, Exchanges** (with the count of what's waiting on you), **Create, My offers, Account**. Saved moves into Account. Messages and the notifications bell sit at the top right of the tab screens, as on the web header, each with its unread count |
| Q3 | How "live" are conversations? | As on the web (N1): an open conversation checks for new messages every 5 seconds while on screen, and at once when the app comes back to the front. Counts refresh when a tab is opened and when the app comes back. No push notifications (unit 23 is separate) |
| Q4 | Proposals | The same composer as the web: up to 3 items per side (on your side, pick from your own active offers or describe an item in words), an optional cash amount and who pays it (P1, P2), and an optional note. Counter opens prefilled. Accepting, declining and withdrawing ask for confirmation. The owner of an offer sees its proposals listed on their offer page |
| Q5 | Agreements | The same agreement page as the web: the agreed terms, handover confirmation, propose or answer a change, ask for or answer a cancellation, and the D1/A2 prompt to close offers. Fees show as information only (A1); nothing is collected |
| Q6 | Block and Report | In the app, not on the website: Report a member and Report a message are added beside Report offer; Block from the other member's name on offers, proposals and agreements; Account → Blocked members (with Unblock) and My reports become app screens. "What can't be offered" stays a link to the website, so the owner's wording lives in one place |
| Q7 | Suspended members | The same banner as the web at the top of every tab: "Your account is limited. You can't publish, propose or message for now." with the S8 contact address once the owner supplies it |
| Q8 | API additions | Only one: `GET /api/v1/me/status` returning the Exchanges count, unread message and notification counts (with unread messages per proposal for the Exchanges rows), and whether the member is suspended. The web works these out on the server today; the app needs them over the API. No ids returned |
| Q9 | How it is tested here | As Part 1 (M8): Jest and React Native Testing Library screen tests, Maestro flows written for every journey and marked not run, review screens from the app's web preview, labelled as such and bundled into one PDF |
| Q10 | Packages | None expected. Any package that turns out to be needed is named here with its reason before it is added |

## In scope

- **Unit 17:** the Propose composer from an offer page; Exchanges with the Your turn, Waiting, Agreed and Closed tabs; the negotiation screen with the terms, history and change chips; counter, accept, decline and withdraw; the owner's proposal list on their offer.
- **Unit 20:** the agreement screen: handover, changes, cancellation, the close-offer prompt, fees as information.
- **Messages:** the conversation under the terms on proposal and agreement screens, with the standing payment line (N3) and closed conversations (N5); the Messages screen listing every conversation.
- **Notifications:** the notification list, Mark all as read, each opening what it is about.
- **Safety:** Block and Report as in Q6, the suspended banner (Q7), "This member isn't available." where the API returns it.
- `GET /api/v1/me/status` (Q8) and its API tests.

## Out of scope

- Push and email notifications (unit 23, specified separately).
- The moderation workspace on mobile.
- Submitting or appealing a valuation in the app.
- Payments of any kind; fees stay information only.
- App Store and Play Store release, app links, profile photos (12b).

## Acceptance criteria

- [ ] A member can propose on another member's live offer, counter, accept, decline and withdraw in the app, with the same rules, limits and messages as the web (from `packages/shared`).
- [ ] After acceptance, both members can confirm the handover, propose and answer a change, and ask for and answer a cancellation in the app, and the result matches the web.
- [ ] Messages sent in the app appear on the web and the other way round; new ones appear within about 5 seconds while a conversation is open; closed conversations can't be written in.
- [ ] Notifications and counts in the app match the web for the same member.
- [ ] Block, Unblock, Report member, Report message and My reports work in the app, and a blocked or suspended member gets the same results as on the web (enforced by the API).
- [ ] Every new screen uses the shared tokens, meets 44px tap targets and works with screen readers (labels and roles checked in screen tests).
- [ ] Lint, typecheck, unit and screen tests pass; the existing web, database, API and browser tests still pass. Maestro flows are written for every journey above and marked as not yet run until a simulator or CI is available.
