import { AUTH_MESSAGES, type AuthMessageKey } from "./messages.ts";

/** The parts of a Supabase Auth error the apps look at. */
export interface AuthErrorLike {
  name?: string;
  code?: string | undefined;
  status?: number | undefined;
}

/**
 * Turns a Supabase Auth error into one of the approved messages. Every
 * credential problem becomes the same generic message, so the page
 * never reveals whether an email is registered. Shared by the web and
 * the mobile app (Milestone 2).
 */
export function authErrorKey(error: AuthErrorLike): AuthMessageKey {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return "rateLimited";
  }
  if (error.code === "email_not_confirmed") return "emailNotConfirmed";
  if (error.code === "invalid_credentials") return "wrongCredentials";
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return "network";
  return "unexpected";
}

export const authErrorMessage = (error: AuthErrorLike): string => AUTH_MESSAGES[authErrorKey(error)];
