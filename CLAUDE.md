# BATR

BATR is a peer-to-peer exchange marketplace for web and native mobile.
Status: Milestone 1 in progress (unit by unit). The stack and the
Milestone 1 specification are approved; see
`context/progress-tracker.md` for what is built and what is still
pending approval.

## Application Building Context

Read the following files in order before implementing
or making any architectural decision:

1. `context/project-overview.md` — product definition,
   goals, features, and scope
2. `context/architecture.md` — system structure,
   boundaries, storage model, and invariants
3. `context/ui-context.md` — theme, colors, typography,
   and component conventions
4. `context/code-standards.md` — implementation rules
   and conventions
5. `context/ai-workflow-rules.md` — development workflow,
   scoping rules, and delivery approach
6. `context/progress-tracker.md` — current phase,
   completed work, open questions, and next steps

Feature-level requirements live in `specs/`. Read
`specs/00-build-plan.md` first, then `specs/state-model.md`,
then the milestone or feature spec for the unit you are
implementing. The context files hold
project-wide rules; specs hold feature detail. Do not copy
one into the other.

Update `context/progress-tracker.md` after each
meaningful implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.

Anything marked **PROPOSED** in these files is not yet
approved. Do not build on a PROPOSED decision that is hard to
reverse (stack, database schema, auth provider, package
installs) until the tracker records it as approved.
