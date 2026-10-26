# AI Workflow Rules

## Approach

Build BATR incrementally with a spec-driven workflow. The context
files define what to build, how, and the current state. The specs in
`specs/` define each feature. Implement against them. Do not infer
or invent product behavior.

## Approval Gate

- The stack and the Milestone 1 specification are approved (see
  `progress-tracker.md`). Build one unit at a time, and start the
  next unit only after the owner reviews the previous one and
  authorizes the next.
- Anything marked PROPOSED is a proposal, not a decision.
- Do not push, merge or open pull requests without the owner's
  explicit go-ahead in the current session.

## Scoping Rules

- Work on one unit from `specs/00-build-plan.md` at a time.
- Prefer small, verifiable increments over large speculative
  changes.
- Do not combine unrelated system boundaries in one step (for
  example a migration and a mobile screen).
- Build web and mobile versions of a screen as separate units unless
  the spec says otherwise.
- Do not add features, screens or fields that no spec asks for.
- Do not implement proposal or agreement interactions until
  `specs/state-model.md` §3–6 are approved.
- Do not add a package, service or dependency a unit does not need;
  record the reason for each one you add.

## When to Split Work

Split a step if it combines:
- Database migrations and UI changes.
- Domain rule changes and screen changes.
- More than one API resource.
- Web and mobile screens.
- Behavior not clearly defined in a spec.

If a change cannot be verified end to end quickly, split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files or
  specs.
- If a requirement is ambiguous, propose the resolution in the
  relevant spec and mark it PROPOSED before implementing.
- If a requirement is missing, add it to Open Questions in
  `progress-tracker.md`, implement the smallest safe default only if
  it is reversible, and say which default you chose.
- Never fill a gap around money, identity, safety or privacy with a
  default. Stop and ask.

## Protected Files

Do not modify without explicit instruction:
- `assets/` brand files (the logo is never redrawn, recolored or
  otherwise altered; use files exactly as supplied or as approved
  format conversions).
- Token values in `packages/shared` (change `ui-context.md` first,
  with approval, then update the code).
- Applied migrations in `supabase/migrations/` (add a new migration
  instead).
- Generated files and third-party library internals.
- Never commit secrets (keys, passwords, tokens), not even local
  development keys; CI runs a secret scan on every push.

## Keeping Docs in Sync

Update the relevant context file in the same change whenever
implementation changes:
- Architecture, boundaries or invariants → `architecture.md`.
- Storage or schema decisions → `architecture.md`.
- Conventions → `code-standards.md`.
- Visual tokens or component rules → `ui-context.md`.
- Feature scope → `project-overview.md` and the spec.

## Before Moving to the Next Unit

1. The unit's "Verify when done" checklist passes.
2. No invariant in `architecture.md` was violated.
3. Type check, lint and tests pass (`pnpm typecheck`, `pnpm lint`,
   `pnpm test`).
4. The web build passes (`pnpm build`) when web changed; the mobile
   app starts in Expo when mobile changed.
5. `progress-tracker.md` reflects the completed work and any new
   open questions.
6. Report honestly: say what was verified and what was not.
