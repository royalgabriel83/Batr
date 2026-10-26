import { cache } from "react";
import { redirect } from "next/navigation";
import { signInPathFor } from "@batr/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentMember {
  id: string;
  email: string;
  /** Null when sign-up metadata had no valid name; the account page asks for one. */
  displayName: string | null;
  memberSince: string;
}

/** The signed-in member for this request, or null. Checked with Supabase Auth. */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, created_at")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null; created_at: string }>();
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name ?? null,
    memberSince: profile?.created_at ?? user.created_at,
  };
});

/** For protected pages: the member, or a redirect to sign-in that returns to `path`. */
export async function requireMember(path: string): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) redirect(signInPathFor(path));
  return member;
}
