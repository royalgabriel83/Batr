import type { ReactNode } from "react";
import type { StatusTone } from "@batr/shared";
import { cx } from "./cx";

/** Same tones as the shared status labels, so every label maps to a badge. */
export type BadgeTone = StatusTone;

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-bg-subtle text-text-secondary",
  success: "bg-state-success-soft text-state-success",
  warning: "bg-state-warning-soft text-state-warning",
  danger: "bg-state-danger-soft text-state-danger",
  info: "bg-state-info-soft text-state-info",
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Required: status is never shown by color alone (ui-context.md). */
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Icon + label. Status labels come from the shared status-label
 * function (unit 03); this component only renders them.
 */
export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption [&_svg]:size-4",
        toneClasses[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
      {children}
    </span>
  );
}
