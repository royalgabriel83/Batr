# Code Standards

Applies to the stack in `architecture.md` (approved for the web
milestone). If the stack changes, update this file in the same change.

## Tooling versions (unit 01)

- Node 22, pnpm 10 workspaces, TypeScript 6.0 (`strict`,
  `noUncheckedIndexedAccess`), Next.js 16 (App Router), React 19.
- ESLint 9 flat config (`eslint.config.mjs`): `typescript-eslint`
  strict everywhere, Next.js rules (core web vitals) scoped to
  `apps/web`. Lint runs with `--max-warnings=0`.
- Vitest 5 for unit tests (`*.test.ts`), `supabase/tests/*.db.test.ts`
  for tests against local Supabase (`pnpm test:db`), Playwright for
  browser tests in `apps/web/e2e` (`*.dev.spec.ts` run against the
  development server, everything else against the production build).
- Styling (unit 02): Tailwind CSS 4 with its default palette, type
  scale, radii, shadows and breakpoints removed; only BATR tokens
  exist. `pnpm lint` rejects raw hex colors and arbitrary font sizes in
  app TypeScript, and raw color values in app CSS (except the
  generated `tokens.css`). Icons: `lucide-react`. Font: Inter through
  `next/font/google` (downloaded at build time and self-hosted).

## General

- Keep modules small and single-purpose.
- Fix root causes; do not layer workarounds.
- Business rules live in `packages/shared`. If you are writing an
  `if (status === ...)` in an app, it belongs in the domain package.
- Do not mix data fetching, business rules and presentation in one
  component or route.
- Name things in the product's language: offer, proposal, revision,
  counteroffer, agreement, handover. Never "order", "cart",
  "product", "buyer" or "seller".

## TypeScript

- `strict: true` everywhere, plus `noUncheckedIndexedAccess`.
- No `any`. Use `unknown` at boundaries and narrow with Zod.
- Domain types are inferred from Zod schemas in `packages/shared`
  (`z.infer`), not hand-written twice.
- Status values are string literal unions exported from
  `packages/shared`, matching `specs/state-model.md`; never compare
  against ad-hoc strings. UI labels come only from the shared
  status-label function.
- IDs are branded types (`OfferId`, `ProposalId`, ...) so they cannot
  be swapped by accident.

## Shared package (`packages/shared`)

- Pure functions only: no network, database, clock or random calls.
  Pass `now` and IDs in as arguments.
- Each state machine exports `canTransition(from, action, actor)` and
  `transition(...)` returning a result object, not throwing.
- Permission checks are functions of `(actor, resource)` in
  `packages/shared`.
- 100% branch coverage on state machines and permissions.

## Next.js (web)

- Default to server components; add `"use client"` only for
  interactivity.
- Pages read data through `apps/web/server` functions; client
  components mutate by calling `/api/v1` with a small typed fetch
  helper in `apps/web` (types from `packages/shared`).
- Route handlers in `app/api/v1/**/route.ts` follow one shape:
  authenticate → parse input with Zod → pre-check with the shared
  transition and permission functions (for clear errors) → call the
  database transition function, which locks the row, re-checks,
  writes the change, the audit event and the idempotency record in
  one transaction → respond. Never write state with plain updates
  from the API.

## Expo (mobile, from Milestone 2)

- Expo Router file-based routes in `apps/mobile/app`.
- All server calls go to `/api/v1` with types from
  `packages/shared`. No direct database writes from the device.
- Tokens stored with `expo-secure-store`, never AsyncStorage.
- Every screen handles loading, empty, error and offline states.

## API

- Base path `/api/v1`. JSON only.
- Validate and parse request input before any logic runs.
- Enforce auth and party membership before any read of private
  data and before any mutation.
- Success: `{ data: ... }`. Error: `{ error: { code, message,
  fields? } }` with codes `UNAUTHENTICATED`, `FORBIDDEN`,
  `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT` (stale revision,
  invalid transition), `RATE_LIMITED`, `INTERNAL`.
- State-changing endpoints accept an `Idempotency-Key` header so a
  retried tap does not create two proposals or two agreements.

## Data and Storage

- Every schema change is a SQL migration in `supabase/migrations`
  with its row-level-security policies in the same migration.
- Multi-row state changes (accept → agreement) run in one
  transaction.
- Photos go to object storage; the database stores paths only.
- Timestamps are `timestamptz` in UTC; format for display on the
  client in the member's locale.

## Styling

- Use tokens from `packages/shared` only. No hardcoded hex, px font
  sizes or ad-hoc shadows in app code.
- Follow the radius, spacing and elevation scales in
  `ui-context.md`.
- Build mobile-first on web; every layout is checked at 375px.

## Testing

- Domain: Vitest unit tests for every transition and permission.
- API: integration tests per endpoint covering success, each
  permission failure, validation failure and conflict.
- Web: Playwright for each priority flow end to end.
- Mobile: Maestro for end-to-end flows (owner, 2026-10-22,
  `specs/milestone-2.md` M8); Jest with React Native Testing Library
  for components and screens.
- Accessibility: axe checks on every web page in end-to-end tests.

## File Organization

- `apps/web/app/` — routes and pages only.
- `apps/web/app/api/v1/` — HTTP endpoints only.
- `apps/web/server/` — database, storage, auth guard, audit.
- `apps/web/components/ui/` — web presentation components.
- `apps/mobile/` — Expo app (from Milestone 2).
- `packages/shared/` — schemas, state machines, permissions, status
  labels, design tokens.
- `supabase/migrations/` — schema and policies.
- Do not add a new package or top-level folder without recording the
  reason in `progress-tracker.md`.

## Trust claims

- Never render a verification badge, rating, review count or other
  trust claim unless its data source is defined in a spec and
  implemented. See `ui-context.md`.
- Tests sit next to the code as `*.test.ts`; end-to-end tests in
  `apps/*/e2e/`.
