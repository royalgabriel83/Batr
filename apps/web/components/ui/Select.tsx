import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { FieldShell, controlClasses, fieldMessageIds } from "./Field";
import { cx } from "./cx";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  options: readonly SelectOption[];
  /** Text of the empty first option, for example "Choose a category". */
  placeholder?: string;
  helper?: ReactNode;
  error?: ReactNode;
}

export function Select({ id, label, options, placeholder, helper, error, required, className, ...rest }: SelectProps) {
  const { describedBy, messageId } = fieldMessageIds(id, helper, error);
  return (
    <FieldShell id={id} label={label} required={required} helper={helper} error={error} messageId={messageId} className={className}>
      <div className="relative">
        <select
          {...rest}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(controlClasses(Boolean(error)), "h-11 appearance-none pr-10")}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-text-secondary" />
      </div>
    </FieldShell>
  );
}
