import type { FormMessage, FormState } from "@/lib/forms/state";

export type SignUpState = FormState<{ email: string; display_name: string }, "email" | "password" | "display_name">;
export type SignInState = FormState<{ email: string }, "email" | "password"> & { unconfirmed?: boolean };
export type ResetRequestState = FormState<{ email: string }, "email">;
// The new password is never sent back to the form.
export type NewPasswordState = FormState<Record<string, never>, "password">;
export interface ResendState {
  message?: FormMessage;
}

export const initialSignUpState: SignUpState = { values: { email: "", display_name: "" }, errors: {} };
export const initialSignInState: SignInState = { values: { email: "" }, errors: {} };
export const initialResendState: ResendState = {};
export const initialResetRequestState: ResetRequestState = { values: { email: "" }, errors: {} };
export const initialNewPasswordState: NewPasswordState = { values: {}, errors: {} };
