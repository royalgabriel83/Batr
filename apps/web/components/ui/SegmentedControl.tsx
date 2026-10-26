import type { ChangeEventHandler, ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cx } from "./cx";

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  /** Form field name; also used to build element ids. */
  name: string;
  legend: string;
  options: readonly SegmentedOption[];
  required?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  error?: ReactNode;
  className?: string;
}

/**
 * A short closed choice (for example condition). Built from native
 * radio buttons, so arrow keys, form submission and screen readers
 * work without extra script.
 */
export function SegmentedControl({ name, legend, options, required, value, defaultValue, onChange, error, className }: SegmentedControlProps) {
  const errorId = `${name}-error`;
  return (
    <fieldset
      className={cx("flex flex-col gap-1.5", className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1.5 text-body-sm font-semibold text-text-primary">
        {legend}
        {required ? <span className="font-normal text-text-secondary"> (required)</span> : null}
      </legend>
      <div className={cx("flex flex-wrap gap-2")}>
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <div key={option.value} className="relative">
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                required={required}
                checked={value === undefined ? undefined : value === option.value}
                defaultChecked={defaultValue === undefined ? undefined : defaultValue === option.value}
                onChange={onChange}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cx(
                  "flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border bg-bg-surface px-4 text-body-sm font-medium text-text-primary",
                  error ? "border-state-danger" : "border-border-strong",
                  "peer-checked:border-2 peer-checked:border-accent-primary peer-checked:bg-accent-soft peer-checked:text-accent-primary-hover",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
                )}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-body-sm text-state-danger">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
