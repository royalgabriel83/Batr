import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PRODUCT_NAME } from "@batr/shared";
import { isRecoverySession } from "@/lib/auth/recovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/server/auth";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: `Choose a new password · ${PRODUCT_NAME}` };

/** Reached only from a reset link; any other visit asks for a new link. */
export default async function ResetPasswordPage() {
  const member = await getCurrentMember();
  if (!member || !(await isRecoverySession(await createSupabaseServerClient()))) redirect("/forgot-password?error=link");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">Choose a new password</h1>
        <p className="text-body-sm text-text-secondary break-words">For {member.email}</p>
      </div>
      <NewPasswordForm email={member.email} />
    </div>
  );
}
