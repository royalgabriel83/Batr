"use client";

import { AUTH_LIMITS } from "@batr/shared";
import { Button, FormAlert, TextField } from "@/components/ui";
import { useFormAction } from "@/lib/forms/use-form-action";
import { signUp } from "../actions";
import { initialSignUpState } from "../form-state";

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useFormAction(signUp, initialSignUpState);
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {state.message ? <FormAlert tone={state.message.tone}>{state.message.text}</FormAlert> : null}
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
      <TextField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        helper={`At least ${String(AUTH_LIMITS.passwordMin)} characters.`}
        error={state.errors.password}
      />
      <TextField
        id="display_name"
        name="display_name"
        label="Display name"
        autoComplete="nickname"
        required
        maxLength={AUTH_LIMITS.displayNameMax}
        helper="Shown to other members on your offers."
        defaultValue={state.values.display_name}
        error={state.errors.display_name}
      />
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Create account
      </Button>
    </form>
  );
}
