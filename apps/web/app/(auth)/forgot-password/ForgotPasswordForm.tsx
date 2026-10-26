"use client";

import { Button, FormAlert, TextField } from "@/components/ui";
import { useFormAction } from "@/lib/forms/use-form-action";
import { requestPasswordReset } from "../actions";
import { initialResetRequestState } from "../form-state";

export function ForgotPasswordForm() {
  const [state, action, pending] = useFormAction(requestPasswordReset, initialResetRequestState);
  return (
    <div className="flex flex-col gap-4">
      {state.message ? <FormAlert tone={state.message.tone}>{state.message.text}</FormAlert> : null}
      <form action={action} noValidate className="flex flex-col gap-4">
        <TextField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          defaultValue={state.values.email}
          error={state.errors.email}
        />
        <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
          Send reset link
        </Button>
      </form>
    </div>
  );
}
