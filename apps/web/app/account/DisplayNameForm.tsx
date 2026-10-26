"use client";

import { useEffect, useRef, useState } from "react";
import { AUTH_LIMITS } from "@batr/shared";
import { Button, FormAlert, MemberInitial, TextField } from "@/components/ui";
import { useFormAction } from "@/lib/forms/use-form-action";
import { setDisplayName } from "./actions";

/**
 * The display-name row on Account (owner, 2026-10-17): the name with a
 * **Change** action that opens the form in place. Without a name yet,
 * the form is open from the start. After saving, the row closes and the
 * saved message stays.
 */
export function DisplayNameForm({ current }: { current: string | null }) {
  const [state, action, pending] = useFormAction(setDisplayName, {
    values: { display_name: current ?? "" },
    errors: {},
  });
  const [open, setOpen] = useState(!current);
  const [focusTarget, setFocusTarget] = useState<"field" | "change" | null>(null);
  const [handled, setHandled] = useState(state);
  const changeButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLDivElement>(null);

  // A successful save closes the row (adjusted during render, not in an effect).
  if (state !== handled) {
    setHandled(state);
    if (state.message?.tone === "success") {
      setOpen(false);
      setFocusTarget("change");
    }
  }

  // Focus follows the row: into the field when it opens, back to Change when it closes.
  useEffect(() => {
    if (open && focusTarget === "field") field.current?.querySelector("input")?.focus();
    if (!open && focusTarget === "change") changeButton.current?.focus();
  }, [open, focusTarget]);

  const saved = state.message?.tone === "success" ? state.message : null;
  return (
    <div className="flex flex-col gap-3">
      {open ? (
        <form action={action} noValidate className="flex flex-col gap-4">
          {state.message && !saved ? <FormAlert tone={state.message.tone}>{state.message.text}</FormAlert> : null}
          <div ref={field}>
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
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              Save display name
            </Button>
            {current ? (
              <Button
                variant="tertiary"
                onClick={() => {
                  setFocusTarget("change");
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
          <dt className="text-body-sm text-text-secondary">Display name</dt>
          <dd className="flex min-w-0 items-center gap-3 text-body max-sm:col-start-1 max-sm:row-start-2">
            <MemberInitial name={current} size="md" />
            <span className="truncate">{current}</span>
          </dd>
          <dd className="max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:self-center">
            <Button
              ref={changeButton}
              variant="tertiary"
              className="-mr-4"
              onClick={() => {
                setFocusTarget("field");
                setOpen(true);
              }}
            >
              Change<span className="sr-only"> display name</span>
            </Button>
          </dd>
        </dl>
      )}
      {saved && !open ? <FormAlert tone="success">{saved.text}</FormAlert> : null}
    </div>
  );
}
