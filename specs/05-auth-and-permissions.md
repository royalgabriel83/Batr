# Feature Spec: Authentication and Permissions

Web in Milestone 1 (email and password only; `milestone-1.md` is
authoritative for that milestone); mobile in Milestone 2. Access
rules: `state-model.md` §7. OAuth is deferred.

## Goal

People can create an account, sign in and out on web and mobile, and
every private resource is accessible only to the people the rules
allow, enforced on the server and in the database.

## User Journey

1. **Sign up:** email + password, or OAuth providers (PROPOSED:
   Google and Apple; Apple required on iOS if any social login is
   offered). Accept terms. Verify email.
2. **Profile setup:** display name (required), avatar (optional).
3. **Sign in** with the same methods; "Forgot password" by email
   (web in Milestone 1, unit 08c; mobile in Milestone 2).
4. **Session:** stays signed in; web via secure cookie, mobile via
   secure storage with refresh.
5. **Sign out** from profile menu; on mobile clears secure storage.
6. Acting while signed out (Propose, Create offer) prompts sign-in
   and returns the member to where they were.

## Design and UI States

- Auth screens use the dark brand frame (`--bg-inverse`) with the
  logo and a white form card; mobile is form-only with the logo above.
- States: idle, submitting, field errors, wrong credentials (generic
  message), email not verified (resend link), rate limited, network
  error, success redirect.

## Data Requirements

- Auth provider user record (id, email, verified).
- `profiles`: id (= auth user id), display_name, created_at
  (Milestone 1). Later: avatar_path (profile photos, Milestone 2);
  role (`member | moderator`) and status (`active | suspended`) only
  if moderation is approved (open question 10).

## Permissions Matrix

| Resource / action | Visitor | Member | Owner / party | Moderator (if approved) |
| --- | --- | --- | --- | --- |
| Read active offer | yes (D6) | yes | yes | yes |
| Read draft/paused/closed offer | no | no | owner | yes |
| Create offer | no | yes | — | — |
| Edit / pause / close offer | no | no | owner | close only |
| Create proposal | no | yes (not on own offer) | — | — |
| Read proposal, messages | no | no | the two parties | yes |
| Counter / accept / decline | no | no | turn party | no |
| Read agreement | no | no | the two parties | yes |
| Confirm handover / cancel | no | no | the two parties | no |
| Edit profile | no | own only | — | — |

Rules are implemented once in `packages/shared`, enforced
in every API handler, and mirrored by row-level-security policies.

## Validation

- Email format; password at least 10 characters (APPROVED), checked
  against the provider's breached-password check if available.
- Display name 2–40 characters, no URLs.
- Rate limits on sign-in, sign-up and reset requests.

## Failure Cases

- Wrong password → generic "Email or password is incorrect".
- Expired session → silent refresh; if that fails, sign-in prompt
  that preserves unsaved form state.
- Suspended member (if moderation approved) → signed in but all
  mutations return `FORBIDDEN` with an explanation.
- Deleted account → open question (data retention).

## Acceptance Criteria

- [ ] A new person can sign up, verify email, set a display name and
      land on Account (owner decision, unit 05), on web and mobile
      (mobile met in Milestone 2).
- [ ] Sign out clears the session; protected pages redirect to
      sign-in and return afterwards.
- [ ] Every protected API route returns `UNAUTHENTICATED` without a
      session (automated test enumerates routes).
- [ ] Each row of the permissions matrix has an API test proving the
      allowed and denied cases.
- [ ] Direct database access with a member's token cannot read
      another pair's proposals (RLS test).
- [ ] Mobile tokens are stored only in secure storage (Milestone 2).
- [ ] Error messages do not reveal whether an email is registered.

## Open Questions

Identity verification and phone (11), minimum age (12), moderation
(10), account deletion and data retention, and which OAuth providers.
