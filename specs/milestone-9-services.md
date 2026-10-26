# Milestone 9: Services as First-Class Offers

Status: **APPROVED by the owner (2026-10-23, "Approve all"), with every
default kept.**

Proposed after the owner asked "the focus is mainly on items, what of
services" (2026-10-23) and the UI/UX review (roadmap P1). Offers:
`milestone-1.md` (including location phase 1). Where they differ,
`state-model.md` wins, then this file.

## Goal

A member can offer a service (tutoring, hair braiding, phone repair,
website design) as easily as an item, and every screen reads naturally
for it. Today a service is possible (remote exchange, `remote_service`
or `on_site_service` handover), but there is no Services category, the
form asks for a condition and photos, and the wording says "item".

## Decisions in this spec (defaults; the owner can change any)

| # | Question | Default proposed |
| --- | --- | --- |
| V1 | How does a member say it's a service? | A first choice on the create form: "What are you offering? An item / A service". Stored as `offer_type` (`item`, `service`), default `item` for existing offers |
| V2 | Categories for services | A separate list: Lessons and tutoring; Beauty and hair; Repairs; Design and digital; Cleaning and home help; Events; Other services. Item categories stay as they are |
| V3 | Condition | Not asked and not shown for a service |
| V4 | Photos | At least 1 photo is still needed to publish, with the hint "A photo of your work, your tools or a sample". The owner may choose to make photos optional for services instead |
| V5 | Wording | For a service: "What I'm offering" becomes "What the service includes"; the offer page shows "Service" instead of the condition; proposal and agreement screens say "service" where they now say "item" (for example "This service changed after these terms were sent"). Explore gets an "Items / Services / Both" filter |
| V6 | Handover | A service uses only `on_site_service` (in person) or `remote_service` (remote); an item can't use either. The handover dialog says "Confirm only once the service has been done" for a service |
| V7 | Material changes | `offer_type` and the service fields count as material item fields (`milestone-1.md`), so changing them makes earlier proposal snapshots unacceptable, as today |
| V8 | Reusable listings | A service stays listed after an agreement by default, and the completion prompt says "Services usually stay listed. Close it in My offers if you can't offer it again". (The general "can be exchanged more than once" switch stays P2) |

## In scope

- `offer_type`, the service categories and the publish rules in the
  database and API, with a migration that sets existing offers to
  `item`.
- The create and edit form, offer page, cards, Explore filter, proposal,
  agreement and handover wording on web and mobile.
- Storybook stories for the service variants of the offer card and offer
  page.

## Out of scope

- Booking times or calendars.
- Pricing services in money (BATR stays exchange-first; cash is still
  only a top-up in the terms).
- Certifications or verified skills.

## Acceptance criteria

1. A service can be created, published, proposed on, agreed and
   completed on web and mobile, and no screen in that journey asks for or
   shows a condition.
2. Publishing a service with an item-only handover method (or an item
   with a service one) is refused with a field error.
3. The Explore filter returns only items, only services, or both.
4. Existing offers are unchanged and read as items.
5. Every changed screen works at 375 and 1280 px with no serious
   accessibility issues.

## Test plan

- Database and API tests for the publish rules and the filter.
- Browser tests for creating a service and the service wording through
  to completion; a Maestro flow for creating a service in the app.
