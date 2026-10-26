"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonSurface = "light" | "inverse";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** `inverse` when the button sits on the dark brand frame. */
  surface?: ButtonSurface;
  /** Shown as `aria-disabled`; the button stays focusable but does nothing. */
  disabled?: boolean;
  /** Replaces the label with a spinner without changing the width. */
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const variantClasses: Record<ButtonSurface, Record<ButtonVariant, string>> = {
  light: {
    primary: "bg-accent-primary text-text-on-accent enabled-hover:bg-accent-primary-hover",
    secondary: "bg-bg-surface text-text-primary border border-border-strong enabled-hover:bg-bg-subtle",
    tertiary: "bg-transparent text-accent-primary enabled-hover:underline",
    danger: "bg-state-danger text-text-on-accent enabled-hover:brightness-90",
  },
  inverse: {
    primary: "bg-accent-on-inverse text-bg-inverse enabled-hover:brightness-110",
    secondary: "bg-transparent text-text-on-inverse border border-text-on-inverse-muted enabled-hover:bg-text-on-inverse/10",
    tertiary: "bg-transparent text-accent-on-inverse enabled-hover:underline",
    danger: "bg-state-danger text-text-on-accent enabled-hover:brightness-90",
  },
};

// Visual heights 32 / 40 / 48.
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body-sm",
  md: "h-10 px-4 text-body-sm",
  lg: "h-12 px-5 text-body",
};

// The ::before layer extends the hit area of sm and md to the 44px
// minimum touch target. A border sits outside that layer's box, so
// bordered (secondary) buttons reach 1px further on each side.
const hitAreaClasses: Record<"plain" | "bordered", Record<ButtonSize, string>> = {
  plain: { sm: "before:-inset-y-1.5", md: "before:-inset-y-0.5", lg: "" },
  bordered: { sm: "before:-inset-y-[7px]", md: "before:-inset-y-[3px]", lg: "" },
};

export function Button({
  variant = "primary",
  size = "md",
  surface = "light",
  disabled = false,
  loading = false,
  icon,
  className,
  onClick,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...rest}
      type={type}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      data-enabled={inactive ? undefined : ""}
      onClick={handleClick}
      className={cx(
        "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold",
        "before:absolute before:inset-x-0 before:content-['']",
        // Press: a slight give while held (ui-context.md, Motion).
        "transition-[color,background-color,border-color,scale] duration-fast ease-standard data-enabled:active:scale-[0.97]",
        variantClasses[surface][variant],
        sizeClasses[size],
        hitAreaClasses[variant === "secondary" ? "bordered" : "plain"][size],
        disabled && "opacity-40 cursor-not-allowed",
        loading && "cursor-progress",
        className,
      )}
    >
      {/* Icons: 16px beside 14px labels, 20px beside 16px labels (ui-context.md, Icons). */}
      <span
        className={cx(
          "inline-flex items-center gap-2",
          size === "lg" ? "[&>svg]:size-5 [&>svg]:[stroke-width:1.75]" : "[&>svg]:size-4",
          loading && "invisible",
        )}
      >
        {icon}
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          <span className="sr-only">Loading</span>
        </span>
      ) : null}
    </button>
  );
}
