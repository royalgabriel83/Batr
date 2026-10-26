"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AUTH_MESSAGES, DisplayNameInputSchema, checkAuthInput } from "@batr/shared";
import { formText } from "@/lib/forms/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DisplayNameState } from "./form-state";

export async function setDisplayName(_state: DisplayNameState, data: FormData): Promise<DisplayNameState> {
  const values = { display_name: formText(data, "display_name") };
  const checked = checkAuthInput(DisplayNameInputSchema, values);
  if (!checked.ok) return { values, errors: checked.errors };

  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase.rpc("profile_set_display_name", {
    p_display_name: checked.data.display_name,
  });
  if (error) {
    // 401: the session ended while the page was open.
    if (error.code === "PT401" || error.code === "42501") redirect("/sign-in?next=%2Faccount");
    return { values, errors: {}, message: { tone: "danger", text: AUTH_MESSAGES.unexpected } };
  }
  revalidatePath("/", "layout");
  const saved = (profile as { display_name: string }).display_name;
  return { values: { display_name: saved }, errors: {}, message: { tone: "success", text: AUTH_MESSAGES.displayNameSaved } };
}

/** Ends this browser's session (other devices stay signed in). */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/");
}
