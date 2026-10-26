"use client";

import Link from "next/link";
import { Button, FormAlert, TextField } from "@/components/ui";
import { useFormAction } from "@/lib/forms/use-form-action";
import { signIn } from "../actions";
import { initialSignInState } from "../form-state";
import { ResendForm } from "../ResendForm";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useFormAction(signIn, initialSignInState);
  return (
    <div className="flex flex-col gap-4">
      {state.message ? (
        <FormAlert tone={state.message.tone}>{state.message.text}</FormAlert>
      ) : null}
      {state.unconfirmed ? <ResendForm email={state.values.email} next={next} /> : null}
      <form action={action} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
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
          autoComplete="current-password"
          required
          error={state.errors.password}
        />
        <Link
          href={`/forgot-password?next=${encodeURIComponent(next)}`}
          className="-mt-1 self-start py-2.5 text-body-sm font-semibold text-accent-primary underline"
        >
          Forgot password?
        </Link>
        <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </div>
  );
}
