import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  /** A link or button. */
  action?: ReactNode;
  /** Heading level; defaults to h2. */
  as?: "h2" | "h3";
  role?: "alert";
  className?: string;
}

/**
 * Empty, error and "nothing here yet" panels (ui-context.md, States): a
 * calm white panel with the icon in soft green rings, a short title,
 * one line of help and at most one action.
 */
export function EmptyState({ icon, title, children, action, as: Heading = "h2", role, className }: EmptyStateProps) {
  return (
    <section
      role={role}
      className={cx(
        "flex flex-col items-center gap-3 rounded-xl border border-border-default bg-bg-surface px-6 py-12 text-center md:py-16",
        className,
      )}
    >
      {/* Rings around the icon, echoing the Saved page and the hero mark. */}
      <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-full border border-border-default">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-primary [&>svg]:size-7">{icon}</span>
      </span>
      <Heading className="mt-1 text-h3">{title}</Heading>
      {children ? <p className="max-w-md text-body text-text-secondary">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
