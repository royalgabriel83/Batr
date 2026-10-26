# Milestone 2: Mobile App, Part 1 (Offers on iPhone and Android)

Status: **APPROVED by the owner (2026-10-22, "Mobile app", then
"Approve all"), with every default in the decisions table kept.**
Approving it settles the mobile end-to-end tool left open in
`code-standards.md` (Maestro, M8) and the package list below.

Order: the build plan's next milestone. Its prerequisite, the safety
requirements, is met by Milestone 6. Because Milestones 3–6 came first
on the web, the mobile app is split into two parts so each can be
reviewed:

- **Part 1 (this spec):** units 09–12: the app shell and tokens,
  sign-in, create and manage offers, Explore and the offer page.
- **Part 2 (own spec later):** units 17 and 20 plus the mobile thread,
  notification list, Block and Report: proposals, agreements, messages
  and safety on mobile.

Rules: `state-model.md`, `05-auth-and-permissions.md`,
`01-marketplace-discovery.md`, `02-offer-creation.md`. Where they
differ, `state-model.md` wins, then this file.

## Goal

A member can install BATR on an iPhone or Android phone, sign up or
sign in, browse and save offers, and create, publish and manage their
own offers with photos, with the same rules and the same API as the
web.

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| M1 | Scope of this part | Units 09–12 only. Proposals, agreements, messages and safety on mobile are Part 2. Until then, the offer page on mobile says "Proposing is coming to the app soon" with a link to the same offer on the web. Report offer is in Part 1 as well (one dialog, the existing API), so the app never shows other members' offers with no way to report them |
| M2 | Navigation | Bottom tabs: Explore, Saved, Create (centre button), My offers, Account. The same order and icons as the web tab bar. Exchanges and Messages join the tabs in Part 2 |
| M3 | How the app talks to BATR | Only through the existing `/api/v1` API with `Authorization: Bearer`. Supabase Auth's client is used for sign-in, sign-up, password reset and token refresh only. No direct table reads from the app, so every rule stays in one place |
| M4 | Where the session is kept | `expo-secure-store` (Keychain and Keystore), never AsyncStorage (`code-standards.md`). Signing out clears it |
| M5 | Email links (confirm, reset) | They open the web pages, as now. After confirming, the member signs in in the app. App links (universal links) come with launch hosting |
| M6 | Photos | Camera or library through `expo-image-picker`, up to the existing photo limit, uploaded as now so the server strips location data and converts to WebP. iPhone HEIC photos are converted on the phone to JPEG before upload |
| M7 | Look and feel | The same tokens from `packages/shared`, Inter and Newsreader bundled with `expo-font`, Lucide icons (`lucide-react-native`), 48px primary buttons and 44px tap targets, light mode only, matching the approved web screens |
| M8 | How it is tested here | Unit and screen tests with Jest and React Native Testing Library; the API is already tested. **Maestro** for end-to-end flows; they need an iOS simulator or Android emulator, which this cloud workspace doesn't have, so they are written here and run on a Mac or in CI later. Screens for review are captured from the app's web preview (Expo for web), labelled as such |
| M9 | Trying it on your phone | Expo Go or a development build pointed at a temporary, access-controlled test server, once hosting is chosen (the same decision as the real-iPhone web test). No App Store or Play Store release in this milestone |
| M10 | Unit 12b profile photos | Not in this milestone; its criteria are still pending approval |

## In scope

- Units:
  - **09:** `apps/mobile` Expo app with Expo Router, the shared tokens, fonts, icons, the tab bar, core components (Button, TextField, Textarea, Select, SegmentedControl, Badge, EmptyState, FormAlert, PhotoTile, toast), error and offline states.
  - **10:** sign up, confirm (by email link), sign in, sign out, forgot password, session refresh, the Account tab (display name, email, Safety links that open the web pages for now).
  - **11:** create offer in the same steps as the web, photos, save draft, publish, edit, pause, close, delete draft, My offers, Valuation summary (read-only; submitting a valuation stays on the web for now).
  - **12:** Explore with the same filters as the web, pull to refresh, infinite scroll, the offer page with photo carousel, Like, Save, Share and Report offer; Saved.
- API additions only where a screen needs data the API doesn't return yet (for example `PATCH /api/v1/me/profile` for the display name, already planned in the tracker).

## Out of scope

- Proposals, agreements, messages, notifications, Block on mobile (Part 2).
- Push notifications (unit 23).
- App Store and Play Store listings, release builds, app links.
- Dark mode, tablets, offline drafts beyond the current session.

## Acceptance criteria

- [ ] A new member can sign up, confirm by email, sign in in the app, stay signed in across app restarts, and sign out (which clears the stored session).
- [ ] A member can create an offer with photos from the camera or library, save it as a draft, publish it, edit it, pause it, close it and delete a draft, with the same validation messages as the web (from `packages/shared`).
- [ ] Explore, filters, the offer page, Like, Save, Saved and Report offer behave as on the web, and blocked or suspended members' offers stay hidden (enforced by the API).
- [ ] Every screen uses the shared tokens, meets 44px tap targets and works with screen readers (labels and roles checked in screen tests).
- [ ] Lint, typecheck, unit and screen tests pass; the existing web, database and API checks still pass. Maestro flows are written for every journey above and marked as not yet run until a simulator or CI is available.

## Packages this part adds (each with its reason, recorded in the tracker)

`expo`, `expo-router`, `react-native` (the app itself); `expo-secure-store` (M4); `expo-image-picker`, `expo-image-manipulator` (M6); `expo-font` (M7); `lucide-react-native`, `react-native-svg` (icons); `@supabase/supabase-js` (sign-in only, M3); `jest-expo`, `@testing-library/react-native` (tests, M8). Versions pinned exactly, as in `apps/web`.
