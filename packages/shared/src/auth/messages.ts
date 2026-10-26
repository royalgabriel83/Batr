// Account messages. None of them says whether an email is registered
// (specs/05-auth-and-permissions.md, Acceptance Criteria).

export const AUTH_MESSAGES = {
  wrongCredentials: "Email or password is incorrect.",
  emailNotConfirmed: "Confirm your email before signing in. Use the link we sent when you signed up.",
  weakPassword: "Choose a different password. This one is too easy to guess.",
  rateLimited: "Too many attempts. Wait a few minutes, then try again.",
  network: "We couldn't reach BATR. Check your connection and try again.",
  unexpected: "Something went wrong. Try again.",
  linkInvalid: "This confirmation link has expired or was already used. Sign in, or request a new link.",
  resent: "If that address is waiting for confirmation, we've sent a new link.",
  displayNameSaved: "Display name saved.",
  // Password reset (specs/milestone-1.md, Password reset).
  resetSent: "If an account exists for this email, we've sent a link to reset your password.",
  resetLinkInvalid: "This link has expired or was already used. Request a new one.",
  samePassword: "Choose a password that is different from your current one.",
  passwordChanged: "Your password has been changed.",
} as const;

export type AuthMessageKey = keyof typeof AUTH_MESSAGES;
