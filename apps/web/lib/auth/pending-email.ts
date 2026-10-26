import { cookies, headers } from "next/headers";

// Between sign-up and confirmation, the address is kept in a short-lived
// http-only cookie so the check-email page can show it and resend the
// link, without putting the address in the URL.

const COOKIE = "batr_pending_email";

export async function requestOrigin(): Promise<string> {
  const list = await headers();
  // Next.js only runs a server action when Origin matches the host.
  const origin = list.get("origin");
  if (origin) return origin;
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  return `${list.get("x-forwarded-proto") ?? "http"}://${host}`;
}

/** Where the confirmation email links to. Supabase only allows listed URLs. */
export function confirmUrl(origin: string, next: string): string {
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export async function setPendingEmail(email: string): Promise<void> {
  const secure = (await requestOrigin()).startsWith("https:");
  (await cookies()).set(COOKIE, email, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 });
}

export async function getPendingEmail(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function clearPendingEmail(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
