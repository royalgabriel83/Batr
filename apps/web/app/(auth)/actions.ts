"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AUTH_MESSAGES,
  EmailSchema,
  NewPasswordInputSchema,
  PasswordResetRequestSchema,
  SignInInputSchema,
  SignUpInputSchema,
  checkAuthInput,
  safeReturnPath,
} from "@batr/shared";
import { authErrorKey } from "@/lib/auth/errors";
import { confirmUrl, getPendingEmail, requestOrigin, setPendingEmail } from "@/lib/auth/pending-email";
import { clearRecoveryMarker, isRecoverySession } from "@/lib/auth/recovery";
import { formText } from "@/lib/forms/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NewPasswordState, ResendState, ResetRequestState, SignInState, SignUpState } from "./form-state";

export async function signUp(_state: SignUpState, data: FormData): Promise<SignUpState> {
  const values = { email: formText(data, "email"), display_name: formText(data, "display_name") };
  const checked = checkAuthInput(SignUpInputSchema, { ...values, password: formText(data, "password") });
  if (!checked.ok) return { values, errors: checked.errors };

  const { email, password, display_name } = checked.data;
  const next = safeReturnPath(formText(data, "next"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: confirmUrl(await requestOrigin(), next), data: { display_name } },
  });
  // A registered address gets exactly the same next page as a new one,
  // so the form never reveals who has an account.
  if (error && error.code !== "user_already_exists" && error.code !== "email_exists") {
    if (error.code === "weak_password") return { values, errors: { password: AUTH_MESSAGES.weakPassword } };
    return { values, errors: {}, message: { tone: "danger", text: AUTH_MESSAGES[authErrorKey(error)] } };
  }
  await setPendingEmail(email);
  redirect(`/sign-up/check-email?next=${encodeURIComponent(next)}`);
}

export async function signIn(_state: SignInState, data: FormData): Promise<SignInState> {
  const values = { email: formText(data, "email") };
  const checked = checkAuthInput(SignInInputSchema, { ...values, password: formText(data, "password") });
  if (!checked.ok) return { values, errors: checked.errors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(checked.data);
  if (error) {
    const key = authErrorKey(error);
    return { values, errors: {}, message: { tone: "danger", text: AUTH_MESSAGES[key] }, unconfirmed: key === "emailNotConfirmed" };
  }
  revalidatePath("/", "layout");
  redirect(safeReturnPath(formText(data, "next")));
}

/** Sends the confirmation link again. The reply never says whether the address exists. */
export async function resendConfirmation(_state: ResendState, data: FormData): Promise<ResendState> {
  const email = EmailSchema.safeParse(formText(data, "email") || (await getPendingEmail()) || "");
  if (!email.success) return { message: { tone: "danger", text: AUTH_MESSAGES.unexpected } };

  const next = safeReturnPath(formText(data, "next"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.data,
    options: { emailRedirectTo: confirmUrl(await requestOrigin(), next) },
  });
  const key = error ? authErrorKey(error) : null;
  if (key === "rateLimited" || key === "network") return { message: { tone: "danger", text: AUTH_MESSAGES[key] } };
  return { message: { tone: "success", text: AUTH_MESSAGES.resent } };
}

/**
 * Forgot password: asks Supabase Auth to email a reset link. Registered,
 * unregistered and unconfirmed addresses get the same reply; only rate
 * limits and network failures are reported, as on the resend form.
 */
export async function requestPasswordReset(_state: ResetRequestState, data: FormData): Promise<ResetRequestState> {
  const values = { email: formText(data, "email") };
  const checked = checkAuthInput(PasswordResetRequestSchema, values);
  if (!checked.ok) return { values, errors: checked.errors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(checked.data.email, {
    redirectTo: confirmUrl(await requestOrigin(), "/reset-password"),
  });
  const key = error ? authErrorKey(error) : null;
  if (key === "rateLimited" || key === "network") return { values, errors: {}, message: { tone: "danger", text: AUTH_MESSAGES[key] } };
  return { values, errors: {}, message: { tone: "success", text: AUTH_MESSAGES.resetSent } };
}

/**
 * Sets a new password. Only the session a reset link started may do
 * this; afterwards every other session of the member is signed out and
 * this one carries on as an ordinary session.
 */
export async function setNewPassword(_state: NewPasswordState, data: FormData): Promise<NewPasswordState> {
  const supabase = await createSupabaseServerClient();
  if (!(await isRecoverySession(supabase))) redirect("/forgot-password?error=link");

  const checked = checkAuthInput(NewPasswordInputSchema, { password: formText(data, "password") });
  if (!checked.ok) return { values: {}, errors: checked.errors };

  const { error } = await supabase.auth.updateUser({ password: checked.data.password });
  if (error) {
    if (error.code === "same_password") return { values: {}, errors: { password: AUTH_MESSAGES.samePassword } };
    if (error.code === "weak_password") return { values: {}, errors: { password: AUTH_MESSAGES.weakPassword } };
    return { values: {}, errors: {}, message: { tone: "danger", text: AUTH_MESSAGES[authErrorKey(error)] } };
  }

  const signedOut = await supabase.auth.signOut({ scope: "others" });
  if (signedOut.error) console.error("Other sessions could not be signed out after a password reset", signedOut.error.code);
  await clearRecoveryMarker();
  revalidatePath("/", "layout");
  redirect("/account?changed=password");
}
