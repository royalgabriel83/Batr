import type { ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { cx } from "./cx";

export interface CheckboxOption {
  value: string;
  label: string;
}

export interface CheckboxGroupProps {
  /** Form field name; also used to build element ids. */
  name: string;
  legend: string;
  options: readonly CheckboxOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  helper?: ReactNode;
  error?: ReactNode;
  className?: string;
}

/**
 * Several choices from a short list, drawn like SegmentedControl but
 * with native checkboxes, so keyboard and screen readers work as they
 * do for any checkbox. A tick marks each chosen option, so the state
 * never depends on colour alone.
 */
export function CheckboxGroup({ name, legend, options, value, onChange, helper, error, className }: CheckboxGroupProps) {
  const errorId = `${name}-error`;
  const helperId = `${name}-helper`;
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset
      className={cx("flex flex-col gap-1.5", className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    >
      <legend className="mb-1.5 text-body-sm font-semibold text-text-primary">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const checked = value.includes(option.value);
          return (
            <div key={option.value} className="relative">
              <input
                type="checkbox"
                id={id}
                name={name}
                value={option.value}
                checked={checked}
                onChange={(event) =>
                  onChange(event.target.checked ? [...value, option.value] : value.filter((item) => item !== option.value))
                }
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cx(
                  "flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border bg-bg-surface px-4 text-body-sm font-medium text-text-primary",
                  error ? "border-state-danger" : "border-border-strong",
                  "peer-checked:border-2 peer-checked:border-accent-primary peer-checked:bg-accent-soft peer-checked:text-accent-primary-hover",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
                )}
              >
                {checked ? <Check aria-hidden="true" className="size-4" /> : null}
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
      {helper ? (
        <p id={helperId} className="text-body-sm text-text-secondary">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-body-sm text-state-danger">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
