import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cx } from "./cx";

export interface FieldMessageIds {
  describedBy: string | undefined;
  messageId: string;
}

export function fieldMessageIds(id: string, helper?: ReactNode, error?: ReactNode, extra?: string): FieldMessageIds {
  const messageId = `${id}-message`;
  const ids = [helper || error ? messageId : undefined, extra].filter(Boolean);
  return { describedBy: ids.length ? ids.join(" ") : undefined, messageId };
}

export interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  messageId: string;
  /** Extra content on the label row, for example a character counter. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label above, control, then helper text or an error that replaces it. */
export function FieldShell({ id, label, required, helper, error, messageId, aside, children, className }: FieldShellProps) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-body-sm font-semibold text-text-primary">
          {label}
          {required ? <span className="font-normal text-text-secondary"> (required)</span> : null}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={messageId} className="flex items-start gap-1.5 text-body-sm text-state-danger">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helper ? (
        <p id={messageId} className="text-body-sm text-text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export const controlClasses = (invalid: boolean) =>
  cx(
    "w-full rounded-lg border bg-bg-surface px-3 text-body text-text-primary placeholder:text-text-muted",
    "disabled:cursor-not-allowed disabled:bg-bg-subtle disabled:text-text-muted",
    invalid ? "border-state-danger" : "border-border-strong",
  );
