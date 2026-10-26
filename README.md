# BATR

BATR is a peer-to-peer exchange marketplace for web and native mobile.

Before changing anything, read `CLAUDE.md` and the files it lists in
`context/`, then `specs/00-build-plan.md`, `specs/state-model.md` and
`specs/milestone-1.md`. They are the source of truth for scope,
architecture and conventions.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/web` | Next.js web app and, from unit 06, the HTTP API (`app/api/v1`) |
| `packages/shared` | Shared rules: schemas, state machines, permissions, status labels, tokens |
| `supabase` | Local Supabase configuration, migrations (from unit 04) and database tests |
| `scripts` | Small Node scripts for local Supabase connection details |
| `CLAUDE.md`, `context/`, `specs/`, `assets/` | Project context, specs and brand files |

The mobile app (`apps/mobile`, Expo) arrives in Milestone 2.

## Requirements

- Node 22.12 or newer (`.nvmrc` says 22)
- pnpm 10 (`corepack enable` picks the version in `package.json`)
- Docker, for local Supabase

No accounts, API keys or production credentials are needed for local
development.

## Commands

Run all commands from the repository root.

| Task | Command |
| --- | --- |
| Install dependencies | `pnpm install` |
| Start the web app (http://localhost:3000) | `pnpm dev` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Unit tests (Vitest) | `pnpm test` |
| Production build | `pnpm build` |
| Browser tests (Playwright; builds first; needs local Supabase and `.env.local`) | `pnpm build && pnpm test:e2e` |
| Start local Supabase | `pnpm db:start` |
| Show local Supabase URLs and development keys | `pnpm db:status` |
| Reset the local database (re-applies all migrations) | `pnpm db:reset` |
| Database tests against local Supabase | `pnpm test:db` (Supabase must be running) |
| Offer API integration tests against local Supabase | `pnpm test:api` (Supabase must be running) |
| Stop local Supabase | `pnpm db:stop` |
| Write `apps/web/.env.local` from local Supabase | `pnpm env:local` |

Accounts (unit 05): with local Supabase running and `.env.local`
written, sign up at http://localhost:3000/sign-up. The confirmation
email arrives in the local inbox at http://127.0.0.1:54324 (Mailpit);
nothing is sent to real addresses. The browser tests read that inbox
too.

Browser tests need Playwright's browsers once:
`pnpm --filter @batr/web exec playwright install chromium webkit`.
If browsers cannot be downloaded, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a local Chromium binary. WebKit
runs in CI, or locally with `PLAYWRIGHT_WEBKIT=1`.

### If local Supabase images fail to download

The Supabase CLI pulls its images from the AWS public registry by
default. Where that registry is blocked or rate-limited, use the
Docker Hub copies for that shell session only:

```sh
export SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io
pnpm db:start
```

This is an environment setting, not part of the project
configuration.

## Environment variables and secrets

`apps/web/.env.example` lists the variable names. Real values live in
`apps/web/.env.local`, which is git-ignored. Never commit `.env.local`,
keys or tokens; CI runs a secret scan (gitleaks) over the full history
and fails if it finds one.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must never be imported
into client code or used for member requests. It is used only to
delete photo files the database has queued for deletion (by the API
right after the commit, as `specs/milestone-1.md` describes, and by the
storage cleanup job) and in test setup.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Secret scan**: gitleaks over the full git history.
2. **Checks**: lint, type check, unit tests, production build.
3. **Database and API tests**: starts local Supabase, resets it, runs
   `pnpm test:db` and `pnpm test:api`.
4. **Browser tests**: starts local Supabase, writes `.env.local`,
   then runs Playwright on Chromium and WebKit.

The database tests (unit 04) use real member accounts and sessions
against the local Supabase: row-level security, storage policies, the
offer write functions, idempotency, races between concurrent writes,
fault injection, and parity between the database rules and
`packages/shared`. They need the service key only to create test
accounts and inspect storage, and read it from `supabase status` at
run time.
