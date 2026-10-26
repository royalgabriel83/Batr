import { cookies } from "next/headers";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestOrigin } from "./pending-email";

// A reset link signs the person in with an ordinary session; Supabase
// marks it the same way as a confirmation link, so the app cannot tell
// the two apart from the session alone. The link handler therefore
// records the new session's id in a short-lived http-only cookie, and
// /reset-password accepts only a session whose id matches it
// (specs/milestone-1.md, Password reset). The cookie lasts one hour,
// like the link.

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const COOKIE = "batr_recovery";
const MAX_AGE_SECONDS = 60 * 60;

/** The id of the session in `accessToken`, read from Supabase Auth's verified claims. */
async function sessionIdOf(supabase: SupabaseClient, accessToken?: string): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims(accessToken);
  if (error || !data) return null;
  const id: unknown = data.claims.session_id;
  return typeof id === "string" && id !== "" ? id : null;
}

export async function markRecoverySession(supabase: SupabaseClient, accessToken: string): Promise<boolean> {
  const id = await sessionIdOf(supabase, accessToken);
  if (!id) return false;
  const secure = (await requestOrigin()).startsWith("https:");
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: MAX_AGE_SECONDS });
  return true;
}

/** True only when the current session is the one a reset link started. */
export async function isRecoverySession(supabase: SupabaseClient): Promise<boolean> {
  const marked = (await cookies()).get(COOKIE)?.value;
  if (!marked) return false;
  return (await sessionIdOf(supabase)) === marked;
}

export async function clearRecoveryMarker(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
