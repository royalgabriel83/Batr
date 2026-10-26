import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeReturnPath } from "@batr/shared";
import { clearPendingEmail } from "@/lib/auth/pending-email";
import { clearRecoveryMarker, markRecoverySession } from "@/lib/auth/recovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The link in the confirmation and password-reset emails. Verifies the
 * one-time token with Supabase, which signs the member in. A
 * confirmation returns them to where they were going; a reset link goes
 * to /reset-password, marked as a reset session (lib/auth/recovery.ts).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  if (tokenHash && type === "recovery") {
    const supabase = await createSupabaseServerClient();
    await clearRecoveryMarker();
    const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error && data.session && (await markRecoverySession(supabase, data.session.access_token))) {
      redirect("/reset-password");
    }
    redirect("/forgot-password?error=link");
  }

  if (tokenHash && type === "email") {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (!error) {
      await clearPendingEmail();
      redirect(safeReturnPath(params.get("next")));
    }
  }
  redirect("/sign-in?error=link");
}
