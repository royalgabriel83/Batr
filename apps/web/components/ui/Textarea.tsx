"use client";

import { useState, type ChangeEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { FieldShell, controlClasses, fieldMessageIds } from "./Field";
import { cx } from "./cx";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label: string;
  helper?: ReactNode;
  error?: ReactNode;
  /** Shows a character counter when set. */
  maxLength?: number;
}

export function Textarea({ id, label, helper, error, required, maxLength, className, onChange, value, defaultValue, ...rest }: TextareaProps) {
  const [length, setLength] = useState(String(value ?? defaultValue ?? "").length);
  const counterId = `${id}-counter`;
  const { describedBy, messageId } = fieldMessageIds(id, helper, error, maxLength ? counterId : undefined);
  const shownLength = value === undefined ? length : String(value).length;

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setLength(event.target.value.length);
    onChange?.(event);
  }

  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      helper={helper}
      error={error}
      messageId={messageId}
      className={className}
      aside={
        maxLength ? (
          <span id={counterId} className="text-caption text-text-muted tabular-nums">
            {shownLength} / {maxLength}
            <span className="sr-only"> characters</span>
          </span>
        ) : null
      }
    >
      <textarea
        {...rest}
        id={id}
        value={value}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        onChange={handleChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(controlClasses(Boolean(error)), "min-h-28 py-2.5")}
      />
    </FieldShell>
  );
}
