"use client";

import { Button, FormAlert } from "@/components/ui";
import { useFormAction } from "@/lib/forms/use-form-action";
import { resendConfirmation } from "./actions";
import { initialResendState } from "./form-state";

/** "Send the link again", for the check-email page and unconfirmed sign-ins. */
export function ResendForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useFormAction(resendConfirmation, initialResendState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      {state.message ? <FormAlert tone={state.message.tone}>{state.message.text}</FormAlert> : null}
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        Send the link again
      </Button>
    </form>
  );
}
