import type { InputHTMLAttributes, ReactNode } from "react";
import { FieldShell, controlClasses, fieldMessageIds } from "./Field";
import { cx } from "./cx";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  helper?: ReactNode;
  error?: ReactNode;
}

export function TextField({ id, label, helper, error, required, className, ...rest }: TextFieldProps) {
  const { describedBy, messageId } = fieldMessageIds(id, helper, error);
  return (
    <FieldShell id={id} label={label} required={required} helper={helper} error={error} messageId={messageId} className={className}>
      <input
        {...rest}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(controlClasses(Boolean(error)), "h-11")}
      />
    </FieldShell>
  );
}
