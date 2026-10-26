import type { OfferStatus } from "./constants.ts";

// Error codes and HTTP statuses from specs/milestone-1.md (Error states).
export const API_ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  // Milestone 3: a referenced offer changed after these terms were sent.
  TERMS_CHANGED: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 422,
  UNSUPPORTED_FORMAT: 422,
  RATE_LIMITED: 429,
  // Milestone 7: text with a phone number, email or chat link.
  CONTACT_DETAILS: 422,
  INTERNAL: 500,
} as const;
export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

/** Default message for each code; responses may carry a more specific one. */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You can't change this offer.",
  NOT_FOUND: "This offer isn't available.",
  VALIDATION_FAILED: "Some details need fixing.",
  CONFLICT: "This offer was changed in another window or device. Review the latest version, then save again.",
  TERMS_CHANGED: "An item changed after these terms were sent. Counter with the latest details instead.",
  IDEMPOTENCY_KEY_REQUIRED: "Something went wrong. Try again.",
  IDEMPOTENCY_KEY_REUSED: "Something went wrong. Try again.",
  UNSUPPORTED_FORMAT: "This file isn't a supported photo. Please choose a JPEG, PNG or WebP photo.",
  RATE_LIMITED: "Too many attempts. Wait a few minutes, then try again.",
  CONTACT_DETAILS: "Phone numbers, emails and chat links can't be shared in BATR. Remove them to continue.",
  INTERNAL: "Something went wrong. Try again.",
};

/** Why a rule check refused an action on an offer. */
export type OfferRuleError =
  | { code: "UNAUTHENTICATED" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "CONFLICT"; reason: "status_changed"; current_status: OfferStatus | null }
  | { code: "CONFLICT"; reason: "stale_revision"; current_revision: number };

export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: OfferRuleError };
