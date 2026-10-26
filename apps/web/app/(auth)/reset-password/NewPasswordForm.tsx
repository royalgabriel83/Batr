"use client";

import { AUTH_LIMITS } from "@batr/shared";
import { Button, FormAlert, TextField } from "@/components/ui";
import { useFormAction } from "@/lib/forms/use-form-action";
import { setNewPassword } from "../actions";
import { initialNewPasswordState } from "../form-state";

export function NewPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useFormAction(setNewPassword, initialNewPasswordState);
  return (
    <div className="flex flex-col gap-4">
      {state.message ? <FormAlert tone={state.message.tone}>{state.message.text}</FormAlert> : null}
      <form action={action} noValidate className="flex flex-col gap-4">
        {/* Lets password managers store the new password against the right account. */}
        <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
        <TextField
          id="password"
          name="password"
          type="password"
          label="New password"
          autoComplete="new-password"
          helper={`At least ${String(AUTH_LIMITS.passwordMin)} characters.`}
          required
          error={state.errors.password}
        />
        <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
          Save new password
        </Button>
      </form>
    </div>
  );
}
